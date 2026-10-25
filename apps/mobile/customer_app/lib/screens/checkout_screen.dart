import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:inveon_core/inveon_core.dart';

import '../api.dart';
import '../payments.dart';
import '../services.dart';
import 'booking_result_screen.dart';

/// Pick tickets, enter contact details, pay. Same rules as the website
/// checkout (apps/web/src/pages/CheckoutPage): the API validates
/// everything again and reserves seats atomically.
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key, required this.event});

  final EventDetail event;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _form = GlobalKey<FormState>();
  final _qty = <String, int>{};
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _city = TextEditingController();
  final _attendees = <TextEditingController>[];
  String _payment = 'online';
  bool _genderConfirmed = false;
  bool _busy = false;
  Timer? _poll;

  EventDetail get event => widget.event;

  @override
  void initState() {
    super.initState();
    final open = event.tiers.where((t) => t.available > 0).toList();
    if (open.length == 1) _qty[open.first.id] = 1;
    _loadProfile();
    // Seats left change as others book: refresh every 20 seconds.
    _poll = Timer.periodic(const Duration(seconds: 20), (_) => _refreshAvailability());
  }

  Future<void> _loadProfile() async {
    final services = Services.read(context);
    final raw = await services.store.read('profile');
    if (raw != null && raw.isNotEmpty && mounted) {
      final p = jsonDecode(raw) as Map<String, dynamic>;
      setState(() {
        _name.text = p['name'] as String? ?? '';
        _phone.text = p['phone'] as String? ?? '';
        _email.text = p['email'] as String? ?? services.email ?? '';
        _city.text = p['city'] as String? ?? '';
      });
    } else if (services.email != null) {
      _email.text = services.email!;
    }
  }

  Future<void> _refreshAvailability() async {
    try {
      final seats = await Services.read(context).api.availability(event.id);
      if (!mounted) return;
      setState(() {
        for (final t in event.tiers) {
          t.available = seats[t.id] ?? t.available;
          if ((_qty[t.id] ?? 0) > t.available) _qty[t.id] = t.available;
        }
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _poll?.cancel();
    for (final c in [_name, _phone, _email, _city, ..._attendees]) {
      c.dispose();
    }
    super.dispose();
  }

  int get _count => _qty.values.fold(0, (a, b) => a + b);
  int get _total => event.tiers.fold(0, (sum, t) => sum + t.pricePaise * (_qty[t.id] ?? 0));

  void _syncAttendees() {
    while (_attendees.length < _count) {
      _attendees.add(TextEditingController());
    }
    while (_attendees.length > _count) {
      _attendees.removeLast().dispose();
    }
  }

  Future<void> _submit() async {
    if (_count == 0) return showMessage(context, 'Choose at least one ticket', error: true);
    if (!_form.currentState!.validate()) return;
    if (event.genderRestriction != null && !_genderConfirmed) {
      return showMessage(context, 'Please confirm the participant requirement', error: true);
    }
    final services = Services.read(context);
    setState(() => _busy = true);
    HapticFeedback.mediumImpact();
    final items = [
      for (final t in event.tiers)
        if ((_qty[t.id] ?? 0) > 0) {'ticketCategoryId': t.id, 'quantity': _qty[t.id]},
    ];
    final digits = _phone.text.replaceAll(RegExp(r'\D'), '');
    final phone = digits.length > 10 ? digits.substring(digits.length - 10) : digits;
    final names = [for (final c in _attendees) c.text.trim().isEmpty ? _name.text.trim() : c.text.trim()];
    try {
      await services.store.write(
        'profile',
        jsonEncode({'name': _name.text.trim(), 'phone': _phone.text.trim(), 'email': _email.text.trim(), 'city': _city.text.trim()}),
      );
      final paid = _total > 0;
      final created = await services.api.createBooking(event.id, {
        'items': items,
        'primaryContactName': _name.text.trim(),
        'primaryContactWhatsapp': phone,
        'primaryContactEmail': _email.text.trim(),
        if (_city.text.trim().isNotEmpty) 'primaryContactCity': _city.text.trim(),
        'paymentMethod': paid ? _payment : 'online',
        'attendeeNames': names,
        if (event.genderRestriction != null) 'attendeeGenders': List.filled(_count, event.genderRestriction),
      });

      var status = paid && _payment == 'cash' ? 'pending' : 'confirmed';
      if (created.paymentSessionId != null) {
        final outcome = await payWithCashfree(
          orderId: created.bookingReference,
          paymentSessionId: created.paymentSessionId!,
          mode: created.cashfreeMode ?? 'sandbox',
        );
        if (!outcome.ok) {
          if (mounted) {
            showMessage(context, '${outcome.message}. Your seats are held for a few minutes, so you can try again.', error: true);
          }
          return;
        }
        status = await _waitForConfirmation(created.bookingId);
      }
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => BookingResultScreen(
            event: event,
            bookingReference: created.bookingReference,
            status: status,
            cash: paid && _payment == 'cash',
            email: _email.text.trim(),
          ),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
      _refreshAvailability();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The payment webhook confirms the booking, usually within seconds.
  Future<String> _waitForConfirmation(String bookingId) async {
    final api = Services.read(context).api;
    for (var i = 0; i < 20; i++) {
      try {
        final status = await api.bookingStatus(bookingId);
        if (status != 'pending') return status;
      } catch (_) {}
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    return 'pending';
  }

  @override
  Widget build(BuildContext context) {
    _syncAttendees();
    final text = Theme.of(context).textTheme;
    final paid = _total > 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Book tickets')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 140),
          children: [
            InveonCard(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  EventImage(url: event.bannerUrl, width: 64, height: 64, radius: InveonRadius.md),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          event.name,
                          style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${eventDay(event.eventDate)} · ${eventTime(event.eventDate)}',
                          style: text.bodySmall?.copyWith(color: InveonColors.slate),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            _Heading('1', 'Choose tickets'),
            for (final t in event.tiers)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: InveonCard(
                  radius: InveonRadius.lg,
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(t.name, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                            Text(
                              t.pricePaise == 0 ? 'Free' : rupees(t.pricePaise),
                              style: text.titleMedium?.copyWith(color: InveonColors.primary, fontWeight: FontWeight.w800),
                            ),
                            if (t.available <= 0)
                              const Text('Sold out', style: TextStyle(color: InveonColors.error, fontSize: 12))
                            else if (t.available <= 10)
                              Text(
                                'Only ${t.available} left',
                                style: const TextStyle(color: InveonColors.secondary, fontSize: 12, fontWeight: FontWeight.w600),
                              ),
                          ],
                        ),
                      ),
                      _Stepper(
                        value: _qty[t.id] ?? 0,
                        max: t.available.clamp(0, t.maxPerBooking),
                        onChanged: (v) {
                          HapticFeedback.selectionClick();
                          setState(() => _qty[t.id] = v);
                        },
                      ),
                    ],
                  ),
                ),
              ),
            _Heading('2', 'Your details'),
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Full name', prefixIcon: Icon(Icons.person_outline_rounded)),
              validator: (v) => (v ?? '').trim().length < 2 ? 'Enter your name' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'WhatsApp number',
                prefixIcon: Icon(Icons.phone_iphone_rounded),
                prefixText: '+91 ',
              ),
              validator: (v) =>
                  RegExp(r'^\d{10}$').hasMatch((v ?? '').replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^91(?=\d{10}$)'), ''))
                  ? null
                  : 'Enter a 10-digit mobile number',
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline_rounded)),
              validator: (v) => RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch((v ?? '').trim()) ? null : 'Enter a valid email',
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _city,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'City (optional)', prefixIcon: Icon(Icons.location_city_rounded)),
            ),
            if (_count > 1) ...[
              _Heading('3', 'Participant names'),
              for (final (i, c) in _attendees.indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: TextFormField(
                    controller: c,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(
                      labelText: 'Participant ${i + 1}',
                      hintText: i == 0 ? 'Leave empty to use your name' : null,
                    ),
                  ),
                ),
            ],
            if (event.genderRestriction != null)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _genderConfirmed,
                onChanged: (v) => setState(() => _genderConfirmed = v ?? false),
                title: Text('All participants are ${event.genderRestriction}', style: text.bodyMedium),
                subtitle: const Text('This event is restricted by the organizer.'),
              ),
            if (paid) ...[
              _Heading(_count > 1 ? '4' : '3', 'Payment'),
              _PayOption(
                selected: _payment == 'online',
                icon: Icons.bolt_rounded,
                title: 'Pay online',
                subtitle: 'UPI, cards, net banking · instant confirmation',
                onTap: () => setState(() => _payment = 'online'),
              ),
              const SizedBox(height: 10),
              _PayOption(
                selected: _payment == 'cash',
                icon: Icons.payments_outlined,
                title: 'Pay cash to the organizer',
                subtitle: 'Your booking stays pending until the organizer confirms',
                onTap: () => setState(() => _payment = 'cash'),
              ),
            ],
          ],
        ),
      ),
      bottomSheet: Container(
        padding: EdgeInsets.fromLTRB(20, 14, 20, 14 + MediaQuery.of(context).padding.bottom),
        decoration: const BoxDecoration(
          color: Colors.white,
          boxShadow: [BoxShadow(color: Color(0x140B132B), blurRadius: 32, offset: Offset(0, -8))],
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$_count ticket${_count == 1 ? '' : 's'}', style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                    child: Text(
                      paid ? rupees(_total) : 'Free',
                      key: ValueKey(_total),
                      style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              width: 180,
              child: AmberButton(
                label: paid && _payment == 'online' ? 'Pay ${rupees(_total)}' : 'Confirm booking',
                busy: _busy,
                onPressed: _count == 0 ? null : _submit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.step, this.title);

  final String step;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 24, 0, 12),
      child: Row(
        children: [
          CircleAvatar(
            radius: 13,
            backgroundColor: InveonColors.primary,
            child: Text(
              step,
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(width: 10),
          Text(title, style: Theme.of(context).textTheme.titleLarge),
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.value, required this.max, required this.onChanged});

  final int value;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget button(IconData icon, VoidCallback? onTap) => Material(
      color: onTap == null ? const Color(0x0A0B132B) : const Color(0x1A0066FF),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox.square(
          dimension: 36,
          child: Icon(icon, size: 20, color: onTap == null ? InveonColors.muted : InveonColors.primary),
        ),
      ),
    );
    return Row(
      children: [
        button(Icons.remove_rounded, value > 0 ? () => onChanged(value - 1) : null),
        SizedBox(
          width: 36,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
            child: Text(
              '$value',
              key: ValueKey(value),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
          ),
        ),
        button(Icons.add_rounded, value < max ? () => onChanged(value + 1) : null),
      ],
    );
  }
}

class _PayOption extends StatelessWidget {
  const _PayOption({required this.selected, required this.icon, required this.title, required this.subtitle, required this.onTap});

  final bool selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: selected ? const Color(0x0F0066FF) : Colors.white,
        borderRadius: BorderRadius.circular(InveonRadius.lg),
        border: Border.all(color: selected ? InveonColors.primary : InveonColors.outline, width: selected ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(InveonRadius.lg),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(icon, color: selected ? InveonColors.primary : InveonColors.slate),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                    Text(subtitle, style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                  ],
                ),
              ),
              Icon(
                selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                color: selected ? InveonColors.primary : InveonColors.muted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
