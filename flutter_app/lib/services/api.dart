import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../core/app_config.dart';
import '../models/models.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, {this.statusCode});
  @override
  String toString() => message;
}

class ApiService {
  static const _timeout = Duration(seconds: 20);
  String? _token;
  void setToken(String? t) => _token = t;
  String? get token => _token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null && _token!.isNotEmpty)
          'Authorization': 'Bearer $_token',
      };

  Future<dynamic> _get(String path, {Map<String, String>? q}) async {
    var uri = Uri.parse('${AppConfig.apiBaseUrl}$path');
    if (q != null && q.isNotEmpty) uri = uri.replace(queryParameters: q);
    return _handle(await _guard(() => http.get(uri, headers: _headers)));
  }

  Future<dynamic> _post(String path, Map<String, dynamic> body,
      {bool auth = true}) async {
    final h = auth ? _headers : {'Content-Type': 'application/json'};
    return _handle(await _guard(() => http.post(
        Uri.parse('${AppConfig.apiBaseUrl}$path'),
        headers: h,
        body: jsonEncode(body))));
  }

  Future<dynamic> _put(String path, Map<String, dynamic> body) async => _handle(
      await _guard(() => http.put(Uri.parse('${AppConfig.apiBaseUrl}$path'),
          headers: _headers, body: jsonEncode(body))));

  Future<dynamic> _patch(String path, [Map<String, dynamic>? body]) async =>
      _handle(await _guard(() => http.patch(
          Uri.parse('${AppConfig.apiBaseUrl}$path'),
          headers: _headers,
          body: body != null ? jsonEncode(body) : null)));

  Future<http.Response> _guard(Future<http.Response> Function() request) async {
    try {
      return await request().timeout(_timeout);
    } on TimeoutException {
      throw ApiException(
          'Connexion impossible au backend ${AppConfig.apiBaseUrl}. Vérifie que le serveur tourne bien sur le port 5000.');
    } on SocketException {
      throw ApiException(
          'Le frontend ne peut pas joindre le backend. Assure-toi que le serveur Node écoute sur ${AppConfig.apiBaseUrl}.');
    } catch (e) {
      throw ApiException(e.toString());
    }
  }

  dynamic _handle(http.Response r) {
    final text = r.body;
    dynamic data;
    if (text.isNotEmpty) {
      try {
        data = jsonDecode(text);
      } catch (_) {
        data = {'message': text};
      }
    }
    if (r.statusCode >= 200 && r.statusCode < 300) return data;
    throw ApiException(
      (data is Map ? data['message'] : null) ??
          r.reasonPhrase ??
          'Erreur serveur',
      statusCode: r.statusCode,
    );
  }

  Future<Map<String, dynamic>> login(String email, String password) async =>
      await _post('/auth/login', {'email': email, 'password': password},
          auth: false);
  Future<void> register(Map<String, dynamic> payload) async =>
      await _post('/auth/register', payload, auth: false);

  Future<Map<String, dynamic>> requestPasswordReset(String email) async =>
      await _post('/auth/forgot-password', {'email': email}, auth: false);
  Future<Map<String, dynamic>> resetPassword({
    required String email,
    required String token,
    required String newPassword,
  }) async =>
      await _post('/auth/reset-password', {
        'email': email,
        'token': token,
        'newPassword': newPassword,
      }, auth: false);

  Future<AppUser> getMe() async {
    final d = await _get('/auth/me');
    return AppUser.fromJson(d['user'] ?? d['data'] ?? d);
  }

  Future<List<Datacenter>> getDatacenters() async {
    final d = await _get('/datacenters');
    return (d['data'] as List).map((x) => Datacenter.fromJson(x)).toList();
  }

  Future<List<Zone>> getZones(String datacenterId) async {
    final d = await _get('/zones', q: {'datacenterId': datacenterId});
    return (d['data'] as List).map((x) => Zone.fromJson(x)).toList();
  }

  Future<Map<String, dynamic>> getZoneNodesLatest(String zoneId) async {
    final d = await _get('/zones/$zoneId/nodes/latest');
    return d['data'] ?? {};
  }

  Future<List<IoNode>> getNodes({String? datacenterId, String? zoneId}) async {
    final q = <String, String>{};
    if (datacenterId != null) q['datacenterId'] = datacenterId;
    if (zoneId != null) q['zoneId'] = zoneId;
    final d = await _get('/nodes', q: q.isNotEmpty ? q : null);
    return (d['data'] as List).map((x) => IoNode.fromJson(x)).toList();
  }

  Future<List<SensorReading>> getLatestReadings(String datacenterId) async {
    final d = await _get('/sensors/latest', q: {'datacenterId': datacenterId});
    return (d['data'] as List).map((x) => SensorReading.fromJson(x)).toList();
  }

  Future<Map<String, dynamic>> getSensorHistory(
      {String? datacenterId,
      String? zoneId,
      String? nodeId,
      String? from,
      String? to,
      int? hours,
      int page = 1,
      int limit = 100}) async {
    final q = <String, String>{'page': '$page', 'limit': '$limit'};
    if (datacenterId != null) q['datacenterId'] = datacenterId;
    if (zoneId != null) q['zoneId'] = zoneId;
    if (nodeId != null) q['nodeId'] = nodeId;
    if (from != null) q['from'] = from;
    if (to != null) q['to'] = to;
    if (hours != null) q['hours'] = '$hours';
    if (from == null && to == null && hours == null) {
      q['hours'] = '6';
      q['limit'] = '2000';
    }
    final d = await _get('/sensors/history', q: q);
    return {
      'data':
          (d['data'] as List).map((r) => SensorHistoryRow.fromJson(r)).toList(),
      'pagination': d['pagination'] ?? {'page': 1, 'pages': 1, 'total': 0},
    };
  }


  Future<Map<String, dynamic>> getAiInsights({
    required String datacenterId,
    int hours = 6,
    int points = 18,
  }) async {
    final d = await _get('/sensors/ai-insights', q: {
      'datacenterId': datacenterId,
      'hours': '$hours',
      'points': '$points',
    });
    return (d['data'] ?? {}) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> aiChat({
    required String datacenterId,
    required String message,
    String? zoneId,
    String? nodeId,
    int hours = 6,
    int points = 18,
  }) async {
    final d = await _post('/sensors/ai-chat', {
      'datacenterId': datacenterId,
      if (zoneId != null) 'zoneId': zoneId,
      if (nodeId != null) 'nodeId': nodeId,
      'message': message,
      'hours': hours,
      'points': points,
    });
    return (d['data'] ?? {}) as Map<String, dynamic>;
  }

  Future<List<AlertItem>> getAlerts(
      {String? datacenterId, int limit = 200}) async {
    final q = {'limit': '$limit'};
    if (datacenterId != null) q['datacenterId'] = datacenterId;
    final d = await _get('/alerts', q: q);
    return (d['data'] as List).map((x) => AlertItem.fromJson(x)).toList();
  }

  Future<void> acknowledgeAlert(String id) => _patch('/alerts/$id/acknowledge');
  Future<void> resolveAlert(String id) => _patch('/alerts/$id/resolve');
  Future<Map<String, dynamic>> getThresholds(
      {String? scopeType, String? scopeId}) async {
    final q = <String, String>{};
    if (scopeType != null) q['scopeType'] = scopeType;
    if (scopeId != null) q['scopeId'] = scopeId;
    final d = await _get('/thresholds', q: q.isNotEmpty ? q : null);
    return {
      'items':
          (d['data'] as List).map((t) => AlertThreshold.fromJson(t)).toList(),
      'defaults': d['defaults'] ?? {},
    };
  }

  Future<void> bulkUpsertThresholds(List<Map<String, dynamic>> items) async =>
      await _put('/thresholds/bulk', {'items': items});
  Future<AppUser> getProfile() async {
    final d = await _get('/profile/me');
    return AppUser.fromJson(d['data'] ?? d);
  }

  Future<void> updateProfile(Map<String, dynamic> payload) async =>
      await _put('/profile/me', payload);
  Future<void> changePassword(String current, String newPass) async =>
      await _patch('/profile/password',
          {'currentPassword': current, 'newPassword': newPass});
  Future<List<AppUser>> getUsers() async {
    final d = await _get('/users');
    return (d['data'] as List).map((x) => AppUser.fromJson(x)).toList();
  }

  Future<void> updateUserRole(String userId, String role) async =>
      await _put('/users/$userId/role', {'role': role});

  Future<List<dynamic>> getRoleRequests() async {
    final d = await _get('/role-requests');
    return d['data'] ?? d as List? ?? [];
  }

  Future<void> createRoleRequest(String reason) async =>
      await _post('/role-requests', {'reason': reason});
  Future<Map<String, dynamic>> getAuditLogs(
      {String? action,
      String? targetType,
      String? from,
      String? to,
      int page = 1,
      int limit = 50}) async {
    final q = <String, String>{'page': '$page', 'limit': '$limit'};
    if (action != null) q['action'] = action;
    if (targetType != null) q['targetType'] = targetType;
    if (from != null) q['from'] = from;
    if (to != null) q['to'] = to;
    final d = await _get('/audit-logs', q: q);
    return {'data': d['data'] ?? [], 'pagination': d['pagination'] ?? {}};
  }
}
