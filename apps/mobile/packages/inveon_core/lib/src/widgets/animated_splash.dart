import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../theme.dart';
import 'logo_mark.dart';

/// Launch screen: the logo facets assemble over a breathing electric
/// gradient with orbiting light, then [onDone] runs while [work] (startup
/// tasks) has also finished.
class AnimatedSplash extends StatefulWidget {
  const AnimatedSplash({super.key, required this.tagline, required this.work, required this.onDone, this.subtitle});

  final String tagline;
  final String? subtitle;
  final Future<void> Function() work;
  final VoidCallback onDone;

  @override
  State<AnimatedSplash> createState() => _AnimatedSplashState();
}

class _AnimatedSplashState extends State<AnimatedSplash> with TickerProviderStateMixin {
  late final AnimationController _logo = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..forward();
  late final AnimationController _orbit = AnimationController(vsync: this, duration: const Duration(seconds: 6))..repeat();

  @override
  void initState() {
    super.initState();
    Future.wait([widget.work().catchError((_) {}), Future<void>.delayed(const Duration(milliseconds: 1900))]).then((_) {
      if (mounted) widget.onDone();
    });
  }

  @override
  void dispose() {
    _logo.dispose();
    _orbit.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: InveonColors.midnightGradient),
        child: Stack(
          alignment: Alignment.center,
          children: [
            AnimatedBuilder(
              animation: _orbit,
              builder: (context, _) => CustomPaint(size: MediaQuery.of(context).size, painter: _OrbitPainter(_orbit.value)),
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: const [BoxShadow(color: Color(0x660066FF), blurRadius: 40, spreadRadius: 4)],
                  ),
                  child: AnimatedBuilder(
                    animation: _logo,
                    builder: (_, _) => InveonLogoMark(size: 72, progress: _logo.value),
                  ),
                ).animate().scale(begin: const Offset(0.6, 0.6), duration: 700.ms, curve: Curves.easeOutBack),
                const SizedBox(height: 28),
                Text(
                  'INVEON ${widget.subtitle ?? 'EVENTS'}',
                  style: text.headlineMedium?.copyWith(color: Colors.white, letterSpacing: 3, fontWeight: FontWeight.w800),
                ).animate().fadeIn(delay: 600.ms, duration: 500.ms).slideY(begin: 0.4, curve: Curves.easeOutCubic),
                const SizedBox(height: 8),
                Text(
                  widget.tagline,
                  style: text.bodyLarge?.copyWith(color: Colors.white70),
                ).animate().fadeIn(delay: 900.ms, duration: 500.ms).shimmer(delay: 1300.ms, duration: 900.ms, color: InveonColors.tertiary),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _OrbitPainter extends CustomPainter {
  _OrbitPainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    for (var i = 0; i < 3; i++) {
      final radius = 120.0 + i * 70;
      final ring = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Colors.white.withValues(alpha: 0.06);
      canvas.drawCircle(center, radius, ring);
      final angle = (t + i / 3) * 2 * math.pi * (i.isEven ? 1 : -1);
      final dot = center + Offset(math.cos(angle), math.sin(angle)) * radius;
      final color = i == 1 ? InveonColors.secondary : InveonColors.tertiary;
      canvas.drawCircle(dot, 4, Paint()..color = color);
      canvas.drawCircle(dot, 14, Paint()..color = color.withValues(alpha: 0.15));
    }
  }

  @override
  bool shouldRepaint(_OrbitPainter old) => old.t != t;
}
