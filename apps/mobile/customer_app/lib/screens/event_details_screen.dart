import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../services.dart';
import 'checkout_screen.dart';

/// Event details, after the Stitch "Trek to Sahyadri" screen: a
/// collapsing hero image, key facts, about, schedule, what to carry,
/// FAQs and a sticky price bar with Book Now.
class EventDetailsScreen extends StatelessWidget {
  const EventDetailsScreen({super.key, required this.summary});

  final EventSummary summary;

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    return Scaffold(
      body: AsyncView<EventDetail>(
        load: () => services.api.event(summary.slug),
        skeleton: _Skeleton(summary: summary),
        builder: (context, event, _) => _Body(event: event, summary: summary),
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton({required this.summary});

  final EventSummary summary;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Hero(
          tag: 'event-${summary.id}',
          child: EventImage(url: summary.bannerUrl, height: 320, width: double.infinity),
        ),
        const Expanded(child: SkeletonList(count: 3, height: 90)),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.event, required this.summary});

  final EventDetail event;
  final EventSummary summary;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final price = event.minPricePaise;
    final soldOut = price == null;
    return Stack(
      children: [
        CustomScrollView(
          slivers: [
            SliverAppBar(
              expandedHeight: 320,
              pinned: true,
              stretch: true,
              backgroundColor: InveonColors.midnight,
              foregroundColor: Colors.white,
              leading: Padding(
                padding: const EdgeInsets.all(8),
                child: CircleAvatar(
                  backgroundColor: Colors.black26,
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
              ),
              flexibleSpace: FlexibleSpaceBar(
                stretchModes: const [StretchMode.zoomBackground],
                background: Stack(
                  fit: StackFit.expand,
                  children: [
                    Hero(
                      tag: 'event-${summary.id}',
                      child: EventImage(url: event.bannerUrl),
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0x66000000), Colors.transparent, Color(0xE60B132B)],
                          stops: [0, 0.4, 1],
                        ),
                      ),
                    ),
                    Positioned(
                      left: 20,
                      right: 20,
                      bottom: 20,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (event.tagline != null)
                            Text(
                              event.tagline!.toUpperCase(),
                              style: text.labelSmall?.copyWith(color: const Color(0xFFFFB68B)),
                            ).animate().fadeIn(delay: 200.ms),
                          const SizedBox(height: 6),
                          Text(
                            event.name,
                            style: text.headlineMedium?.copyWith(color: Colors.white),
                          ).animate().fadeIn(delay: 300.ms).slideY(begin: 0.3),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
              sliver: SliverList.list(
                children: [
                  InveonCard(
                    child: Column(
                      children: [
                        _Fact(icon: Icons.calendar_month_rounded, title: eventDay(event.eventDate), subtitle: eventTime(event.eventDate)),
                        if (event.venueAddress != null) ...[
                          const Divider(height: 24),
                          _Fact(
                            icon: Icons.place_rounded,
                            title: event.venueAddress!,
                            subtitle: event.venueMapUrl != null ? 'Open in Maps' : null,
                            onTap: event.venueMapUrl == null
                                ? null
                                : () => launchUrl(Uri.parse(event.venueMapUrl!), mode: LaunchMode.externalApplication),
                          ),
                        ],
                        const Divider(height: 24),
                        _Fact(
                          icon: Icons.verified_user_rounded,
                          title: 'Hosted by ${event.organizerName}',
                          subtitle: event.rating != null ? '★ ${event.rating!.toStringAsFixed(1)} · ${event.reviewCount} reviews' : null,
                        ),
                      ],
                    ),
                  ).staggered(0),
                  if (event.genderRestriction != null) ...[
                    const SizedBox(height: 12),
                    StatusPill('For ${event.genderRestriction} participants only', tone: PillTone.orange),
                  ],
                  if ((event.description ?? '').isNotEmpty)
                    _Section(
                      title: 'About',
                      child: Text(_plain(event.description!), style: text.bodyLarge?.copyWith(height: 1.55)),
                    ).staggered(1),
                  if (event.photos.isNotEmpty)
                    _Section(
                      title: 'Photos',
                      child: SizedBox(
                        height: 120,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: event.photos.length,
                          separatorBuilder: (_, _) => const SizedBox(width: 10),
                          itemBuilder: (_, i) => EventImage(url: event.photos[i], width: 160, height: 120, radius: InveonRadius.lg),
                        ),
                      ),
                    ).staggered(2),
                  if (event.schedule.isNotEmpty)
                    _Section(
                      title: 'Schedule',
                      child: _Timeline(items: event.schedule),
                    ).staggered(3),
                  if (event.tiers.isNotEmpty)
                    _Section(
                      title: 'Tickets',
                      child: Column(
                        children: [
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
                                          Text(t.name, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                                          if (t.description != null)
                                            Text(t.description!, style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                                          const SizedBox(height: 6),
                                          if (t.available <= 0)
                                            const StatusPill('Sold out', tone: PillTone.red)
                                          else if (t.available <= 10)
                                            StatusPill('Only ${t.available} left', tone: PillTone.orange, dot: true),
                                        ],
                                      ),
                                    ),
                                    Text(
                                      t.pricePaise == 0 ? 'Free' : rupees(t.pricePaise),
                                      style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ).staggered(4),
                  if (event.packing.isNotEmpty)
                    _Section(
                      title: 'What to carry',
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final p in event.packing)
                            Chip(
                              avatar: const Icon(Icons.check_rounded, size: 16, color: InveonColors.success),
                              label: Text(p),
                            ),
                        ],
                      ),
                    ),
                  if (event.faqs.isNotEmpty)
                    _Section(
                      title: 'FAQs',
                      child: Column(
                        children: [
                          for (final (q, a) in event.faqs)
                            ExpansionTile(
                              tilePadding: EdgeInsets.zero,
                              shape: const Border(),
                              title: Text(q, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                              children: [
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(a)),
                                ),
                              ],
                            ),
                        ],
                      ),
                    ),
                  if ((event.cancellationPolicy ?? '').isNotEmpty)
                    _Section(
                      title: 'Cancellation policy',
                      child: Text(_plain(event.cancellationPolicy!), style: text.bodyMedium?.copyWith(color: InveonColors.slate)),
                    ),
                ],
              ),
            ),
          ],
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: Container(
            padding: EdgeInsets.fromLTRB(20, 14, 20, 14 + MediaQuery.of(context).padding.bottom),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(InveonRadius.xl)),
              boxShadow: [BoxShadow(color: Color(0x140B132B), blurRadius: 32, offset: Offset(0, -8))],
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(soldOut ? 'Tickets' : 'Starting from', style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                      Text(
                        soldOut ? 'Sold out' : (price == 0 ? 'Free' : rupees(price)),
                        style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
                SizedBox(
                  width: 170,
                  child: AmberButton(
                    label: !event.bookingOpen ? 'Booking closed' : (soldOut ? 'Sold out' : 'Book Now'),
                    icon: Icons.arrow_forward_rounded,
                    onPressed: !event.bookingOpen || soldOut
                        ? null
                        : () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CheckoutScreen(event: event))),
                  ),
                ),
              ],
            ),
          ).animate().slideY(begin: 1, duration: 450.ms, delay: 200.ms, curve: Curves.easeOutCubic),
        ),
      ],
    );
  }
}

