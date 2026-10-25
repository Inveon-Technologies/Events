import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import '../services.dart';
import 'login_screen.dart';
import 'shell.dart';

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    void finish({bool login = false}) {
      services.store.markOnboarded();
      Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => const HomeShell()));
      if (login) Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const LoginScreen()));
    }

    return InveonOnboarding(
      onFinish: finish,
      onLogin: () => finish(login: true),
      loginPrompt: 'Booked before?',
      slides: const [
        OnboardingSlide(
          title: 'Discover events near you',
          body: 'Treks, workshops, music and more, all in one app.',
          visual: OnboardingCardStack(
            image: AssetImage('assets/images/hero-trekker.jpg', package: 'inveon_core'),
            tag: 'TRENDING TREK',
            meta: 'NOV 28 · WEEKEND PASS',
            title: 'Trek to Sahyadri Western Ghats',
            subtitle: 'Lonavala, Maharashtra',
            badge: '₹1,299',
          ),
        ),
        OnboardingSlide(
          title: 'Book in seconds',
          body: 'Pick your tickets, pay securely with UPI or card, and get confirmed instantly.',
          accent: InveonColors.secondary,
          visual: OnboardingIconVisual(
            icon: Icons.bolt_rounded,
            gradient: InveonColors.amberGradient,
            chips: [
              (Icons.qr_code_2_rounded, 'UPI & cards'),
              (Icons.verified_rounded, 'Instant confirm'),
              (Icons.groups_rounded, 'Group tickets'),
            ],
          ),
        ),
        OnboardingSlide(
          title: 'Your pass, always with you',
          body: 'QR tickets in the app, reminders before the event, and updates the moment anything changes.',
          accent: InveonColors.tertiary,
          visual: OnboardingCardStack(
            image: AssetImage('assets/images/rajgad-miniature.jpg', package: 'inveon_core'),
            tag: 'VALID TICKET',
            meta: 'SAT, DEC 12 · 05:30 AM',
            title: 'Rajgad Fort Night Trek',
            subtitle: 'Scan at the check-in gate',
            badge: 'QR',
          ),
        ),
      ],
    );
  }
}
