import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import '../api.dart';
import '../services.dart';
import '../widgets/organizer_widgets.dart';
import 'shell.dart';

/// Stitch "organizer_my_events": status filters with counts and an event
/// card per event with sales, check-ins and revenue.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  String _status = 'all';

  static const _filters = [
    ('all', 'All'),
    ('published', 'Active'),
    ('draft', 'Drafts'),
    ('completed', 'Completed'),
    ('cancelled', 'Cancelled'),
  ];

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    final text = Theme.of(context).textTheme;
    final shell = OrganizerShell.of(context);
    return Scaffold(
      appBar: const WorkspaceHeader(),
      body: AsyncView<EventsPage>(
        key: ValueKey(_status),
        load: () => services.api.events(status: _status),
        builder: (context, page, _) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
          children: [
            Text('My Events', style: text.headlineMedium),
            const SizedBox(height: 12),
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final (key, label) in _filters)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        showCheckmark: false,
                        selected: _status == key,
                        labelStyle: TextStyle(color: _status == key ? Colors.white : InveonColors.midnight, fontWeight: FontWeight.w600),
                        label: Text('$label ${page.counts[key] ?? 0}'),
                        onSelected: (_) => setState(() => _status = key),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (page.events.isEmpty)
              const SizedBox(
                height: 360,
                child: EmptyState(icon: Icons.event_note_rounded, title: 'No events here', message: 'Create events from the web portal.'),
              ),
            for (final (i, e) in page.events.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: EventProgressCard(
                  name: e.name,
                  eventDate: e.eventDate,
                  bannerUrl: e.bannerUrl,
                  status: e.status == 'published' ? 'active' : e.status,
                  sold: e.ticketsSold,
                  capacity: e.capacity,
                  onTap: () => shell?.showBookings(eventId: e.id),
                  extra: Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(
                      children: [
                        _Mini(icon: Icons.how_to_reg_rounded, label: '${e.checkedInCount} checked in'),
                        const SizedBox(width: 14),
                        _Mini(icon: Icons.currency_rupee_rounded, label: rupees(e.revenuePaise)),
                        const Spacer(),
                        if (e.status == 'published')
                          TextButton.icon(
                            onPressed: () => shell?.showCheckIn(e.id),
                            icon: const Icon(Icons.qr_code_scanner_rounded, size: 18),
                            label: const Text('Check in'),
                          ),
                      ],
                    ),
                  ),
                ).staggered(i),
              ),
          ],
        ),
      ),
    );
  }
}

class _Mini extends StatelessWidget {
  const _Mini({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: InveonColors.slate),
        const SizedBox(width: 4),
        Text(label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: InveonColors.slate)),
      ],
    );
  }
}
