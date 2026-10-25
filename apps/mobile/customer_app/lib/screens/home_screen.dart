import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../services.dart';
import '../widgets/event_cards.dart';
import 'explore_screen.dart';
import 'notifications_page.dart';

/// Home, after the Stitch "home" screen: search, explore CTA, the
/// organizer promo, quick filters and trending events.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onExplore});

  final VoidCallback onExplore;

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AsyncView<List<EventSummary>>(
          load: services.api.events,
          builder: (context, events, refresh) {
            final upcoming = events.where((e) => DateTime.parse(e.eventDate).isAfter(DateTime.now())).toList();
            final featured = upcoming.take(5).toList();
            final more = upcoming.skip(5).toList();
            return ListView(
              padding: const EdgeInsets.only(bottom: 120),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 4, 0),
                  child: Row(
                    children: [
                      const InveonWordmark(size: 30),
                      const Spacer(),
                      NotificationBell(center: services.notifications, onPressed: () => openNotificationsPage(context)),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _SearchField(
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ExploreScreen(autofocus: true))),
                  ),
                ).staggered(0),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _ExploreCta(onTap: onExplore),
                ).staggered(1),
                const SizedBox(height: 16),
                const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: _OrganizerPromo()).staggered(2),
                SectionHeader('Trending Events', action: 'View all', onAction: onExplore),
                if (featured.isEmpty)
                  const SizedBox(
                    height: 280,
                    child: EmptyState(
                      icon: Icons.event_available_rounded,
                      title: 'New events are on the way',
                      message: 'Check back soon, or pull down to refresh.',
                    ),
                  )
                else
                  SizedBox(
                    height: 430,
                    child: PageView.builder(
                      controller: PageController(viewportFraction: 0.9),
                      padEnds: false,
                      itemCount: featured.length,
                      itemBuilder: (context, i) => Padding(
                        padding: EdgeInsets.only(left: i == 0 ? 16 : 6, right: 6),
                        child: FeaturedEventCard(event: featured[i], badge: i == 0 ? 'FILLING FAST' : null),
                      ).staggered(i + 3),
                    ),
                  ),
                if (more.isNotEmpty) ...[
                  SectionHeader('More to explore', action: 'See all', onAction: onExplore),
                  for (final (i, e) in more.take(6).indexed)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: CompactEventCard(event: e).staggered(i),
                    ),
                ],
                const SizedBox(height: 8),
                Center(
                  child: Text('Plan. Book. Celebrate.', style: text.labelLarge?.copyWith(color: InveonColors.muted)),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(InveonRadius.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(InveonRadius.lg),
        onTap: onTap,
        child: Container(
          height: 52,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(InveonRadius.lg),
            border: Border.all(color: const Color(0x140B132B)),
          ),
          child: const Row(
            children: [
              Icon(Icons.search_rounded, color: InveonColors.muted),
              SizedBox(width: 12),
              Expanded(
                child: Text('Search treks, workshops, gigs…', style: TextStyle(color: InveonColors.muted)),
              ),
              Icon(Icons.tune_rounded, color: InveonColors.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExploreCta extends StatelessWidget {
  const _ExploreCta({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: InveonColors.primary,
      borderRadius: BorderRadius.circular(InveonRadius.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(InveonRadius.lg),
        onTap: onTap,
        child: Container(
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: 18),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(InveonRadius.lg), boxShadow: InveonShadows.blueGlow),
          child: Row(
            children: [
              const Icon(Icons.explore_rounded, color: Colors.white),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  'Explore All Events',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16),
                ),
              ),
              const Icon(
                Icons.arrow_forward_rounded,
                color: Colors.white,
              ).animate(onPlay: (c) => c.repeat(reverse: true)).moveX(begin: 0, end: 5, duration: 700.ms, curve: Curves.easeInOut),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrganizerPromo extends StatelessWidget {
  const _OrganizerPromo();

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(InveonRadius.xl),
        border: Border.all(color: InveonColors.outline),
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0xFFEFF4FF), Colors.white],
          stops: [0, 0.5],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const StatusPill('ORGANIZER PORTAL', tone: PillTone.orange, dot: true),
          const SizedBox(height: 10),
          Text('You Create the Event.', style: text.headlineSmall),
          Text('We Make It Bookable.', style: text.headlineSmall?.copyWith(color: InveonColors.primary)),
          const SizedBox(height: 8),
          Text(
            'Launch, promote and sell tickets with automated settlements and instant confirmations.',
            style: text.bodyMedium?.copyWith(color: InveonColors.slate),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                  onPressed: () => launchUrl(Uri.parse('${InveonConfig.baseUrl}/organizer/signup'), mode: LaunchMode.externalApplication),
                  icon: const Icon(Icons.add_circle_outline_rounded, size: 20),
                  label: const Text('Host Your Event'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
