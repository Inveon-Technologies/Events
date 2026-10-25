import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../theme.dart';
import 'logo_mark.dart';

class OnboardingSlide {
  const OnboardingSlide({required this.title, required this.body, required this.visual, this.accent = InveonColors.primary});

  final String title;
  final String body;
  final Widget visual;
  final Color accent;
}

/// First-run landing / onboarding, after the Stitch "onboarding" screen:
/// a parallax carousel of floating cards, an animated page indicator and
/// a call to action that pulses on the last slide.
class InveonOnboarding extends StatefulWidget {
  const InveonOnboarding({
    super.key,
    required this.slides,
    required this.onFinish,
    this.onLogin,
    this.finishLabel = 'Get Started',
    this.loginPrompt = 'Already have an account?',
    this.wordmarkSubtitle,
  });

  final List<OnboardingSlide> slides;
  final VoidCallback onFinish;
  final VoidCallback? onLogin;
  final String finishLabel;
  final String loginPrompt;
  final String? wordmarkSubtitle;

  @override
  State<InveonOnboarding> createState() => _InveonOnboardingState();
}

class _InveonOnboardingState extends State<InveonOnboarding> with SingleTickerProviderStateMixin {
  final _controller = PageController();
  late final AnimationController _float = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat(reverse: true);
  double _page = 0;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() => _page = _controller.page ?? 0));
  }

  @override
  void dispose() {
    _controller.dispose();
    _float.dispose();
    super.dispose();
  }

  bool get _last => _page.round() == widget.slides.length - 1;

  void _next() {
    if (_last) {
      widget.onFinish();
    } else {
      _controller.nextPage(duration: const Duration(milliseconds: 450), curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final index = _page.round().clamp(0, widget.slides.length - 1);
    final slide = widget.slides[index];
    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // Soft colour wash that follows the current slide's accent.
          AnimatedContainer(
            duration: const Duration(milliseconds: 600),
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0, -0.35),
                radius: 0.9,
                colors: [slide.accent.withValues(alpha: 0.14), Colors.white],
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 12, 0),
                  child: Row(
                    children: [
                      InveonWordmark(size: 30, subtitle: widget.wordmarkSubtitle).animate().fadeIn(duration: 500.ms).slideY(begin: -0.5),
                      const Spacer(),
                      AnimatedOpacity(
                        opacity: _last ? 0 : 1,
                        duration: const Duration(milliseconds: 250),
                        child: TextButton(onPressed: _last ? null : widget.onFinish, child: const Text('Skip')),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: _controller,
                    itemCount: widget.slides.length,
                    itemBuilder: (context, i) {
                      final delta = i - _page;
                      return AnimatedBuilder(
                        animation: _float,
                        builder: (context, child) {
                          final bob = math.sin(_float.value * math.pi) * 8;
                          return Transform.translate(
                            offset: Offset(delta * 60, bob),
                            child: Transform.rotate(
                              angle: delta * -0.12,
                              child: Transform.scale(
                                scale: 1 - delta.abs() * 0.15,
                                child: Opacity(opacity: (1 - delta.abs()).clamp(0, 1), child: child),
                              ),
                            ),
                          );
                        },
                        child: Center(child: widget.slides[i].visual),
                      );
                    },
                  ),
                ),
                _Dots(count: widget.slides.length, page: _page),
                const SizedBox(height: 28),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 400),
                    transitionBuilder: (child, anim) => FadeTransition(
                      opacity: anim,
                      child: SlideTransition(
                        position: Tween(begin: const Offset(0, 0.2), end: Offset.zero).animate(anim),
                        child: child,
                      ),
                    ),
                    child: Column(
                      key: ValueKey(index),
                      children: [
                        Text(slide.title, textAlign: TextAlign.center, style: text.displaySmall),
                        const SizedBox(height: 10),
                        Text(
                          slide.body,
                          textAlign: TextAlign.center,
                          style: text.bodyLarge?.copyWith(color: InveonColors.slate),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: _PulseWhen(
                    active: _last,
                    child: FilledButton(
                      onPressed: _next,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 250),
                            child: Text(_last ? widget.finishLabel : 'Next', key: ValueKey(_last)),
                          ),
                          const SizedBox(width: 8),
                          const Icon(Icons.arrow_forward_rounded),
                        ],
                      ),
                    ),
                  ),
                ),
                if (widget.onLogin != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(widget.loginPrompt, style: text.bodyMedium?.copyWith(color: InveonColors.slate)),
                        TextButton(onPressed: widget.onLogin, child: const Text('Login')),
                      ],
                    ),
                  )
                else
                  const SizedBox(height: 24),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.page});

  final int count;
  final double page;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          Builder(
            builder: (_) {
              final t = (1 - (page - i).abs()).clamp(0.0, 1.0);
              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: 8 + 18 * t,
                height: 6,
                decoration: BoxDecoration(
                  color: Color.lerp(const Color(0xFFCBD5E1), InveonColors.primary, t),
                  borderRadius: BorderRadius.circular(6),
                ),
              );
            },
          ),
      ],
    );
  }
}

