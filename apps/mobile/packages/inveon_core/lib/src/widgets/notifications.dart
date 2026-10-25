import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../api_client.dart';
import '../format.dart';
import '../push_service.dart';
import '../theme.dart';
import 'common.dart';

class InboxItem {
  InboxItem.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      kind = j['kind'] as String,
      title = j['title'] as String,
      body = j['body'] as String,
      data = (j['data'] as Map? ?? const {}).map((k, v) => MapEntry('$k', '$v')),
      read = j['read'] == true,
      createdAt = j['createdAt'] as String;

  final String id;
  final String kind;
  final String title;
  final String body;
  final Map<String, String> data;
  bool read;
  final String createdAt;
}

/// The in-app inbox (GET /api/mobile/notifications) and its unread badge.
/// Reloads whenever a push arrives in the foreground.
class NotificationCenter extends ChangeNotifier {
  NotificationCenter({required this.api, required PushService push}) {
    _sub = push.onForeground.listen((_) => load());
  }

  final ApiClient api;
  late final StreamSubscription<InAppNotice> _sub;

  List<InboxItem> items = [];
  int unread = 0;
  bool loading = false;
  String? error;

  Future<void> load() async {
    if (api.token == null) {
      items = [];
      unread = 0;
      notifyListeners();
      return;
    }
    loading = true;
    notifyListeners();
    try {
      final json = await api.get('/mobile/notifications') as Map<String, dynamic>;
      items = (json['notifications'] as List).map((e) => InboxItem.fromJson(e as Map<String, dynamic>)).toList();
      unread = json['unread'] as int? ?? 0;
      error = null;
    } catch (e) {
      error = '$e';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> markAllRead() async {
    if (unread == 0) return;
    for (final i in items) {
      i.read = true;
    }
    unread = 0;
    notifyListeners();
    try {
      await api.post('/mobile/notifications/read', {});
    } catch (_) {}
  }

  Future<void> markRead(InboxItem item) async {
    if (item.read) return;
    item.read = true;
    unread = (unread - 1).clamp(0, 1 << 30);
    notifyListeners();
    try {
      await api.post('/mobile/notifications/read', {
        'ids': [item.id],
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

(IconData, Color) iconForKind(String kind) => switch (kind) {
  'booking_confirmed' || 'new_booking' => (Icons.confirmation_number_rounded, InveonColors.success),
  'booking_cancelled' || 'event_cancelled' => (Icons.event_busy_rounded, InveonColors.error),
  'event_reminder' => (Icons.alarm_rounded, InveonColors.secondary),
  'app_update' => (Icons.rocket_launch_rounded, InveonColors.primary),
  'payments' => (Icons.payments_rounded, InveonColors.success),
  'security' => (Icons.shield_rounded, InveonColors.slate),
  _ => (Icons.notifications_rounded, InveonColors.primary),
};

/// Bell with an animated unread badge.
class NotificationBell extends StatelessWidget {
  const NotificationBell({super.key, required this.center, required this.onPressed, this.color});

  final NotificationCenter center;
  final VoidCallback onPressed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: center,
      builder: (context, _) => IconButton(
        onPressed: onPressed,
        icon: Badge(
          isLabelVisible: center.unread > 0,
          backgroundColor: InveonColors.secondary,
          label: Text(center.unread > 9 ? '9+' : '${center.unread}'),
          child: Icon(Icons.notifications_none_rounded, color: color),
        ),
      ),
    );
  }
}

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.center, required this.onOpen, this.extra});

  final NotificationCenter center;
  final void Function(Map<String, String> data) onOpen;

  /// Optional extra feed shown under the inbox (organizer activity).
  final Widget? extra;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    widget.center.load();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [TextButton(onPressed: widget.center.markAllRead, child: const Text('Mark all read'))],
      ),
      body: ListenableBuilder(
        listenable: widget.center,
        builder: (context, _) {
          final c = widget.center;
          if (c.loading && c.items.isEmpty) return const SkeletonList(height: 76);
          return RefreshIndicator(
            onRefresh: c.load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                if (c.items.isEmpty)
                  const SizedBox(
                    height: 380,
                    child: EmptyState(
                      icon: Icons.notifications_active_outlined,
                      title: "You're all caught up",
                      message: 'Booking confirmations, reminders and updates will show up here.',
                    ),
                  ),
                for (final (i, item) in c.items.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: InveonCard(
                      padding: const EdgeInsets.all(14),
                      radius: InveonRadius.lg,
                      onTap: () {
                        c.markRead(item);
                        widget.onOpen({...item.data, 'kind': item.kind});
                      },
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Builder(
                            builder: (_) {
                              final (icon, color) = iconForKind(item.kind);
                              return Container(
                                width: 42,
                                height: 42,
                                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
                                child: Icon(icon, color: color, size: 22),
                              );
                            },
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        item.title,
                                        style: text.titleSmall?.copyWith(fontWeight: item.read ? FontWeight.w600 : FontWeight.w800),
                                      ),
                                    ),
                                    Text(timeAgo(item.createdAt), style: text.bodySmall?.copyWith(color: InveonColors.muted)),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(item.body, style: text.bodyMedium?.copyWith(color: InveonColors.slate)),
                              ],
                            ),
                          ),
                          if (!item.read)
                            Container(
                              margin: const EdgeInsets.only(left: 8, top: 4),
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(color: InveonColors.primary, shape: BoxShape.circle),
                            ),
                        ],
                      ),
                    ),
                  ).staggered(i),
                ?widget.extra,
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Wrap the app (MaterialApp.builder) to slide a banner down from the
/// top when a push arrives while the app is open. Tapping it opens the
/// same screen as tapping the system notification.
class InAppNotificationHost extends StatefulWidget {
  const InAppNotificationHost({super.key, required this.push, required this.child});

  final PushService push;
  final Widget child;

  @override
  State<InAppNotificationHost> createState() => _InAppNotificationHostState();
}

class _InAppNotificationHostState extends State<InAppNotificationHost> {
  StreamSubscription<InAppNotice>? _sub;
  InAppNotice? _current;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _sub = widget.push.onForeground.listen((n) {
      _timer?.cancel();
      setState(() => _current = n);
      _timer = Timer(const Duration(seconds: 5), () {
        if (mounted) setState(() => _current = null);
      });
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n = _current;
    final text = Theme.of(context).textTheme;
    return Stack(
      children: [
        widget.child,
        if (n != null)
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            right: 12,
            child: Material(
              color: Colors.transparent,
              child: GestureDetector(
                onTap: () {
                  setState(() => _current = null);
                  widget.push.emitTap(n.data);
                },
                onVerticalDragEnd: (_) => setState(() => _current = null),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: InveonColors.midnight,
                    borderRadius: BorderRadius.circular(InveonRadius.lg),
                    boxShadow: const [BoxShadow(color: Color(0x400B132B), blurRadius: 24, offset: Offset(0, 8))],
                  ),
                  child: Row(
                    children: [
                      Builder(
                        builder: (_) {
                          final (icon, color) = iconForKind(n.kind);
                          return Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(color: color.withValues(alpha: 0.25), shape: BoxShape.circle),
                            child: Icon(icon, color: Colors.white, size: 22),
                          );
                        },
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              n.title,
                              style: text.titleSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                            ),
                            if (n.body.isNotEmpty)
                              Text(
                                n.body,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: text.bodySmall?.copyWith(color: Colors.white70),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ).animate(key: ValueKey(n)).slideY(begin: -1.4, duration: 450.ms, curve: Curves.easeOutBack).fadeIn(),
          ),
      ],
    );
  }
}
