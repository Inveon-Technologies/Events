import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:inveon_core/inveon_core.dart';

import 'screens/login_screen.dart';
import 'screens/shell.dart';
import 'services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent));
  final services = AppServices();
  runApp(
    Services(
      services: services,
      child: OrganizerApp(services: services),
    ),
  );
}

class OrganizerApp extends StatelessWidget {
  const OrganizerApp({super.key, required this.services});

  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Inveon Organizer',
      debugShowCheckedModeBanner: false,
      navigatorKey: services.navigatorKey,
      theme: buildInveonTheme(),
      builder: (context, child) => InAppNotificationHost(push: services.push, child: child!),
      home: const _Launch(),
    );
  }
}

class _Launch extends StatefulWidget {
  const _Launch();

  @override
  State<_Launch> createState() => _LaunchState();
}

class _LaunchState extends State<_Launch> {
  bool _ready = false;
  bool _onboarded = true;

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    if (!_ready) {
      return AnimatedSplash(
        subtitle: 'ORGANIZER',
        tagline: 'Your events, in your pocket.',
        work: () async {
          await services.restore();
          _onboarded = await services.store.seenOnboarding();
          services.push.init();
        },
        onDone: () => setState(() => _ready = true),
      );
    }
    // Rebuilds on sign-in / sign-out (Services is an InheritedNotifier).
    final Widget page = !_onboarded
        ? _OrganizerOnboarding(onDone: () => setState(() => _onboarded = true))
        : services.signedIn
        ? const OrganizerShell()
        : const LoginScreen();
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 500),
      child: KeyedSubtree(key: ValueKey(page.runtimeType), child: page),
    );
  }
}

class _OrganizerOnboarding extends StatelessWidget {
  const _OrganizerOnboarding({required this.onDone});

  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final services = Services.read(context);
    return InveonOnboarding(
      wordmarkSubtitle: 'ORGANIZER',
      finishLabel: 'Sign in',
      onFinish: () {
        services.store.markOnboarded();
        onDone();
      },
      slides: const [
        OnboardingSlide(
          title: 'Run your events on the go',
          body: 'Live sales, bookings and revenue for every event, updated as they happen.',
          visual: OnboardingIconVisual(
            icon: Icons.insights_rounded,
            chips: [
              (Icons.currency_rupee_rounded, 'Revenue'),
              (Icons.confirmation_number_rounded, 'Tickets sold'),
              (Icons.trending_up_rounded, 'This week'),
            ],
          ),
        ),
        OnboardingSlide(
          title: 'Check in at the gate',
          body: 'Scan QR tickets with your camera. Every ticket gets in exactly once, even across gates.',
          accent: InveonColors.success,
          visual: OnboardingIconVisual(
            icon: Icons.qr_code_scanner_rounded,
            gradient: LinearGradient(colors: [Color(0xFF16A34A), Color(0xFF00D2FF)]),
            chips: [(Icons.flash_on_rounded, 'Torch'), (Icons.verified_rounded, 'Verified'), (Icons.keyboard_rounded, 'Manual code')],
          ),
        ),
        OnboardingSlide(
          title: 'Never miss a booking',
          body: 'Push notifications for every new booking and cancellation.',
          accent: InveonColors.secondary,
          visual: OnboardingIconVisual(
            icon: Icons.notifications_active_rounded,
            gradient: InveonColors.amberGradient,
            chips: [
              (Icons.person_add_alt_1_rounded, 'New booking'),
              (Icons.event_busy_rounded, 'Cancelled'),
              (Icons.rocket_launch_rounded, 'App updates'),
            ],
          ),
        ),
      ],
    );
  }
}
