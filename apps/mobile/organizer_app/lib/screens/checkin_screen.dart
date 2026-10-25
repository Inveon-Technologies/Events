import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../api.dart';
import '../services.dart';
import '../widgets/organizer_widgets.dart';
import 'shell.dart';

/// Stitch "live_check_in": camera QR scanner for one event, with a
/// success / rejected flash per scan, live counts, manual entry and the
/// recent check-ins of this session (undo-able). The API admits each
/// ticket exactly once, across every gate.
class CheckInScreen extends StatefulWidget {
  const CheckInScreen({super.key, this.initialEventId});

  final String? initialEventId;

  @override
  State<CheckInScreen> createState() => _CheckInScreenState();
}

enum _Outcome { success, rejected }

class _Flash {
  _Flash(this.outcome, this.title, this.subtitle);

  final _Outcome outcome;
  final String title;
  final String subtitle;
}

class _CheckInScreenState extends State<CheckInScreen> {
  final _scanner = MobileScannerController(detectionSpeed: DetectionSpeed.normal, formats: const [BarcodeFormat.qrCode]);
  List<OrganizerEvent>? _events;
  OrganizerEvent? _event;
  String? _loadError;
  bool _busy = false;
  bool _torch = false;
  String? _lastCode;
  DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);
  _Flash? _flash;
  Timer? _flashTimer;
  final _recent = <CheckIn>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _flashTimer?.cancel();
    _scanner.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      // 'all', not 'published': the server reports an event as 'completed'
      // as soon as its start time passes, which is exactly when the gate
      // needs it. Drafts and cancelled events can't be checked in.
      final page = await Services.read(context).api.events(status: 'all');
      final events = page.events.where((e) => e.status == 'published' || e.status == 'completed').toList()
        ..sort((a, b) => a.eventDate.compareTo(b.eventDate));
      // Today's (or the next) event first, unless one was picked.
      final now = DateTime.now().subtract(const Duration(hours: 12));
      final pick =
          events.where((e) => e.id == widget.initialEventId).firstOrNull ??
          events.where((e) => DateTime.parse(e.eventDate).isAfter(now)).firstOrNull ??
          events.lastOrNull;
      setState(() {
        _events = events;
        _event = pick;
        _loadError = null;
      });
    } on ApiException catch (e) {
      setState(() => _loadError = e.message);
    }
  }

  void _show(_Flash flash) {
    _flashTimer?.cancel();
    setState(() => _flash = flash);
    _flashTimer = Timer(const Duration(milliseconds: 2200), () {
      if (mounted) setState(() => _flash = null);
    });
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    final code = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
    if (code == null || _busy || _event == null) return;
    // The camera sees the same QR many times a second.
    if (code == _lastCode && DateTime.now().difference(_lastAt) < const Duration(seconds: 4)) return;
    _lastCode = code;
    _lastAt = DateTime.now();
    await _checkIn(() => Services.read(context).api.checkInQr(_event!.id, code));
  }

  Future<void> _checkIn(Future<CheckIn> Function() call) async {
    setState(() => _busy = true);
    try {
      final result = await call();
      HapticFeedback.heavyImpact();
      SystemSound.play(SystemSoundType.click);
      setState(() {
        _recent.insert(0, result);
        _event!.checkedInCount += 1;
      });
      _show(_Flash(_Outcome.success, result.attendeeName, '${result.tierName} · ${result.bookingReference}'));
    } on ApiException catch (e) {
      HapticFeedback.vibrate();
      final title = switch (e.body?['reasonCode']) {
        'already_checked_in' => 'Already checked in',
        'cancelled' => 'Ticket cancelled',
        'wrong_event' => 'Different event',
        'booking_not_confirmed' => 'Booking not confirmed',
        _ => e.status == 404 ? 'Ticket not found' : 'Could not check in',
      };
      _show(_Flash(_Outcome.rejected, title, e.message));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _undo(CheckIn c) async {
    try {
      await Services.read(context).api.undoCheckIn(_event!.id, c.ticketId);
      setState(() {
        _recent.remove(c);
        _event!.checkedInCount -= 1;
      });
      if (mounted) showMessage(context, 'Check-in undone for ${c.attendeeName}');
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    }
  }

  Future<void> _manual() async {
    final services = Services.read(context);
    final volunteer = services.user?.isGateVolunteer ?? false;
    final controller = TextEditingController();
    final query = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Enter ticket manually'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(hintText: volunteer ? 'Code under the QR' : 'Ticket ID, booking ID, name or phone'),
          onSubmitted: (v) => Navigator.of(ctx).pop(v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(controller.text), child: const Text('Find')),
        ],
      ),
    );
    final q = query?.trim() ?? '';
    if (q.isEmpty || !mounted) return;
    if (volunteer) {
      await _checkIn(() => services.api.checkInQr(_event!.id, q));
      return;
    }
    try {
      final matches = await services.api.findTickets(_event!.id, q);
      if (!mounted) return;
      if (matches.isEmpty) return showMessage(context, 'No ticket matches "$q" for this event', error: true);
      final picked = await showModalBottomSheet<TicketMatch>(
        context: context,
        showDragHandle: true,
        builder: (ctx) => ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            for (final t in matches)
              ListTile(
                leading: Icon(
                  t.status == 'checked_in' ? Icons.check_circle_rounded : Icons.confirmation_number_outlined,
                  color: t.status == 'valid' ? InveonColors.primary : InveonColors.muted,
                ),
                title: Text(t.attendeeName),
                subtitle: Text('${t.tierName} · ${t.bookingReference}'),
                trailing: StatusPill(t.status.replaceAll('_', ' '), tone: StatusPill.toneFor(t.status)),
                enabled: t.status == 'valid',
                onTap: () => Navigator.of(ctx).pop(t),
              ),
          ],
        ),
      );
      if (picked != null) await _checkIn(() => services.api.checkInTicket(_event!.id, picked.id));
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    }
  }

  Future<void> _switchEvent() async {
    final picked = await showModalBottomSheet<OrganizerEvent>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          for (final e in _events ?? const <OrganizerEvent>[])
            ListTile(
              leading: EventImage(url: e.bannerUrl, width: 48, height: 48, radius: 10),
              title: Text(e.name, maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text('${eventDay(e.eventDate)} · ${e.checkedInCount}/${e.ticketsSold} in'),
              trailing: e.id == _event?.id ? const Icon(Icons.check_rounded, color: InveonColors.primary) : null,
              onTap: () => Navigator.of(ctx).pop(e),
            ),
        ],
      ),
    );
    if (picked != null) setState(() => _event = picked);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (_loadError != null) {
      return Scaffold(
        appBar: const WorkspaceHeader(),
        body: EmptyState(
          icon: Icons.wifi_off_rounded,
          title: "Couldn't load events",
          message: _loadError!,
          action: 'Try again',
          onAction: _load,
        ),
      );
    }
    if (_events == null) return const Scaffold(appBar: WorkspaceHeader(), body: SkeletonList());
    if (_event == null) {
      return const Scaffold(
        appBar: WorkspaceHeader(),
        body: EmptyState(icon: Icons.event_busy_rounded, title: 'No events to check in', message: 'Publish an event to start checking people in.'),
      );
    }
    final e = _event!;
    final remaining = (e.ticketsSold - e.checkedInCount).clamp(0, 1 << 30);
    return Scaffold(
      appBar: const WorkspaceHeader(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
        children: [
          Row(
            children: [
              Text('Live Check-In', style: text.headlineSmall),
              const SizedBox(width: 8),
              const StatusPill('LIVE', tone: PillTone.green, dot: true),
              const Spacer(),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                onPressed: () {
                  _scanner.toggleTorch();
                  setState(() => _torch = !_torch);
                },
                icon: Icon(_torch ? Icons.flash_on_rounded : Icons.flash_off_rounded, size: 18),
                label: const Text('Torch'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          InveonCard(
            padding: const EdgeInsets.all(12),
            onTap: (_events?.length ?? 0) > 1 ? _switchEvent : null,
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: InveonColors.surfaceTint, borderRadius: BorderRadius.circular(InveonRadius.md)),
                  child: const Icon(Icons.landscape_rounded, color: InveonColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('ACTIVE EVENT', style: text.labelSmall?.copyWith(color: InveonColors.primary)),
                      Text(
                        e.name,
                        style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(eventDay(e.eventDate), style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                    ],
                  ),
                ),
                if ((_events?.length ?? 0) > 1)
                  const Text(
                    'Switch',
                    style: TextStyle(color: InveonColors.primary, fontWeight: FontWeight.w700),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _ScannerPanel(scanner: _scanner, onDetect: _onDetect, flash: _flash, busy: _busy, onManual: _manual),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _CountCard(
                  label: 'CHECKED IN',
                  value: e.checkedInCount,
                  unit: 'attendees',
                  color: InveonColors.success,
                  background: InveonColors.successBg,
                  progress: e.ticketsSold == 0 ? 0 : e.checkedInCount / e.ticketsSold,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _CountCard(
                  label: 'REMAINING',
                  value: remaining,
                  unit: 'of ${e.ticketsSold}',
                  color: InveonColors.primary,
                  background: Colors.white,
                  progress: e.ticketsSold == 0 ? 0 : remaining / e.ticketsSold,
                ),
              ),
            ],
          ),
          if (_recent.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 20, 0, 8),
              child: Text('Recent Check-Ins', style: text.titleLarge),
            ),
            for (final c in _recent.take(15))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Dismissible(
                  key: ValueKey(c.ticketId),
                  direction: DismissDirection.endToStart,
                  confirmDismiss: (_) async {
                    await _undo(c);
                    return false;
                  },
                  background: Container(
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    decoration: BoxDecoration(color: InveonColors.errorBg, borderRadius: BorderRadius.circular(InveonRadius.lg)),
                    child: const Text(
                      'Undo',
                      style: TextStyle(color: InveonColors.error, fontWeight: FontWeight.w700),
                    ),
                  ),
                  child: InveonCard(
                    radius: InveonRadius.lg,
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        const CircleAvatar(
                          backgroundColor: InveonColors.successBg,
                          child: Icon(Icons.check_rounded, color: InveonColors.success),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(c.attendeeName, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                              Text('${c.tierName} · ${timeAgo(c.at)}', style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                            ],
                          ),
                        ),
                        const StatusPill('Verified', tone: PillTone.green),
                      ],
                    ),
                  ),
                ).animate().fadeIn().slideX(begin: -0.1),
              ),
            Text('Swipe left on a check-in to undo it.', style: text.bodySmall?.copyWith(color: InveonColors.muted)),
          ],
        ],
      ),
    );
  }
}

