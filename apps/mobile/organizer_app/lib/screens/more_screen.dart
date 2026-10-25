import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../services.dart';
import 'shell.dart';

/// The inbox (pushes sent to this organizer) with the account's recent
/// activity feed (GET /organizer/notifications) underneath.
void openOrganizerNotifications(BuildContext context) {
  final services = Services.read(context);
  final shell = OrganizerShell.of(context);
  Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (ctx) => NotificationsScreen(
        center: services.notifications,
        onOpen: (data) {
          Navigator.of(ctx).pop();
          shell?.openNotification(data);
        },
        extra: _ActivityFeed(api: services.api),
      ),
    ),
  );
}

class _ActivityFeed extends StatelessWidget {
  const _ActivityFeed({required this.api});

  final OrganizerApi api;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return FutureBuilder<List<ActivityItem>>(
      future: api.activity(),
      builder: (context, snap) {
        final items = snap.data ?? const <ActivityItem>[];
        if (items.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 16, 0, 8),
              child: Text('Recent activity', style: text.titleLarge),
            ),
            for (final a in items.take(30))
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Builder(
                  builder: (_) {
                    final (icon, color) = iconForKind(switch (a.category) {
                      'bookings' => 'new_booking',
                      'cancellations' => 'booking_cancelled',
                      _ => a.category,
                    });
                    return CircleAvatar(
                      backgroundColor: color.withValues(alpha: 0.12),
                      child: Icon(icon, color: color, size: 20),
                    );
                  },
                ),
                title: Text(a.title, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                subtitle: Text(a.message),
                trailing: Text(timeAgo(a.createdAt), style: text.bodySmall?.copyWith(color: InveonColors.muted)),
              ),
          ],
        );
      },
    );
  }
}

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    final user = services.user;
    final text = Theme.of(context).textTheme;
    void web(String path) => launchUrl(Uri.parse('${InveonConfig.baseUrl}$path'), mode: LaunchMode.externalApplication);
    final role = switch (user?.role) {
      'organizer_owner' => 'Owner',
      'organizer_staff' => 'Staff',
      'gate_volunteer' => 'Gate volunteer',
      _ => '',
    };
    return Scaffold(
      appBar: const WorkspaceHeader(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
        children: [
          InveonCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: const Color(0xFFE3E7FF),
                  child: Text(initials(user?.name ?? '?'), style: text.titleLarge?.copyWith(color: InveonColors.primaryDeep)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user?.name ?? '', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                      Text(user?.email ?? '', style: text.bodySmall?.copyWith(color: InveonColors.slate)),
                      const SizedBox(height: 6),
                      StatusPill(role),
                    ],
                  ),
                ),
              ],
            ),
          ).animate().fadeIn().slideY(begin: 0.1),
          const SizedBox(height: 12),
          InveonCard(
            padding: EdgeInsets.zero,
            radius: InveonRadius.lg,
            child: Column(
              children: [
                if (!(user?.isGateVolunteer ?? false))
                  ListenableBuilder(
                    listenable: services.notifications,
                    builder: (context, _) => _Tile(
                      icon: Icons.notifications_rounded,
                      title: 'Notifications',
                      trailing: services.notifications.unread > 0
                          ? StatusPill('${services.notifications.unread} new', tone: PillTone.orange)
                          : null,
                      onTap: () => openOrganizerNotifications(context),
                    ),
                  ),
                if (!(user?.isGateVolunteer ?? false)) ...[
                  _Tile(
                    icon: Icons.add_circle_outline_rounded,
                    title: 'Create an event',
                    onTap: () => web('/organizer/create-event/basic'),
                  ),
                  _Tile(icon: Icons.account_balance_rounded, title: 'Payments & payouts', onTap: () => web('/organizer/payments')),
                  _Tile(icon: Icons.open_in_browser_rounded, title: 'Open the web portal', onTap: () => web('/organizer/dashboard')),
                ],
                _Tile(
                  icon: Icons.system_update_rounded,
                  title: 'Check for updates',
                  onTap: () async {
                    final release = await services.updates.check(force: true);
                    if (context.mounted && release != null && !release.updateAvailable) {
                      showMessage(context, "You're on the latest version");
                    }
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          InveonCard(
            padding: EdgeInsets.zero,
            radius: InveonRadius.lg,
            child: _Tile(icon: Icons.logout_rounded, title: 'Sign out', danger: true, onTap: services.signOut),
          ),
          const SizedBox(height: 16),
          FutureBuilder<PackageInfo>(
            future: PackageInfo.fromPlatform(),
            builder: (context, snap) => Center(
              child: Text('Inveon Organizer ${snap.data?.version ?? ''}', style: text.bodySmall?.copyWith(color: InveonColors.muted)),
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.title, required this.onTap, this.trailing, this.danger = false});

  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final Widget? trailing;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: danger ? InveonColors.error : InveonColors.primary),
      title: Text(
        title,
        style: TextStyle(color: danger ? InveonColors.error : InveonColors.midnight, fontWeight: FontWeight.w600),
      ),
      trailing: trailing ?? const Icon(Icons.chevron_right_rounded, color: InveonColors.muted),
      onTap: onTap,
    );
  }
}
