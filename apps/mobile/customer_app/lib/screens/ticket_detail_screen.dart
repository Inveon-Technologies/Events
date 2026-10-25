import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../services.dart';

/// One booking's passes, after the Stitch "tickets" screen: a ticket
/// stub per attendee with notches, a dashed tear line and the entry QR.
class TicketDetailScreen extends StatelessWidget {
  const TicketDetailScreen({super.key, required this.summary});

  final BookingSummary summary;

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(summary.bookingReference)),
      body: AsyncView<BookingDetail>(
        load: () => services.api.bookingDetail(summary.ticketPagePath),
        builder: (context, detail, _) {
          final tickets = detail.tickets;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
            children: [
              if (tickets.length > 1)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    '${tickets.length} passes · swipe for each attendee',
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(color: InveonColors.slate),
                  ),
                ),
              SizedBox(
                height: 640,
                child: PageView.builder(
                  controller: PageController(viewportFraction: tickets.length > 1 ? 0.94 : 1),
                  itemCount: tickets.isEmpty ? 1 : tickets.length,
                  itemBuilder: (context, i) => Padding(
                    padding: EdgeInsets.symmetric(horizontal: tickets.length > 1 ? 4 : 0),
                    child: tickets.isEmpty
                        ? const EmptyState(
                            icon: Icons.hourglass_empty_rounded,
                            title: 'Tickets not issued yet',
                            message: 'They appear once the booking is confirmed.',
                          )
                        : _TicketStub(detail: detail, ticket: tickets[i], heroTag: i == 0 ? 'pass-${summary.bookingReference}' : null),
                  ),
                ),
              ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.06),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: const Color(0xFFE8F0FF), borderRadius: BorderRadius.circular(InveonRadius.lg)),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline_rounded, color: InveonColors.primary, size: 20),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Arrive a little early and keep this QR ready. A screenshot works too if the network is poor at the venue.',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => launchUrl(Uri.parse(detail.pdfUrl), mode: LaunchMode.externalApplication),
                      icon: const Icon(Icons.picture_as_pdf_outlined),
                      label: const Text('PDF'),
                    ),
                  ),
                  if (detail.venueMapUrl != null) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => launchUrl(Uri.parse(detail.venueMapUrl!), mode: LaunchMode.externalApplication),
                        icon: const Icon(Icons.directions_rounded),
                        label: const Text('Directions'),
                      ),
                    ),
                  ],
                ],
              ),
              if (detail.galleryUrl != null) ...[
                const SizedBox(height: 10),
                FilledButton.icon(
                  onPressed: () => launchUrl(Uri.parse(detail.galleryUrl!), mode: LaunchMode.externalApplication),
                  icon: const Icon(Icons.photo_library_rounded),
                  label: const Text('Event photos'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _TicketStub extends StatelessWidget {
  const _TicketStub({required this.detail, required this.ticket, this.heroTag});

  final BookingDetail detail;
  final TicketRow ticket;
  final String? heroTag;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final image = EventImage(url: detail.bannerUrl, height: 150, width: double.infinity);
    final checkedIn = ticket.status == 'checked_in';
    final cancelled = ticket.status == 'cancelled' || detail.status == 'cancelled';
    return PhysicalShape(
      clipper: const _StubClipper(notchAt: 380),
      color: Colors.white,
      elevation: 2,
      shadowColor: const Color(0x330B132B),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 150,
            child: Stack(
              fit: StackFit.expand,
              children: [
                heroTag == null ? image : Hero(tag: heroTag!, child: image),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xE60B132B)],
                    ),
                  ),
                ),
                Positioned(
                  left: 14,
                  top: 14,
                  child: StatusPill(
                    cancelled ? 'Cancelled' : (checkedIn ? 'Checked in' : 'Valid ticket'),
                    tone: cancelled ? PillTone.red : PillTone.green,
                    dot: !cancelled && !checkedIn,
                  ),
                ),
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 14,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (detail.eventTagline != null)
                        Text(
                          detail.eventTagline!.toUpperCase(),
                          style: text.labelSmall?.copyWith(color: const Color(0xFFFFB68B)),
                          maxLines: 1,
                        ),
                      Text(
                        detail.eventName,
                        style: text.titleLarge?.copyWith(color: Colors.white),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            height: 230,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _Field('DATE & TIME', eventDay(detail.eventDate), eventTime(detail.eventDate), Icons.calendar_month_rounded),
                      ),
                      Expanded(child: _Field('PASS TYPE', ticket.tierName, null, Icons.local_activity_rounded)),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _Field('LOCATION', detail.venueAddress ?? 'Shared by the organizer', null, Icons.place_rounded),
                  const SizedBox(height: 14),
                  _Field('ATTENDEE', ticket.attendeeName, null, Icons.person_rounded),
                ],
              ),
            ),
          ),
          const _DashedLine(),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Opacity(
                  opacity: cancelled ? 0.2 : 1,
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(InveonRadius.lg),
                      boxShadow: InveonShadows.card,
                    ),
                    child: Image.network(
                      detail.qrUrl(ticket),
                      width: 150,
                      height: 150,
                      errorBuilder: (_, _, _) => const SizedBox.square(dimension: 150, child: Icon(Icons.qr_code_2_rounded, size: 80)),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                InkWell(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: ticket.displayReference));
                    showMessage(context, 'Ticket ID copied');
                  },
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('TICKET ID  ', style: text.labelSmall?.copyWith(color: InveonColors.slate)),
                      Text(ticket.displayReference, style: text.labelLarge?.copyWith(color: InveonColors.primary, letterSpacing: 1)),
                      const SizedBox(width: 6),
                      const Icon(Icons.copy_rounded, size: 14, color: InveonColors.slate),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field(this.label, this.value, this.sub, this.icon);

  final String label;
  final String value;
  final String? sub;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: text.labelSmall?.copyWith(color: InveonColors.slate)),
        const SizedBox(height: 4),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: InveonColors.primary),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                value,
                style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        if (sub != null)
          Padding(
            padding: const EdgeInsets.only(left: 24),
            child: Text(sub!, style: text.bodySmall?.copyWith(color: InveonColors.slate)),
          ),
      ],
    );
  }
}

class _DashedLine extends StatelessWidget {
  const _DashedLine();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 22),
      child: LayoutBuilder(
        builder: (context, box) {
          final count = (box.maxWidth / 10).floor();
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(count, (_) => Container(width: 5, height: 1.5, color: const Color(0x330B132B))),
          );
        },
      ),
    );
  }
}

/// Rounded rectangle with two semicircle notches at [notchAt] — the
/// classic ticket stub tear line.
class _StubClipper extends CustomClipper<Path> {
  const _StubClipper({required this.notchAt});

  final double notchAt;

  @override
  Path getClip(Size size) {
    const r = 12.0;
    final card = Path()..addRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(InveonRadius.xl)));
    final notches = Path()
      ..addOval(Rect.fromCircle(center: Offset(0, notchAt), radius: r))
      ..addOval(Rect.fromCircle(center: Offset(size.width, notchAt), radius: r));
    return Path.combine(PathOperation.difference, card, notches);
  }

  @override
  bool shouldReclip(_StubClipper old) => old.notchAt != notchAt;
}
