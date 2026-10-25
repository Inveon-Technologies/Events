import 'package:flutter/material.dart';

import '../theme.dart';

/// The Inveon "E" mark (apps/web/public/favicon.svg), drawn in code so it
/// can animate: [progress] 0 → 1 flies the four facets in from apart.
class InveonLogoMark extends StatelessWidget {
  const InveonLogoMark({super.key, this.size = 56, this.progress = 1});

  final double size;
  final double progress;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(painter: _LogoPainter(progress.clamp(0, 1))),
    );
  }
}

class _LogoPainter extends CustomPainter {
  _LogoPainter(this.t);

  final double t;

  // Facets in the SVG's 36x36 space: (points, colour, fly-in direction).
  static const _facets = <(List<Offset>, Color, Offset)>[
    ([Offset(7, 6), Offset(16, 11), Offset(16, 25), Offset(7, 20)], Color(0xFF0066FF), Offset(-14, 0)),
    ([Offset(19, 11), Offset(28, 6), Offset(28, 20), Offset(19, 25)], Color(0xFF0052CC), Offset(14, 0)),
    ([Offset(16, 27), Offset(7, 22), Offset(16, 17), Offset(25, 22)], Color(0xFFF59E0B), Offset(0, 14)),
    ([Offset(16, 11), Offset(25, 6), Offset(16, 1), Offset(7, 6)], Color(0xFF0080FF), Offset(0, -14)),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 36;
    canvas.save();
    canvas.scale(scale);
    canvas.translate(0.5, 4);
    for (final (i, (points, color, from)) in _facets.indexed) {
      // Staggered: each facet starts a little after the previous one.
      final local = Curves.easeOutBack.transform(((t - i * 0.12) / 0.64).clamp(0.0, 1.0));
      final offset = from * (1 - local);
      final paint = Paint()..color = color.withValues(alpha: local.clamp(0.0, 1.0));
      final path = Path()..addPolygon(points.map((p) => p + offset).toList(), true);
      canvas.drawPath(path, paint);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_LogoPainter old) => old.t != t;
}

/// Logo mark + "INVEON EVENTS" wordmark, as in the app headers.
class InveonWordmark extends StatelessWidget {
  const InveonWordmark({super.key, this.size = 28, this.subtitle, this.light = false});

  final double size;
  final String? subtitle;
  final bool light;

  @override
  Widget build(BuildContext context) {
    final color = light ? Colors.white : InveonColors.midnight;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        InveonLogoMark(size: size),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'INVEON',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: size * 0.55, letterSpacing: 1.2, color: color, height: 1),
            ),
            Text(
              subtitle ?? 'EVENTS',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: size * 0.3,
                letterSpacing: 2.4,
                color: light ? Colors.white70 : InveonColors.primary,
                height: 1.3,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
