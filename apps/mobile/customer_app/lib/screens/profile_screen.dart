import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services.dart';
import 'login_screen.dart';
import 'notifications_page.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    final text = Theme.of(context).textTheme;
    void web(String path) => launchUrl(Uri.parse('${InveonConfig.baseUrl}$path'), mode: LaunchMode.externalApplication);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(gradient: InveonColors.midnightGradient, borderRadius: BorderRadius.circular(InveonRadius.xl)),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Colors.white24,
                  child: Text(
                    services.email == null ? '?' : services.email![0].toUpperCase(),
                    style: text.headlineSmall?.copyWith(color: Colors.white),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(services.signedIn ? 'Signed in' : 'Guest', style: text.labelSmall?.copyWith(color: Colors.white60)),
                      Text(
                        services.email ?? 'Sign in to see your tickets',
                        style: text.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ).animate().fadeIn().slideY(begin: 0.1),
          const SizedBox(height: 16),
          if (!services.signedIn)
            FilledButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const LoginScreen())),
              child: const Text('Sign in'),
            ),
          const SizedBox(height: 8),
          _Group(
            children: [
              ListenableBuilder(
                listenable: services.notifications,
                builder: (context, _) => _Tile(
                  icon: Icons.notifications_rounded,
                  title: 'Notifications',
                  trailing: services.notifications.unread > 0
                      ? StatusPill('${services.notifications.unread} new', tone: PillTone.orange)
                      : null,
                  onTap: () => openNotificationsPage(context),
                ),
              ),
              _Tile(
                icon: Icons.system_update_rounded,
                title: 'Check for updates',
                onTap: () async {
                  final release = await services.updates.check(force: true);
                  if (context.mounted && release != null && !release.updateAvailable) showMessage(context, "You're on the latest version");
                },
              ),
            ],
          ),
          _Group(
            children: [
              _Tile(icon: Icons.support_agent_rounded, title: 'Contact support', onTap: () => web('/contact')),
              _Tile(icon: Icons.receipt_long_rounded, title: 'Refund policy', onTap: () => web('/refund-policy')),
              _Tile(icon: Icons.privacy_tip_outlined, title: 'Privacy', onTap: () => web('/privacy')),
              _Tile(icon: Icons.description_outlined, title: 'Terms', onTap: () => web('/terms')),
            ],
          ),
          if (services.signedIn)
            _Group(
              children: [_Tile(icon: Icons.logout_rounded, title: 'Sign out', danger: true, onTap: services.signOut)],
            ),
          const SizedBox(height: 16),
          FutureBuilder<PackageInfo>(
            future: PackageInfo.fromPlatform(),
            builder: (context, snap) => Center(
              child: Text('Inveon Events ${snap.data?.version ?? ''}', style: text.bodySmall?.copyWith(color: InveonColors.muted)),
            ),
          ),
        ],
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: InveonCard(
        padding: EdgeInsets.zero,
        radius: InveonRadius.lg,
        child: Column(children: children),
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
    final color = danger ? InveonColors.error : InveonColors.midnight;
    return ListTile(
      leading: Icon(icon, color: danger ? InveonColors.error : InveonColors.primary),
      title: Text(
        title,
        style: TextStyle(color: color, fontWeight: FontWeight.w600),
      ),
      trailing: trailing ?? const Icon(Icons.chevron_right_rounded, color: InveonColors.muted),
      onTap: onTap,
    );
  }
}
