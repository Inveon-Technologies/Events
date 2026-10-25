import 'dart:async';

import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import '../services.dart';
import 'explore_screen.dart';
import 'home_screen.dart';
import 'login_screen.dart';
import 'profile_screen.dart';
import 'ticket_detail_screen.dart';
import 'tickets_screen.dart';

/// Bottom-nav shell: Home, Explore, Tickets, Profile, on a frosted
/// floating bar with a sliding indicator (design system "Level 3").
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, this.initialTab = 0, this.loginIdentifier});

  final int initialTab;

  /// Open sign-in prefilled with this (e.g. a booking just made).
  final String? loginIdentifier;

  static HomeShellState? of(BuildContext context) => context.findAncestorStateOfType<HomeShellState>();

  @override
  State<HomeShell> createState() => HomeShellState();
}

class HomeShellState extends State<HomeShell> {
  late int _tab = widget.initialTab;
  StreamSubscription<Map<String, String>>? _taps;

  static const _items = [
    (Icons.home_outlined, Icons.home_rounded, 'Home'),
    (Icons.explore_outlined, Icons.explore_rounded, 'Explore'),
    (Icons.confirmation_number_outlined, Icons.confirmation_number_rounded, 'Tickets'),
    (Icons.person_outline_rounded, Icons.person_rounded, 'Profile'),
  ];

  @override
  void initState() {
    super.initState();
    final services = Services.read(context);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      services.updates.start();
      services.notifications.load();
      if (widget.loginIdentifier != null && !services.signedIn) {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LoginScreen(initialIdentifier: widget.loginIdentifier)));
      }
      final launch = services.push.takeLaunchTap();
      if (launch != null) openNotification(launch);
    });
    _taps = services.push.onTap.listen(openNotification);
  }

  @override
  void dispose() {
    _taps?.cancel();
    super.dispose();
  }

  void select(int tab) => setState(() => _tab = tab);

  /// Where a tapped notification leads.
  Future<void> openNotification(Map<String, String> data) async {
    final services = Services.read(context);
    if (data['kind'] == 'app_update') {
      services.updates.check(force: true);
      return;
    }
    final reference = data['bookingReference'];
    select(2);
    if (reference == null || !services.signedIn) return;
    try {
      final bookings = await services.api.myBookings();
      final match = bookings.where((b) => b.bookingReference == reference).firstOrNull;
      if (match != null && mounted) {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => TicketDetailScreen(summary: match)));
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final pages = [HomeScreen(onExplore: () => select(1)), const ExploreScreen(), const TicketsScreen(), const ProfileScreen()];
    return Scaffold(
      extendBody: true,
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        switchInCurve: Curves.easeOutCubic,
        transitionBuilder: (child, anim) => FadeTransition(
          opacity: anim,
          child: SlideTransition(
            position: Tween(begin: const Offset(0, 0.02), end: Offset.zero).animate(anim),
            child: child,
          ),
        ),
        child: KeyedSubtree(key: ValueKey(_tab), child: pages[_tab]),
      ),
      bottomNavigationBar: FrostedNavBar(items: _items, index: _tab, onSelect: select),
    );
  }
}
