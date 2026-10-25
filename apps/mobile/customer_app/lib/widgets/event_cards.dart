import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import '../api.dart';
import '../screens/event_details_screen.dart';

void openEvent(BuildContext context, EventSummary e) {
  Navigator.of(context).push(
    PageRouteBuilder<void>(
      transitionDuration: const Duration(milliseconds: 500),
      reverseTransitionDuration: const Duration(milliseconds: 400),
      pageBuilder: (_, _, _) => EventDetailsScreen(summary: e),
      transitionsBuilder: (_, anim, _, child) => FadeTransition(opacity: anim, child: child),
    ),
  );
}

class DateBadge extends StatelessWidget {
  const DateBadge(this.iso, {super.key});

  final String iso;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99), boxShadow: InveonShadows.card),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.calendar_today_rounded, size: 13, color: InveonColors.primary),
          const SizedBox(width: 6),
          Text(
            eventDay(iso),
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: InveonColors.midnight),
          ),
        ],
      ),
    );
  }
}

/// Featured hero card: 4:3 image, progressive midnight gradient, title
/// over the image, price and Book Now underneath.
class FeaturedEventCard extends StatelessWidget {
  const FeaturedEventCard({super.key, required this.event, this.badge});

  final EventSummary event;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return InveonCard(
      padding: EdgeInsets.zero,
      onTap: () => openEvent(context, event),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 4 / 3,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Hero(
                  tag: 'event-${event.id}',
                  child: EventImage(url: event.bannerUrl),
                ),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xF20B132B)],
                      stops: [0.45, 1],
                    ),
                  ),
                ),
                Positioned(left: 12, top: 12, child: DateBadge(event.eventDate)),
                if (badge != null)
                  Positioned(
                    right: 12,
                    top: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        gradient: InveonColors.amberGradient,
                        borderRadius: BorderRadius.circular(99),
                        boxShadow: InveonShadows.amberGlow,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.local_fire_department_rounded, size: 14, color: Colors.white),
                          const SizedBox(width: 4),
                          Text(
                            badge!,
                            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.4),
                          ),
                        ],
                      ),
                    ).animate(onPlay: (c) => c.repeat(reverse: true)).scaleXY(begin: 1, end: 1.06, duration: 900.ms),
                  ),
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 14,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        event.name,
                        style: text.headlineSmall?.copyWith(color: Colors.white),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (event.venueAddress != null) ...[
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(Icons.place_outlined, size: 15, color: Colors.white70),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                event.venueAddress!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: text.bodySmall?.copyWith(color: Colors.white70),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Starting from', style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                      Text(event.priceLabel, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
                if (event.rating != null) ...[
                  const Icon(Icons.star_rounded, color: Color(0xFFF59E0B), size: 18),
                  Text(' ${event.rating!.toStringAsFixed(1)}  ', style: text.labelLarge),
                ],
                SizedBox(
                  width: 128,
                  child: AmberButton(label: 'Book Now', onPressed: () => openEvent(context, event)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Standard feed item: 96x96 thumbnail, title, date, place, price pill.
class CompactEventCard extends StatelessWidget {
  const CompactEventCard({super.key, required this.event});

  final EventSummary event;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return InveonCard(
      padding: const EdgeInsets.all(10),
      onTap: () => openEvent(context, event),
      child: Row(
        children: [
          Hero(
            tag: 'event-${event.id}',
            child: EventImage(url: event.bannerUrl, width: 96, height: 96, radius: InveonRadius.lg),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${eventDay(event.eventDate)} · ${eventTime(event.eventDate)}'.toUpperCase(),
                  style: text.labelSmall?.copyWith(color: InveonColors.primary),
                ),
                const SizedBox(height: 4),
                Text(
                  event.name,
                  style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.place_outlined, size: 14, color: InveonColors.muted),
                    const SizedBox(width: 3),
                    Expanded(
                      child: Text(
                        event.venueAddress ?? event.organizerName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.bodySmall?.copyWith(color: InveonColors.slate),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                StatusPill(
                  event.priceLabel,
                  tone: event.minPricePaise == null ? PillTone.red : (event.minPricePaise == 0 ? PillTone.green : PillTone.blue),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