class _PulseWhen extends StatelessWidget {
  const _PulseWhen({required this.active, required this.child});

  final bool active;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!active) return child;
    return child.animate(onPlay: (c) => c.repeat(reverse: true)).scaleXY(begin: 1, end: 1.03, duration: 900.ms, curve: Curves.easeInOut);
  }
}

/// The floating event card used on onboarding slides (centre card with
/// two tilted cards peeking out behind it).
class OnboardingCardStack extends StatelessWidget {
  const OnboardingCardStack({
    super.key,
    required this.image,
    required this.tag,
    required this.title,
    required this.subtitle,
    required this.meta,
    this.badge,
  });

  final ImageProvider image;
  final String tag;
  final String title;
  final String subtitle;
  final String meta;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    Widget ghost(double angle, double dx) => Transform.translate(
      offset: Offset(dx, 18),
      child: Transform.rotate(
        angle: angle,
        child: Container(
          width: 220,
          height: 250,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(InveonRadius.xl),
            border: Border.all(color: InveonColors.outline),
            boxShadow: InveonShadows.card,
          ),
        ),
      ),
    );
    return SizedBox(
      width: 320,
      height: 330,
      child: Stack(
        alignment: Alignment.center,
        children: [
          ghost(-0.08, -46),
          ghost(0.08, 46),
          Container(
            width: 260,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(InveonRadius.xl),
              boxShadow: InveonShadows.raised,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(InveonRadius.lg),
                  child: Stack(
                    children: [
                      Image(image: image, height: 150, width: double.infinity, fit: BoxFit.cover),
                      Positioned(
                        left: 8,
                        top: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(color: InveonColors.primary, borderRadius: BorderRadius.circular(99)),
                          child: Text(tag, style: text.labelSmall?.copyWith(color: Colors.white)),
                        ),
                      ),
                      if (badge != null)
                        Positioned(
                          right: 8,
                          bottom: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                            child: Text(badge!, style: text.labelLarge?.copyWith(fontWeight: FontWeight.w800)),
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(6, 10, 6, 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(meta, style: text.labelSmall?.copyWith(color: InveonColors.primary)),
                      const SizedBox(height: 4),
                      Text(
                        title,
                        style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.place_outlined, size: 14, color: InveonColors.muted),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              subtitle,
                              style: text.bodySmall?.copyWith(color: InveonColors.slate),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Icon-led slide visual: a glowing gradient disc with satellite chips.
class OnboardingIconVisual extends StatelessWidget {
  const OnboardingIconVisual({super.key, required this.icon, required this.chips, this.gradient = InveonColors.electricGradient});

  final IconData icon;
  final List<(IconData, String)> chips;
  final Gradient gradient;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    const positions = [Alignment(-1, -0.7), Alignment(1, -0.2), Alignment(-0.85, 0.75)];
    return SizedBox(
      width: 320,
      height: 320,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 170,
            height: 170,
            decoration: BoxDecoration(shape: BoxShape.circle, gradient: gradient, boxShadow: InveonShadows.blueGlow),
            child: Icon(icon, size: 76, color: Colors.white),
          ).animate(onPlay: (c) => c.repeat(reverse: true)).scaleXY(begin: 0.97, end: 1.03, duration: 1600.ms, curve: Curves.easeInOut),
          for (final (i, (chipIcon, label)) in chips.take(3).indexed)
            Align(
              alignment: positions[i],
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(InveonRadius.lg),
                  boxShadow: InveonShadows.raised,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(chipIcon, size: 18, color: i == 1 ? InveonColors.secondary : InveonColors.primary),
                    const SizedBox(width: 8),
                    Text(label, style: text.labelLarge),
                  ],
                ),
              ).animate(delay: (250 + i * 180).ms).fadeIn().scale(begin: const Offset(0.6, 0.6), curve: Curves.easeOutBack),
            ),
        ],
      ),
    );
  }
}