class _ScannerPanel extends StatelessWidget {
  const _ScannerPanel({required this.scanner, required this.onDetect, required this.flash, required this.busy, required this.onManual});

  final MobileScannerController scanner;
  final void Function(BarcodeCapture) onDetect;
  final _Flash? flash;
  final bool busy;
  final VoidCallback onManual;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: InveonColors.midnight, borderRadius: BorderRadius.circular(InveonRadius.xl)),
      child: Column(
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(InveonRadius.lg),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  MobileScanner(
                    controller: scanner,
                    onDetect: onDetect,
                    errorBuilder: (context, error) => Container(
                      color: const Color(0xFF13234F),
                      alignment: Alignment.center,
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Camera unavailable. Allow camera access in Settings, or enter the ticket manually.',
                        textAlign: TextAlign.center,
                        style: text.bodyMedium?.copyWith(color: Colors.white70),
                      ),
                    ),
                  ),
                  const _ScanFrame(),
                  if (busy) const Center(child: CircularProgressIndicator(color: Colors.white)),
                  if (flash != null) _FlashOverlay(flash: flash!),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Point the camera at the ticket QR code',
            style: text.titleSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text('Each ticket is admitted once, even across gates', style: text.bodySmall?.copyWith(color: Colors.white60)),
          const SizedBox(height: 12),
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: Colors.white, backgroundColor: Colors.white12, shape: const StadiumBorder()),
            onPressed: onManual,
            icon: const Icon(Icons.keyboard_rounded, size: 18),
            label: const Text('Enter Ticket Code Manually'),
          ),
        ],
      ),
    );
  }
}

