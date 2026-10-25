import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import 'api.dart';

/// Everything the screens share, created once in main().
class AppServices extends ChangeNotifier {
  AppServices() {
    client.onUnauthorized = () => signOut(expired: true);
    push = PushService(app: InveonApp.organizer, api: client);
    notifications = NotificationCenter(api: client, push: push);
    updates = UpdateChecker(app: InveonApp.organizer, api: client, navigatorKey: navigatorKey);
  }

  final navigatorKey = GlobalKey<NavigatorState>();
  final client = ApiClient();
  late final OrganizerApi api = OrganizerApi(client);
  final store = SessionStore('organizer');
  late final PushService push;
  late final NotificationCenter notifications;
  late final UpdateChecker updates;

  OrganizerUser? user;
  bool get signedIn => client.token != null && user != null;

  /// Set when the session ran out, so the login screen can say why.
  bool sessionExpired = false;

  Future<void> restore() async {
    client.token = await store.readToken();
    final raw = await store.read('profile');
    user = raw == null || raw.isEmpty ? null : OrganizerUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> signIn(String email, String password) async {
    final (token, signedInUser) = await api.login(email, password);
    client.token = token;
    user = signedInUser;
    sessionExpired = false;
    await store.writeToken(token);
    await store.write('profile', jsonEncode(signedInUser.toJson()));
    await push.register();
    notifications.load();
    notifyListeners();
  }

  Future<void> signOut({bool expired = false}) async {
    if (client.token == null) return;
    await push.unlink();
    client.token = null;
    user = null;
    sessionExpired = expired;
    await store.clear();
    notifyListeners();
  }
}

class Services extends InheritedNotifier<AppServices> {
  const Services({super.key, required AppServices services, required super.child}) : super(notifier: services);

  static AppServices of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<Services>()!.notifier!;

  /// Without subscribing to changes — safe in initState and callbacks.
  static AppServices read(BuildContext context) => context.getInheritedWidgetOfExactType<Services>()!.notifier!;
}
