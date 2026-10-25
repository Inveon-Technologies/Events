import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api_client.dart';
import 'config.dart';
import 'theme.dart';

class AppRelease {
  AppRelease.fromJson(Map<String, dynamic> j)
    : latestVersion = j['latestVersion'] as String,
      updateAvailable = j['updateAvailable'] == true,
      updateRequired = j['updateRequired'] == true,
      storeUrl = j['storeUrl'] as String?,
      releaseNotes = (j['releaseNotes'] as List? ?? const []).map((e) => '$e').toList();

  final String latestVersion;
  final bool updateAvailable;
  final bool updateRequired;
  final String? storeUrl;
  final List<String> releaseNotes;
}

/// "A new version is available" prompt.
///
/// Asks GET /api/mobile/app-config on launch and whenever the app comes
/// back to the foreground (at most every 30 minutes). The versions are set
/// in the super admin portal → Mobile apps when a release ships:
/// - older than the latest version → a "What's new" sheet the user can
///   postpone (asked again for the next release, or after 3 days);
/// - older than the minimum version → a blocking screen until updated.
class UpdateChecker with WidgetsBindingObserver {
  UpdateChecker({required this.app, required this.api, required this.navigatorKey});

  final InveonApp app;
  final ApiClient api;
  final GlobalKey<NavigatorState> navigatorKey;

  DateTime? _lastCheck;
  bool _showing = false;
  String currentVersion = '';

  void start() {
    WidgetsBinding.instance.addObserver(this);
    check();
  }

  void dispose() => WidgetsBinding.instance.removeObserver(this);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) check();
  }

  /// [force]: ignore the throttle and the "later" choice (an update push
  /// was tapped, or the user asked from the profile screen).
  Future<AppRelease?> check({bool force = false}) async {
    if (!force && _lastCheck != null && DateTime.now().difference(_lastCheck!) < const Duration(minutes: 30)) return null;
    _lastCheck = DateTime.now();
    try {
      final info = await PackageInfo.fromPlatform();
      currentVersion = info.version;
      final json = await api.get(
        '/mobile/app-config',
        query: {'app': app.id, 'platform': Platform.isIOS ? 'ios' : 'android', 'version': info.version},
      );
      final release = AppRelease.fromJson(json as Map<String, dynamic>);
      if (!release.updateAvailable) return release;
      if (!release.updateRequired && !force && !await _shouldAsk(release.latestVersion)) return release;
      await _present(release);
      return release;
    } catch (e) {
      debugPrint('Update check failed: $e');
      return null;
    }
  }

  Future<bool> _shouldAsk(String version) async {
    final prefs = await SharedPreferences.getInstance();
    final dismissed = prefs.getString('update.dismissedVersion');
    final at = prefs.getInt('update.dismissedAt') ?? 0;
    if (dismissed != version) return true;
    return DateTime.now().millisecondsSinceEpoch - at > const Duration(days: 3).inMilliseconds;
  }

  Future<void> _remember(String version) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('update.dismissedVersion', version);
    await prefs.setInt('update.dismissedAt', DateTime.now().millisecondsSinceEpoch);
  }

  Future<void> _present(AppRelease release) async {
    final context = navigatorKey.currentContext;
    if (context == null || _showing) return;
    _showing = true;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      isDismissible: !release.updateRequired,
      enableDrag: !release.updateRequired,
      backgroundColor: Colors.transparent,
      builder: (_) => PopScope(
        canPop: !release.updateRequired,
        child: UpdateSheet(
          release: release,
          currentVersion: currentVersion,
          onUpdate: () => _openStore(release),
          onLater: release.updateRequired
              ? null
              : () {
                  _remember(release.latestVersion);
                  Navigator.of(context).pop();
                },
        ),
      ),
    );
    _showing = false;
  }

  Future<void> _openStore(AppRelease release) async {
    final url = release.storeUrl;
    if (url == null || url.isEmpty) return;
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }
}

/// The animated "What's new" sheet.
class UpdateSheet extends StatelessWidget {
  const UpdateSheet({super.key, required this.release, required this.currentVersion, required this.onUpdate, this.onLater});

  final AppRelease release;
  final String currentVersion;
  final VoidCallback onUpdate;
  final VoidCallback? onLater;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final notes = release.releaseNotes.isEmpty ? ['Performance improvements and bug fixes'] : release.releaseNotes;
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(InveonRadius.xl + 4)),
      ),
      padding: EdgeInsets.fromLTRB(24, 12, 24, 24 + MediaQuery.of(context).padding.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: const Color(0x1F0B132B), borderRadius: BorderRadius.circular(4)),
            ),
          ),
          const SizedBox(height: 20),
          Center(
            child: Container(
              width: 84,
              height: 84,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: InveonColors.electricGradient,
                boxShadow: InveonShadows.blueGlow,
              ),
              child: const Icon(
                Icons.rocket_launch_rounded,
                color: Colors.white,
                size: 40,
              ).animate(onPlay: (c) => c.repeat(reverse: true)).moveY(begin: 3, end: -4, duration: 900.ms, curve: Curves.easeInOut),
            ).animate().scale(begin: const Offset(0.4, 0.4), duration: 600.ms, curve: Curves.elasticOut),
          ),
          const SizedBox(height: 20),
          Text(
            release.updateRequired ? 'Update required' : 'New version available',
            textAlign: TextAlign.center,
            style: text.headlineSmall,
          ).animate().fadeIn(delay: 150.ms).slideY(begin: 0.3),
          const SizedBox(height: 6),
          Text(
            release.updateRequired
                ? 'This version is no longer supported. Update to keep using the app.'
                : 'Version ${release.latestVersion} is here${currentVersion.isEmpty ? '' : ' (you have $currentVersion)'}.',
            textAlign: TextAlign.center,
            style: text.bodyMedium?.copyWith(color: InveonColors.slate),
          ).animate().fadeIn(delay: 250.ms),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: InveonColors.surfaceTint, borderRadius: BorderRadius.circular(InveonRadius.lg)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("WHAT'S NEW", style: text.labelSmall?.copyWith(color: InveonColors.primary)),
                const SizedBox(height: 10),
                for (final (i, note) in notes.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.auto_awesome_rounded, size: 18, color: InveonColors.secondary),
                        const SizedBox(width: 10),
                        Expanded(child: Text(note, style: text.bodyMedium)),
                      ],
                    ),
                  ).animate().fadeIn(delay: (350 + i * 90).ms).slideX(begin: 0.15),
              ],
            ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: release.storeUrl == null ? null : onUpdate,
            icon: const Icon(Icons.system_update_rounded),
            label: const Text('Update now'),
          ).animate().fadeIn(delay: 500.ms).slideY(begin: 0.4),
          if (onLater != null) ...[const SizedBox(height: 8), TextButton(onPressed: onLater, child: const Text('Later'))],
        ],
      ),
    );
  }
}
