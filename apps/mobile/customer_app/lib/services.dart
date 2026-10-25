import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import 'api.dart';

/// Everything the screens share, created once in main().
class AppServices extends ChangeNotifier {
  AppServices() {
    client.onUnauthorized = () => signOut();
    push = PushService(app: InveonApp.customer, api: client);
    notifications = NotificationCenter(api: client, push: push);
    updates = UpdateChecker(app: InveonApp.customer, api: client, navigatorKey: navigatorKey);
  }

  final navigatorKey = GlobalKey<NavigatorState>();
  final client = ApiClient();
  late final CustomerApi api = CustomerApi(client);
  final store = SessionStore('customer');
  late final PushService push;
  late final NotificationCenter notifications;
  late final UpdateChecker updates;

  /// The verified email of the signed-in customer (null = signed out).
  String? email;
  bool get signedIn => client.token != null;

  Future<void> restore() async {
    client.token = await store.readToken();
    final saved = await store.read('email');
    email = saved == null || saved.isEmpty ? null : saved;
  }

  Future<void> signIn(String token, String verifiedEmail) async {
    client.token = token;
    email = verifiedEmail;
    await store.writeToken(token);
    await store.write('email', verifiedEmail);
    await push.register();
    notifications.load();
    notifyListeners();
  }

  Future<void> signOut() async {
    await push.unlink();
    client.token = null;
    email = null;
    await store.clear();
    await store.write('email', '');
    notifications.load();
    notifyListeners();
  }
}

class Services extends InheritedNotifier<AppServices> {
  const Services({super.key, required AppServices services, required super.child}) : super(notifier: services);

  static AppServices of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<Services>()!.notifier!;

  /// Without subscribing to changes — safe in initState and callbacks.
  static AppServices read(BuildContext context) => context.getInheritedWidgetOfExactType<Services>()!.notifier!;
}
