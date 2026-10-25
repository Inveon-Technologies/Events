import 'dart:async';

import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../services.dart';
import '../widgets/organizer_widgets.dart';
import 'shell.dart';

/// Stitch "organizer_bookings": search, status filters and the booking
/// list, newest first, 25 at a time.
class BookingsScreen extends StatefulWidget {
  const BookingsScreen({super.key, this.eventId});

  final String? eventId;

  @override
  State<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends State<BookingsScreen> {
  String _status = 'all';
  String _search = '';
  Timer? _debounce;
  late String? _eventId = widget.eventId;

  static const _filters = [('all', 'All'), ('confirmed', 'Confirmed'), ('pending', 'Pending'), ('cancelled', 'Cancelled')];

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: const WorkspaceHeader(),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Row(
              children: [
                Expanded(child: Text('Bookings', style: text.headlineMedium)),
                if (_eventId != null) InputChip(label: const Text('This event'), onDeleted: () => setState(() => _eventId = null)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Name, email, phone or booking ID'),
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 400), () => setState(() => _search = v.trim()));
              },
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                for (final (key, label) in _filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      showCheckmark: false,
                      selected: _status == key,
                      labelStyle: TextStyle(color: _status == key ? Colors.white : InveonColors.midnight, fontWeight: FontWeight.w600),
                      label: Text(label),
                      onSelected: (_) => setState(() => _status = key),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: AsyncView<BookingsPage>(
              key: ValueKey('$_eventId|$_status|$_search'),
              load: () => services.api.bookings(eventId: _eventId, status: _status, search: _search),
              builder: (context, page, _) {
                if (page.bookings.isEmpty) {
                  return ListView(
                    children: const [
                      SizedBox(
                        height: 360,
                        child: EmptyState(
                          icon: Icons.receipt_long_rounded,
                          title: 'No bookings found',
                          message: 'Try another filter or search.',
                        ),
                      ),
                    ],
                  );
                }
                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
                  children: [
                    Text('${page.total} booking${page.total == 1 ? '' : 's'}', style: text.labelLarge?.copyWith(color: InveonColors.slate)),
                    const SizedBox(height: 8),
                    InveonCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          for (final (i, b) in page.bookings.indexed) ...[
                            if (i > 0) const Divider(height: 1),
                            BookingRow(
                              name: b.customerName,
                              subtitle: '${b.bookingReference} · ${b.ticketCount} × ${b.tiers}',
                              amountPaise: b.totalAmountPaise,
                              status: b.status,
                              onTap: () => _details(context, b),
                            ).staggered(i),
                          ],
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _details(BuildContext context, OrganizerBooking b) {
    final text = Theme.of(context).textTheme;
    final phone = b.customerPhone.replaceAll(RegExp(r'\D'), '');
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(b.customerName, style: text.headlineSmall)),
                StatusPill(b.status.replaceAll('_', ' '), tone: StatusPill.toneFor(b.status)),
              ],
            ),
            const SizedBox(height: 4),
            Text('${b.bookingReference} · booked ${timeAgo(b.createdAt)}', style: text.bodySmall?.copyWith(color: InveonColors.slate)),
            const Divider(height: 28),
            _Line('Event', b.eventName),
            _Line('Tickets', '${b.ticketCount} × ${b.tiers}'),
            _Line('Amount', b.totalAmountPaise == 0 ? 'Free' : rupees(b.totalAmountPaise)),
            if (b.paymentStatus != null) _Line('Payment', b.paymentStatus!),
            _Line('Email', b.customerEmail),
            _Line('Phone', b.customerPhone),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: phone.isEmpty ? null : () => launchUrl(Uri.parse('tel:$phone')),
                    icon: const Icon(Icons.call_rounded),
                    label: const Text('Call'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xFF25D366)),
                    onPressed: phone.isEmpty
                        ? null
                        : () => launchUrl(
                            Uri.parse('https://wa.me/${phone.length == 10 ? '91$phone' : phone}'),
                            mode: LaunchMode.externalApplication,
                          ),
                    icon: const Icon(Icons.chat_rounded),
                    label: const Text('WhatsApp'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(label, style: text.bodyMedium?.copyWith(color: InveonColors.slate)),
          ),
          Expanded(
            child: Text(value, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
