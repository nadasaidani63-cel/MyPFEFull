import 'package:flutter/foundation.dart';
import 'package:universal_html/html.dart' as html;

class AppConfig {
  static String get apiBaseUrl {
    if (kIsWeb) {
      final host = html.window.location.hostname;
      return 'http://$host:5000/api';
    }
    return const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://localhost:5000/api',
    );
  }

  static String get socketUrl {
    if (kIsWeb) {
      final host = html.window.location.hostname;
      return 'http://$host:5000';
    }
    return const String.fromEnvironment(
      'SOCKET_URL',
      defaultValue: 'http://localhost:5000',
    );
  }

  static bool get isWeb => kIsWeb;
}