/// Organizer descriptions are rich text (HTML) on the website.
String _plain(String html) => html
    .replaceAll(RegExp(r'<br\s*/?>|</p>|</li>', caseSensitive: false), '\n')
    .replaceAll(RegExp(r'<li[^>]*>', caseSensitive: false), '• ')
    .replaceAll(RegExp(r'<[^>]+>'), '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll(RegExp(r'\n{3,}'), '\n\n')
    .trim();

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.title, this.subtitle, this.onTap});

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: InveonColors.surfaceTint, borderRadius: BorderRadius.circular(InveonRadius.md)),
            child: Icon(icon, color: InveonColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                if (subtitle != null)
                  Text(subtitle!, style: text.bodySmall?.copyWith(color: onTap != null ? InveonColors.primary : InveonColors.slate)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.items});

  final List<ScheduleItem> items;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      children: [
        for (final (i, item) in items.indexed)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 64,
                  child: Text(item.time, style: text.labelLarge?.copyWith(color: InveonColors.primary)),
                ),
                Column(
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      margin: const EdgeInsets.only(top: 3),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i == 0 ? InveonColors.secondary : Colors.white,
                        border: Border.all(color: i == 0 ? InveonColors.secondary : InveonColors.primary, width: 2),
                      ),
                    ),
                    if (i < items.length - 1) Expanded(child: Container(width: 2, color: const Color(0x330066FF))),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item.title, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                        if ((item.description ?? '').isNotEmpty)
                          Text(item.description!, style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
