import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../services.dart';
import '../widgets/organizer_widgets.dart';
import 'shell.dart';

/// Stitch "organizer_dashboard": host portal hero, performance overview,
/// featured active events and recent bookings.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    final text = Theme.of(context).textTheme;
    final shell = OrganizerShell.of(context);
    return Scaffold(
      appBar: const WorkspaceHeader(),
      body: AsyncView<Dashboard>(
        load: services.api.dashboard,
        builder: (context, d, _) {
          final turnout = d.checkedInEligibleCount == 0 ? 0 : (d.checkedInCount * 100 / d.checkedInEligibleCount).round();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
            children: [
              _HostHero(
                name: services.user?.name.isNotEmpty == true ? services.user!.name : d.organizerName,
                upcoming: d.upcomingEventsCount,
                onCheckIn: () => shell?.showCheckIn(),
              ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.08),
              Padding(
                padding: const EdgeInsets.fromLTRB(0, 22, 0, 10),
                child: Text('PERFORMANCE OVERVIEW', style: text.labelSmall?.copyWith(color: InveonColors.slate, letterSpacing: 1)),
              ),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.25,
                children: [
                  StatTile(
                    label: 'Revenue this month',
                    value: d.revenuePaiseThisMonth / 100,
                    prefix: '₹',
                    icon: Icons.payments_rounded,
                    footnote: '${d.totalBookings} bookings in total',
                  ),
                  StatTile(
                    label: 'Tickets sold',
                    value: d.totalParticipants.toDouble(),
                    icon: Icons.confirmation_number_rounded,
                    footnote: '+${d.bookingsThisWeek} bookings this week',
                    footnoteColor: InveonColors.success,
                  ),
                  StatTile(
                    label: 'Checked in',
                    value: d.checkedInCount.toDouble(),
                    icon: Icons.verified_user_rounded,
                    iconColor: InveonColors.success,
                    footnote: '$turnout% turn-out rate',
                    footnoteColor: InveonColors.success,
                  ),
                  StatTile(
                    label: 'Active events',
                    value: d.upcomingEventsCount.toDouble(),
                    icon: Icons.event_available_rounded,
                    iconColor: InveonColors.secondary,
                    footnote: '${d.totalEvents} events in total',
                  ),
                ].indexed.map((e) => e.$2.staggered(e.$1 + 1)).toList(),
              ),
              if (d.activity.isNotEmpty) ...[
                const SizedBox(height: 16),
                InveonCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Bookings, last ${d.activity.length} days', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      ActivityBars(points: d.activity),
                    ],
                  ),
                ).staggered(5),
              ],
              SectionHeader('Featured Active Events', action: 'View all', onAction: () => shell?.select(1)),
              if (d.upcomingEvents.isEmpty)
                const InveonCard(child: Text('No upcoming events. Create one from the web portal.'))
              else
                for (final (i, e) in d.upcomingEvents.take(4).indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: EventProgressCard(
                      name: e.name,
                      eventDate: e.eventDate,
                      bannerUrl: e.bannerUrl,
                      status: e.status == 'published' ? 'active' : e.status,
                      sold: e.bookedCount,
                      capacity: e.capacity,
                      onTap: () => shell?.showBookings(eventId: e.id),
                    ).staggered(i),
                  ),
              SectionHeader('Recent Bookings', action: 'View all', onAction: () => shell?.showBookings()),
              InveonCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    if (d.recentBookings.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No bookings yet.')),
                    for (final (i, b) in d.recentBookings.take(6).indexed) ...[
                      if (i > 0) const Divider(height: 1),
                      BookingRow(
                        name: b.customerName,
                        subtitle: '${b.eventName} · ${b.ticketCount} ticket${b.ticketCount == 1 ? '' : 's'}',
                        amountPaise: b.totalAmountPaise,
                        status: b.status,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _HostHero extends StatelessWidget {
  const _HostHero({required this.name, required this.upcoming, required this.onCheckIn});

  final String name;
  final int upcoming;
  final VoidCallback onCheckIn;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: InveonColors.midnightGradient,
        borderRadius: BorderRadius.circular(InveonRadius.xl),
        boxShadow: const [BoxShadow(color: Color(0x330B132B), blurRadius: 24, offset: Offset(0, 10))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: Colors.white12, borderRadius: BorderRadius.circular(99)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(color: Color(0xFF4ADE80), shape: BoxShape.circle),
                ).animate(onPlay: (c) => c.repeat(reverse: true)).fade(begin: 1, end: 0.3, duration: 800.ms),
                const SizedBox(width: 6),
                const Text(
                  'Host Portal',
                  style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text('Welcome back, $name!', style: text.headlineSmall?.copyWith(color: Colors.white)),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(
              style: text.bodyMedium?.copyWith(color: Colors.white70),
              children: [
                const TextSpan(text: 'You have '),
                TextSpan(
                  text: '$upcoming upcoming event${upcoming == 1 ? '' : 's'}',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
                ),
                const TextSpan(text: ' on sale'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: InveonColors.success, minimumSize: const Size.fromHeight(46)),
                  onPressed: onCheckIn,
                  icon: const Icon(Icons.qr_code_scanner_rounded, size: 20),
                  label: const Text('Live Check-In'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                  onPressed: () =>
                      launchUrl(Uri.parse('${InveonConfig.baseUrl}/organizer/create-event/basic'), mode: LaunchMode.externalApplication),
                  icon: const Icon(Icons.add_circle_outline_rounded, size: 20),
                  label: const Text('Host Event'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