/// Corner brackets and a sweeping laser line.
class _ScanFrame extends StatelessWidget {
  const _ScanFrame();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final size = box.maxWidth * 0.7;
        Widget corner(Alignment a) => Align(
          alignment: a,
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              border: Border(
                top: a.y < 0 ? const BorderSide(color: InveonColors.primary, width: 5) : BorderSide.none,
                bottom: a.y > 0 ? const BorderSide(color: InveonColors.primary, width: 5) : BorderSide.none,
                left: a.x < 0 ? const BorderSide(color: InveonColors.primary, width: 5) : BorderSide.none,
                right: a.x > 0 ? const BorderSide(color: InveonColors.primary, width: 5) : BorderSide.none,
              ),
            ),
          ),
        );
        return Center(
          child: SizedBox.square(
            dimension: size,
            child: Stack(
              children: [
                corner(Alignment.topLeft),
                corner(Alignment.topRight),
                corner(Alignment.bottomLeft),
                corner(Alignment.bottomRight),
                Align(
                  alignment: Alignment.topCenter,
                  child:
                      Container(
                            height: 3,
                            margin: const EdgeInsets.symmetric(horizontal: 12),
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(colors: [Colors.transparent, InveonColors.tertiary, Colors.transparent]),
                              boxShadow: [BoxShadow(color: InveonColors.tertiary, blurRadius: 12)],
                            ),
                          )
                          .animate(onPlay: (c) => c.repeat(reverse: true))
                          .moveY(begin: 6, end: size - 10, duration: 1600.ms, curve: Curves.easeInOut),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _FlashOverlay extends StatelessWidget {
  const _FlashOverlay({required this.flash});

  final _Flash flash;

  @override
  Widget build(BuildContext context) {
    final ok = flash.outcome == _Outcome.success;
    final text = Theme.of(context).textTheme;
    return Container(
      color: (ok ? InveonColors.success : InveonColors.error).withValues(alpha: 0.92),
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            ok ? Icons.check_circle_rounded : Icons.cancel_rounded,
            color: Colors.white,
            size: 88,
          ).animate().scale(begin: const Offset(0.3, 0.3), duration: 450.ms, curve: Curves.elasticOut),
          const SizedBox(height: 14),
          Text(
            flash.title,
            textAlign: TextAlign.center,
            style: text.headlineSmall?.copyWith(color: Colors.white),
          ),
          const SizedBox(height: 6),
          Text(
            flash.subtitle,
            textAlign: TextAlign.center,
            style: text.bodyMedium?.copyWith(color: Colors.white),
          ),
        ],
      ),
    ).animate(key: ValueKey(flash)).fadeIn(duration: 150.ms);
  }
}

class _CountCard extends StatelessWidget {
  const _CountCard({
    required this.label,
    required this.value,
    required this.unit,
    required this.color,
    required this.background,
    required this.progress,
  });

  final String label;
  final int value;
  final String unit;
  final Color color;
  final Color background;
  final double progress;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(InveonRadius.lg),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: text.labelSmall?.copyWith(color: color)),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                child: Text(
                  '$value',
                  key: ValueKey(value),
                  style: text.headlineMedium?.copyWith(color: color == InveonColors.success ? color : InveonColors.midnight),
                ),
              ),
              const SizedBox(width: 6),
              Text(unit, style: text.bodySmall?.copyWith(color: InveonColors.slate)),
            ],
          ),
          const SizedBox(height: 10),
          AnimatedProgress(value: progress, color: color, height: 6),
        ],
      ),
    );
  }
}
