import 'dart:async';

import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import '../services.dart';
import 'bookings_screen.dart';
import 'checkin_screen.dart';
import 'dashboard_screen.dart';
import 'events_screen.dart';
import 'more_screen.dart';

/// Dashboard, Events, Bookings, Check-In, More (Stitch organizer nav).
/// Gate volunteers only get Check-In and More: that's all their role
/// may use in the API.
class OrganizerShell extends StatefulWidget {
  const OrganizerShell({super.key});

  static OrganizerShellState? of(BuildContext context) => context.findAncestorStateOfType<OrganizerShellState>();

  @override
  State<OrganizerShell> createState() => OrganizerShellState();
}

class OrganizerShellState extends State<OrganizerShell> {
  int _tab = 0;
  String? _checkInEventId;
  String? _bookingsEventId;
  StreamSubscription<Map<String, String>>? _taps;

  bool get _volunteer => Services.read(context).user?.isGateVolunteer ?? false;

  @override
  void initState() {
    super.initState();
    final services = Services.read(context);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      services.updates.start();
      services.notifications.load();
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

  void openNotification(Map<String, String> data) {
    if (data['kind'] == 'app_update') {
      Services.read(context).updates.check(force: true);
      return;
    }
    if (!_volunteer) showBookings(eventId: data['eventId']);
  }

  void showCheckIn([String? eventId]) => setState(() {
    _checkInEventId = eventId;
    _tab = _volunteer ? 0 : 3;
  });

  void showBookings({String? eventId}) => setState(() {
    _bookingsEventId = eventId;
    _tab = 2;
  });

  void select(int i) => setState(() => _tab = i);

  @override
  Widget build(BuildContext context) {
    final volunteer = _volunteer;
    final pages = volunteer
        ? [CheckInScreen(initialEventId: _checkInEventId), const MoreScreen()]
        : [
            const DashboardScreen(),
            const EventsScreen(),
            BookingsScreen(key: ValueKey(_bookingsEventId), eventId: _bookingsEventId),
            CheckInScreen(key: ValueKey(_checkInEventId), initialEventId: _checkInEventId),
            const MoreScreen(),
          ];
    final items = volunteer
        ? const [
            (Icons.qr_code_scanner_outlined, Icons.qr_code_scanner_rounded, 'Check-In'),
            (Icons.more_horiz_rounded, Icons.more_horiz_rounded, 'More'),
          ]
        : const [
            (Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, 'Dashboard'),
            (Icons.event_outlined, Icons.event_rounded, 'Events'),
            (Icons.receipt_long_outlined, Icons.receipt_long_rounded, 'Bookings'),
            (Icons.qr_code_scanner_outlined, Icons.qr_code_scanner_rounded, 'Check-In'),
            (Icons.more_horiz_rounded, Icons.more_horiz_rounded, 'More'),
          ];
    final tab = _tab.clamp(0, pages.length - 1);
    return Scaffold(
      extendBody: true,
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 280),
        transitionBuilder: (child, anim) => FadeTransition(opacity: anim, child: child),
        child: KeyedSubtree(key: ValueKey(tab), child: pages[tab]),
      ),
      bottomNavigationBar: FrostedNavBar(items: items, index: tab, onSelect: select),
    );
  }
}

/// "ORGANIZER WORKSPACE" header from the Stitch organizer screens.
class WorkspaceHeader extends StatelessWidget implements PreferredSizeWidget {
  const WorkspaceHeader({super.key, this.title});

  final String? title;

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    final text = Theme.of(context).textTheme;
    return AppBar(
      toolbarHeight: 60,
      titleSpacing: 16,
      title: Row(
        children: [
          const InveonLogoMark(size: 30),
          Container(width: 1, height: 22, margin: const EdgeInsets.symmetric(horizontal: 10), color: const Color(0x260B132B)),
          Text(title ?? 'ORGANIZER WORKSPACE', style: text.labelLarge?.copyWith(color: InveonColors.slate, letterSpacing: 0.8)),
        ],
      ),
      actions: [
        if (!(services.user?.isGateVolunteer ?? false))
          NotificationBell(center: services.notifications, onPressed: () => openOrganizerNotifications(context)),
        Padding(
          padding: const EdgeInsets.only(right: 12),
          child: CircleAvatar(
            radius: 18,
            backgroundColor: const Color(0xFFE3E7FF),
            child: Text(
              initials(services.user?.name ?? '?'),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: InveonColors.primaryDeep),
            ),
          ),
        ),
      ],
    );
  }
}
