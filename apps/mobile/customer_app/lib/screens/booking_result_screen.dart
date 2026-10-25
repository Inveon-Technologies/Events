import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:inveon_core/inveon_core.dart';

import '../api.dart';
import 'shell.dart';

/// "Booking confirmed" with a confetti burst and a drawn check mark
/// (Stitch "booking_confirmed"); pending / failed states reuse the layout.
class BookingResultScreen extends StatefulWidget {
  const BookingResultScreen({
    super.key,
    required this.event,
    required this.bookingReference,
    required this.status,
    required this.email,
  });

  final EventDetail event;
  final String bookingReference;
  final String status;
  final String email;

  @override
  State<BookingResultScreen> createState() => _BookingResultScreenState();
}

class _BookingResultScreenState extends State<BookingResultScreen> with TickerProviderStateMixin {
  late final AnimationController _burst = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400));
  late final AnimationController _check = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
  final _particles = List.generate(70, (i) => _Particle(math.Random(i)));

  bool get confirmed => widget.status == 'confirmed';

  @override
  void initState() {
    super.initState();
    if (confirmed) {
      HapticFeedback.heavyImpact();
      _burst.forward();
    }
    _check.forward();
  }

  @override
  void dispose() {
    _burst.dispose();
    _check.dispose();
    super.dispose();
  }

  void _viewTickets() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => HomeShell(initialTab: 2, loginIdentifier: widget.bookingReference)),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final (title, message, color, icon) = switch (widget.status) {
      'confirmed' => (
        'Booking confirmed!',
        'Your tickets are on their way to ${widget.email} and WhatsApp.',
        InveonColors.success,
        Icons.check_rounded,
      ),
      'pending' => (
        'Confirming your payment',
        "We're waiting for the bank. You'll get a notification and email as soon as it's confirmed.",
        InveonColors.secondary,
        Icons.hourglass_top_rounded,
      ),
      _ => (
        'Booking not completed',
        'The payment did not go through. No money was taken, or it will be refunded automatically.',
        InveonColors.error,
        Icons.close_rounded,
      ),
    };
    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          AnimatedBuilder(
            animation: _burst,
            builder: (context, _) => CustomPaint(size: MediaQuery.of(context).size, painter: _ConfettiPainter(_particles, _burst.value)),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  const Spacer(),
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color.withValues(alpha: 0.12),
                      boxShadow: [BoxShadow(color: color.withValues(alpha: 0.25), blurRadius: 40, spreadRadius: 6)],
                    ),
                    child: Center(
                      child: Container(
                        width: 84,
                        height: 84,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
                        child: confirmed
                            ? AnimatedBuilder(
                                animation: _check,
                                builder: (_, _) => CustomPaint(painter: _CheckPainter(_check.value)),
                              )
                            : Icon(icon, color: Colors.white, size: 44),
                      ),
                    ),
                  ).animate().scale(begin: const Offset(0.3, 0.3), duration: 700.ms, curve: Curves.elasticOut),
                  const SizedBox(height: 28),
                  Text(title, style: text.headlineMedium, textAlign: TextAlign.center).animate().fadeIn(delay: 300.ms).slideY(begin: 0.3),
                  const SizedBox(height: 10),
                  Text(
                    message,
                    style: text.bodyLarge?.copyWith(color: InveonColors.slate),
                    textAlign: TextAlign.center,
                  ).animate().fadeIn(delay: 450.ms),
                  const SizedBox(height: 24),
                  InveonCard(
                    child: Column(
                      children: [
                        Text('BOOKING ID', style: text.labelSmall?.copyWith(color: InveonColors.slate)),
                        const SizedBox(height: 4),
                        SelectableText(
                          widget.bookingReference,
                          style: text.headlineSmall?.copyWith(color: InveonColors.primary, letterSpacing: 1.5),
                        ),
                        const Divider(height: 24),
                        Text(
                          widget.event.name,
                          style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                          textAlign: TextAlign.center,
                        ),
                        Text(
                          '${eventDay(widget.event.eventDate)} · ${eventTime(widget.event.eventDate)}',
                          style: text.bodySmall?.copyWith(color: InveonColors.slate),
                        ),
                      ],
                    ),
                  ).animate().fadeIn(delay: 600.ms).slideY(begin: 0.2),
                  const Spacer(),
                  FilledButton.icon(
                    onPressed: _viewTickets,
                    icon: const Icon(Icons.confirmation_number_rounded),
                    label: const Text('View my tickets'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () =>
                        Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute<void>(builder: (_) => const HomeShell()), (_) => false),
                    child: const Text('Back to events'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Particle {
  _Particle(math.Random r)
    : angle = -math.pi / 2 + (r.nextDouble() - 0.5) * math.pi * 1.2,
      speed = 0.5 + r.nextDouble() * 0.7,
      spin = (r.nextDouble() - 0.5) * 12,
      size = 6 + r.nextDouble() * 6,
      color = const [
        InveonColors.primary,
        InveonColors.secondary,
        InveonColors.tertiary,
        Color(0xFFF59E0B),
        InveonColors.success,
      ][r.nextInt(5)];

  final double angle;
  final double speed;
  final double spin;
  final double size;
  final Color color;
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.particles, this.t);

  final List<_Particle> particles;
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    if (t == 0 || t == 1) return;
    final origin = Offset(size.width / 2, size.height * 0.32);
    for (final p in particles) {
      final distance = p.speed * size.height * 0.55 * Curves.easeOut.transform(t);
      final gravity = 0.5 * 900 * t * t;
      final pos = origin + Offset(math.cos(p.angle) * distance, math.sin(p.angle) * distance + gravity);
      final paint = Paint()..color = p.color.withValues(alpha: (1 - t).clamp(0, 1));
      canvas.save();
      canvas.translate(pos.dx, pos.dy);
      canvas.rotate(p.spin * t);
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromCenter(center: Offset.zero, width: p.size, height: p.size * 0.5), const Radius.circular(2)),
        paint,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => old.t != t;
}

class _CheckPainter extends CustomPainter {
  _CheckPainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(size.width * 0.28, size.height * 0.52)
      ..lineTo(size.width * 0.44, size.height * 0.67)
      ..lineTo(size.width * 0.73, size.height * 0.36);
    final metric = path.computeMetrics().first;
    final paint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 7
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(metric.extractPath(0, metric.length * Curves.easeOut.transform(t)), paint);
  }

  @override
  bool shouldRepaint(_CheckPainter old) => old.t != t;
}
