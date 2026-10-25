import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:inveon_core/inveon_core.dart';

import 'screens/onboarding_screen.dart';
import 'screens/shell.dart';
import 'services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent));
  final services = AppServices();
  runApp(
    Services(
      services: services,
      child: CustomerApp(services: services),
    ),
  );
}

class CustomerApp extends StatelessWidget {
  const CustomerApp({super.key, required this.services});

  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Inveon Events',
      debugShowCheckedModeBanner: false,
      navigatorKey: services.navigatorKey,
      theme: buildInveonTheme(),
      builder: (context, child) => InAppNotificationHost(push: services.push, child: child!),
      home: const _Launch(),
    );
  }
}

/// Animated splash while the session is restored and push starts, then
/// onboarding on first run, else straight into the app.
class _Launch extends StatelessWidget {
  const _Launch();

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    var onboarded = false;
    return AnimatedSplash(
      tagline: 'Plan. Book. Celebrate.',
      work: () async {
        await services.restore();
        onboarded = await services.store.seenOnboarding();
        // Push can wait on the permission prompt; don't hold the splash.
        services.push.init();
      },
      onDone: () {
        Navigator.of(context).pushReplacement(
          PageRouteBuilder<void>(
            transitionDuration: const Duration(milliseconds: 700),
            pageBuilder: (_, _, _) => onboarded ? const HomeShell() : const OnboardingScreen(),
            transitionsBuilder: (_, anim, _, child) => FadeTransition(
              opacity: anim,
              child: ScaleTransition(
                scale: Tween(begin: 1.06, end: 1.0).animate(CurvedAnimation(parent: anim, curve: Curves.easeOutCubic)),
                child: child,
              ),
            ),
          ),
        );
      },
    );
  }
}
