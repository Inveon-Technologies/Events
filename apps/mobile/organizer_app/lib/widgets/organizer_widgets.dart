import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:intl/intl.dart';

/// A number that counts up from zero when it first appears.
class CountUp extends StatelessWidget {
  const CountUp({super.key, required this.value, this.prefix = '', this.style});

  final double value;
  final String prefix;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final format = NumberFormat.decimalPattern('en_IN');
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: value),
      duration: const Duration(milliseconds: 1100),
      curve: Curves.easeOutCubic,
      builder: (_, v, _) => Text('$prefix${format.format(v.round())}', style: style),
    );
  }
}

class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.prefix = '',
    this.footnote,
    this.footnoteColor,
    this.iconColor = InveonColors.primary,
  });

  final String label;
  final double value;
  final IconData icon;
  final String prefix;
  final String? footnote;
  final Color? footnoteColor;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return InveonCard(
      radius: InveonRadius.lg,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  label,
                  style: text.bodySmall?.copyWith(color: InveonColors.slate, fontWeight: FontWeight.w600),
                ),
              ),
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(color: iconColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                child: Icon(icon, size: 18, color: iconColor),
              ),
            ],
          ),
          const Spacer(),
          CountUp(
            value: value,
            prefix: prefix,
            style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          if (footnote != null)
            Text(
              footnote!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: text.bodySmall?.copyWith(color: footnoteColor ?? InveonColors.slate),
            ),
        ],
      ),
    );
  }
}

/// Bars that grow in, one per day.
class ActivityBars extends StatelessWidget {
  const ActivityBars({super.key, required this.points});

  final List<(String, int)> points;

  @override
  Widget build(BuildContext context) {
    final max = points.fold(1, (m, p) => p.$2 > m ? p.$2 : m);
    return SizedBox(
      height: 80,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final (i, (date, count)) in points.indexed)
            Expanded(
              child: Tooltip(
                message: '$date: $count',
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: count / max),
                  duration: Duration(milliseconds: 600 + i * 25),
                  curve: Curves.easeOutCubic,
                  builder: (_, v, _) => Container(
                    margin: const EdgeInsets.symmetric(horizontal: 1.5),
                    height: 4 + 76 * v,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(4),
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: i == points.length - 1
                            ? const [InveonColors.secondary, InveonColors.amberStart]
                            : const [InveonColors.primary, InveonColors.tertiary],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class AnimatedProgress extends StatelessWidget {
  const AnimatedProgress({super.key, required this.value, this.color = InveonColors.primary, this.height = 8});

  final double value;
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(height),
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: value.clamp(0, 1)),
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeOutCubic,
        builder: (_, v, _) => LinearProgressIndicator(value: v, minHeight: height, color: color, backgroundColor: const Color(0xFFE2E8F0)),
      ),
    );
  }
}

class EventProgressCard extends StatelessWidget {
  const EventProgressCard({
    super.key,
    required this.name,
    required this.eventDate,
    required this.bannerUrl,
    required this.status,
    required this.sold,
    required this.capacity,
    this.extra,
    this.onTap,
  });

  final String name;
  final String eventDate;
  final String? bannerUrl;
  final String status;
  final int sold;
  final int capacity;
  final Widget? extra;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return InveonCard(
      padding: EdgeInsets.zero,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 130,
            child: Stack(
              fit: StackFit.expand,
              children: [
                EventImage(url: bannerUrl),
                Positioned(right: 12, top: 12, child: StatusPill(status.toUpperCase(), tone: StatusPill.toneFor(status))),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.calendar_today_rounded, size: 14, color: InveonColors.primary),
                    const SizedBox(width: 6),
                    Text('${eventDay(eventDate)} · ${eventTime(eventDate)}', style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                  ],
                ),
                const Divider(height: 22),
                Row(
                  children: [
                    Text('Tickets sold: ', style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                    Text('$sold / $capacity', style: text.labelLarge?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(width: 12),
                    Expanded(child: AnimatedProgress(value: capacity == 0 ? 0 : sold / capacity)),
                  ],
                ),
                ?extra,
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class BookingRow extends StatelessWidget {
  const BookingRow({super.key, required this.name, required this.subtitle, required this.amountPaise, required this.status, this.onTap});

  final String name;
  final String subtitle;
  final int amountPaise;
  final String status;
  final VoidCallback? onTap;

  static const _avatarColors = [Color(0xFFE3E7FF), Color(0xFFF3E8FF), Color(0xFFFEF3C7), Color(0xFFDCFCE7)];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      leading: CircleAvatar(
        backgroundColor: _avatarColors[name.hashCode.abs() % _avatarColors.length],
        child: Text(
          initials(name),
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: InveonColors.primaryDeep),
        ),
      ),
      title: Text(name, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(amountPaise == 0 ? 'Free' : rupees(amountPaise), style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          StatusPill(status.replaceAll('_', ' '), tone: StatusPill.toneFor(status)),
        ],
      ),
    );
  }
}
