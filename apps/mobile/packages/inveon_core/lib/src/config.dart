/// Which of the two apps is running. Sent to the API for push
/// registration and the version check.
enum InveonApp {
  customer('customer'),
  organizer('organizer');

  const InveonApp(this.id);
  final String id;
}

/// Build-time settings. Point a build at staging or a laptop with:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
class InveonConfig {
  static const String baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://events.inveontechnologies.in');

  /// All API routes live under /api (see apps/api/src/app.ts).
  static String api(String path) => '$baseUrl/api$path';

  /// An absolute URL for a path the API returns (e.g. /api/uploads/…).
  static String absolute(String? pathOrUrl) {
    if (pathOrUrl == null || pathOrUrl.isEmpty) return '';
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    return '$baseUrl$pathOrUrl';
  }
}
