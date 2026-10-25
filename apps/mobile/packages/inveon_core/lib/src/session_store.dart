import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Session token in the platform keychain / keystore; plain flags (seen
/// onboarding) in shared preferences.
class SessionStore {
  SessionStore(this.namespace);

  final String namespace;
  static const _secure = FlutterSecureStorage();

  Future<String?> readToken() => _secure.read(key: '$namespace.token');
  Future<void> writeToken(String token) => _secure.write(key: '$namespace.token', value: token);
  Future<String?> read(String key) => _secure.read(key: '$namespace.$key');
  Future<void> write(String key, String value) => _secure.write(key: '$namespace.$key', value: value);

  Future<void> clear() async {
    await _secure.delete(key: '$namespace.token');
    await _secure.delete(key: '$namespace.profile');
  }

  Future<bool> seenOnboarding() async => (await SharedPreferences.getInstance()).getBool('$namespace.onboarded') ?? false;
  Future<void> markOnboarded() async => (await SharedPreferences.getInstance()).setBool('$namespace.onboarded', true);
}
