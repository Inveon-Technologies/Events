import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show Color;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'api_client.dart';
import 'config.dart';

/// A push that arrived while the app was open, shown as an in-app banner.
class InAppNotice {
  InAppNotice({required this.title, required this.body, required this.data});

  final String title;
  final String body;
  final Map<String, String> data;

  String get kind => data['kind'] ?? '';
}

// Runs in its own isolate when a push arrives with the app in the
// background. "notification" pushes are drawn by the OS itself, so
// there is nothing to do beyond starting Firebase.
@pragma('vm:entry-point')
Future<void> _onBackgroundMessage(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
}

/// Firebase Cloud Messaging + local notifications for both apps.
///
/// Firebase needs each app's google-services.json / GoogleService-Info.plist
/// (see apps/mobile/README.md). Without them the app still runs: push is
/// simply off, and the in-app inbox still works.
class PushService {
  PushService({required this.app, required this.api});

  final InveonApp app;
  final ApiClient api;

  static const _channel = AndroidNotificationChannel(
    'inveon_default',
    'Bookings and updates',
    description: 'Booking confirmations, reminders and app updates',
    importance: Importance.high,
  );

  final _local = FlutterLocalNotificationsPlugin();
  final _taps = StreamController<Map<String, String>>.broadcast();
  final _foreground = StreamController<InAppNotice>.broadcast();
  Map<String, String>? _launchTap;

  bool ready = false;
  String? fcmToken;

  /// The user tapped a notification (system tray or in-app banner).
  Stream<Map<String, String>> get onTap => _taps.stream;

  /// A push arrived while the app was in the foreground.
  Stream<InAppNotice> get onForeground => _foreground.stream;

  /// The notification that launched the app from closed, once.
  Map<String, String>? takeLaunchTap() {
    final tap = _launchTap;
    _launchTap = null;
    return tap;
  }

  void emitTap(Map<String, String> data) => _taps.add(data);

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Push disabled: Firebase is not configured for this build ($e)');
      return;
    }
    FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);
    final messaging = FirebaseMessaging.instance;

    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
      ),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload == null || payload.isEmpty) return;
        try {
          _taps.add(Map<String, String>.from(jsonDecode(payload) as Map));
        } catch (_) {}
      },
    );
    await _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.createNotificationChannel(_channel);

    await messaging.requestPermission();
    await messaging.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

    FirebaseMessaging.onMessage.listen(_showForeground);
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _taps.add(_data(m)));
    final initial = await messaging.getInitialMessage();
    if (initial != null) _launchTap = _data(initial);

    // The FCM registration token, which the API sends to with FCM HTTP v1
    // (`message.token`). firebase_messaging 17 also offers FID
    // registration (register()/onRegistered); the token API still works
    // and matches what the server sends to, so it's used here.
    try {
      // ignore: deprecated_member_use
      fcmToken = await messaging.getToken();
    } catch (e) {
      debugPrint('Could not get a push token: $e');
    }
    // ignore: deprecated_member_use
    messaging.onTokenRefresh.listen((t) {
      fcmToken = t;
      register();
    });
    ready = true;
    await register();
  }

  Map<String, String> _data(RemoteMessage m) => {
    for (final e in m.data.entries) e.key: '${e.value}',
    if (m.notification?.title != null) 'title': m.notification!.title!,
  };

  void _showForeground(RemoteMessage m) {
    final title = m.notification?.title ?? m.data['title']?.toString() ?? 'Inveon Events';
    final body = m.notification?.body ?? m.data['body']?.toString() ?? '';
    final data = _data(m);
    _foreground.add(InAppNotice(title: title, body: body, data: data));
    // Android doesn't draw a heads-up for pushes while the app is open; iOS
    // does (presentation options above), so only Android needs this.
    if (!kIsWeb && Platform.isAndroid) {
      _local.show(
        id: m.hashCode & 0x7fffffff,
        title: title,
        body: body,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            _channel.id,
            _channel.name,
            channelDescription: _channel.description,
            importance: Importance.high,
            priority: Priority.high,
            color: const Color(0xFF0066FF),
          ),
        ),
        payload: jsonEncode(data),
      );
    }
  }

  /// Tells the API about this device. Called on launch, on token refresh
  /// and after sign-in (the API links the device to whoever [api.token]
  /// belongs to).
  Future<void> register() async {
    if (!ready || fcmToken == null) return;
    try {
      final info = await PackageInfo.fromPlatform();
      await api.post('/mobile/devices', {
        'app': app.id,
        'platform': Platform.isIOS ? 'ios' : 'android',
        'fcmToken': fcmToken,
        'appVersion': info.version,
      });
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }

  /// Before signing out: stop this phone getting the person's notifications.
  Future<void> unlink() async {
    if (fcmToken == null) return;
    try {
      await api.post('/mobile/devices/unregister', {'fcmToken': fcmToken});
    } catch (_) {}
  }
}
