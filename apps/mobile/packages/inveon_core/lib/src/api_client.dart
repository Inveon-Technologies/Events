import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.status, this.body});

  final String message;
  final int? status;
  final Map<String, dynamic>? body;

  bool get isUnauthorized => status == 401;

  @override
  String toString() => message;
}

/// Thin JSON client for the Inveon Events API. Every app screen goes
/// through here, so errors always surface as the API's own message.
class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? token;

  /// Called on any 401 from an authenticated request (session expired).
  void Function()? onUnauthorized;

  Map<String, String> _headers() => {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    if (token != null) 'Authorization': 'Bearer $token',
  };

  Future<dynamic> get(String path, {Map<String, String?>? query}) => _send('GET', path, query: query);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body: body);

  Future<dynamic> _send(String method, String path, {Map<String, String?>? query, Object? body}) async {
    final params = <String, String>{
      for (final e in (query ?? const <String, String?>{}).entries)
        if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
    };
    final uri = Uri.parse(InveonConfig.api(path)).replace(queryParameters: params.isEmpty ? null : params);
    http.Response res;
    try {
      final request = http.Request(method, uri)..headers.addAll(_headers());
      if (body != null) request.body = jsonEncode(body);
      res = await http.Response.fromStream(await _client.send(request).timeout(const Duration(seconds: 25)));
    } on TimeoutException {
      throw ApiException('The server is taking too long. Check your connection and try again.');
    } catch (_) {
      throw ApiException('No internet connection. Please try again.');
    }

    dynamic decoded;
    if (res.body.isNotEmpty) {
      try {
        decoded = jsonDecode(res.body);
      } catch (_) {
        decoded = null;
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return decoded;

    final map = decoded is Map<String, dynamic> ? decoded : null;
    final message = map?['error']?.toString() ?? 'Something went wrong (${res.statusCode}). Please try again.';
    if (res.statusCode == 401 && token != null) onUnauthorized?.call();
    throw ApiException(message, status: res.statusCode, body: map);
  }
}
