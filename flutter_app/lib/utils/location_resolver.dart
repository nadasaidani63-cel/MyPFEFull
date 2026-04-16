import 'package:latlong2/latlong.dart';

/// Resolve a human-friendly location string to a LatLng.
/// Falls back to a central Tunisia coordinate when nothing matches.
LatLng resolveLocation(String? raw) {
  if (raw == null || raw.isEmpty) return const LatLng(35.5, 9.8);
  final lower = raw.toLowerCase();
  for (final entry in _coords.entries) {
    if (lower.contains(entry.key)) return entry.value;
  }
  return const LatLng(35.5, 9.8);
}

const Map<String, LatLng> _coords = {
  'beja': LatLng(36.7256, 9.1817),
  'béja': LatLng(36.7256, 9.1817),
  'sfax': LatLng(34.7406, 10.7603),
  'tunis': LatLng(36.8065, 10.1815),
  'charguia': LatLng(36.8365, 10.1640),
  'sousse': LatLng(35.8256, 10.6369),
  'monastir': LatLng(35.7643, 10.8113),
  'gabes': LatLng(33.8815, 10.0982),
  'gabès': LatLng(33.8815, 10.0982),
  'bizerte': LatLng(37.2744, 9.8739),
  'kairouan': LatLng(35.6781, 10.0963),
};
