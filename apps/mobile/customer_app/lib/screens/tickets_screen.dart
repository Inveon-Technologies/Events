import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import '../api.dart';
import '../services.dart';
import 'login_screen.dart';
import 'ticket_detail_screen.dart';

/// "My Tickets": every booking made with the signed-in email, upcoming
/// first, then past ones.
class TicketsScreen extends StatelessWidget {
  const TicketsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    final text = Theme.of(context).textTheme;
    if (!services.signedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('My Tickets')),
        body: EmptyState(
          icon: Icons.confirmation_number_outlined,
          title: 'Your passes live here',
          message: 'Sign in with your Booking ID, mobile number or email to see your QR tickets.',
          action: 'Sign in',
          onAction: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const LoginScreen())),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('My Tickets')),
      body: AsyncView<List<BookingSummary>>(
        key: ValueKey(services.email),
        load: services.api.myBookings,
        builder: (context, bookings, _) {
          final upcoming = bookings.where((b) => b.upcoming && b.status != 'cancelled').toList()
            ..sort((a, b) => a.eventDate.compareTo(b.eventDate));
          final past = bookings.where((b) => !upcoming.contains(b)).toList();
          if (bookings.isEmpty) {
            return ListView(
              children: const [
                SizedBox(
                  height: 420,
                  child: EmptyState(
                    icon: Icons.local_activity_outlined,
                    title: 'No bookings yet',
                    message: 'Tickets you book will appear here.',
                  ),
                ),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
            children: [
              Text('Active and upcoming event passes', style: text.bodyMedium?.copyWith(color: InveonColors.slate)),
              const SizedBox(height: 12),
              for (final (i, b) in upcoming.indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: _PassCard(booking: b).staggered(i),
                ),
              if (past.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(0, 12, 0, 10),
                  child: Text('Past & cancelled', style: text.titleLarge),
                ),
                for (final (i, b) in past.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _PastRow(booking: b).staggered(i),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }
}

void _open(BuildContext context, BookingSummary b) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => TicketDetailScreen(summary: b)));

class _PassCard extends StatelessWidget {
  const _PassCard({required this.booking});

  final BookingSummary booking;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final days = toIst(booking.eventDate).difference(toIst(DateTime.now().toUtc().toIso8601String())).inDays;
    return InveonCard(
      padding: EdgeInsets.zero,
      onTap: () => _open(context, booking),
      child: Column(
        children: [
          SizedBox(
            height: 140,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Hero(
                  tag: 'pass-${booking.bookingReference}',
                  child: EventImage(url: booking.bannerUrl),
                ),
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
                  left: 12,
                  top: 12,
                  child: StatusPill(
                    booking.status == 'confirmed' ? 'Valid ticket' : 'Pending',
                    tone: StatusPill.toneFor(booking.status),
                    dot: true,
                  ),
                ),
                Positioned(
                  right: 12,
                  top: 12,
                  child: StatusPill(days <= 0 ? 'TODAY' : 'IN $days DAY${days == 1 ? '' : 'S'}', tone: PillTone.orange),
                ),
                Positioned(
                  left: 14,
                  right: 14,
                  bottom: 12,
                  child: Text(
                    booking.eventName,
                    style: text.titleLarge?.copyWith(color: Colors.white),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                const Icon(Icons.calendar_month_rounded, size: 18, color: InveonColors.primary),
                const SizedBox(width: 6),
                Expanded(child: Text('${eventDay(booking.eventDate)} · ${eventTime(booking.eventDate)}', style: text.labelLarge)),
                Text('${booking.ticketCount} × ', style: text.labelLarge?.copyWith(color: InveonColors.slate)),
                const Icon(Icons.qr_code_2_rounded, color: InveonColors.midnight),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PastRow extends StatelessWidget {
  const _PastRow({required this.booking});

  final BookingSummary booking;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return InveonCard(
      padding: const EdgeInsets.all(10),
      radius: InveonRadius.lg,
      onTap: () => _open(context, booking),
      child: Row(
        children: [
          EventImage(url: booking.bannerUrl, width: 56, height: 56, radius: InveonRadius.md),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  booking.eventName,
                  style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '${shortDate(booking.eventDate)} · ${booking.bookingReference}',
                  style: text.bodySmall?.copyWith(color: InveonColors.slate),
                ),
              ],
            ),
          ),
          StatusPill(booking.status, tone: StatusPill.toneFor(booking.status)),
        ],
      ),
    );
  }
}
