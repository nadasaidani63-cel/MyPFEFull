import 'package:flutter/foundation.dart';
import 'package:universal_html/html.dart' as html;

class AppConfig {
  static String get apiBaseUrl {
    if (kIsWeb) {
      final host = html.window.location.hostname;
      return 'http://$host:5000/api';
    }
    return 'https://mypfefull-production.up.railway.app/api';
  }

  static String get socketUrl {
    if (kIsWeb) {
      final host = html.window.location.hostname;
      return 'http://$host:5000';
    }
    return 'https://mypfefull-production.up.railway.app';
  }

  static bool get isWeb => kIsWeb;
}