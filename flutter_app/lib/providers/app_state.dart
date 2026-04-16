// lib/providers/app_state.dart
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:universal_html/html.dart' as html;
import '../models/models.dart';
import '../services/api.dart';
import '../services/socket_service.dart';

// ─── Auth Provider (mirrors useAuth.tsx) ──────────────────────────────────────
enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  final ApiService _api;
  final FlutterSecureStorage _store = const FlutterSecureStorage();
  AuthStatus _status = AuthStatus.unknown;
  AppUser? _user;

  AuthStatus get status => _status;
  AppUser? get user => _user;
  String? get token => _api.token;
  bool get isAdmin => _user?.isAdmin ?? false;

  AuthProvider(this._api) { _boot(); }

  Future<String?> _readToken() async {
    if (kIsWeb) return html.window.localStorage['sentinel_token'];
    return _store.read(key: 'sentinel_token');
  }

  Future<void> _writeToken(String value) async {
    if (kIsWeb) {
      html.window.localStorage['sentinel_token'] = value;
      return;
    }
    await _store.write(key: 'sentinel_token', value: value);
  }

  Future<void> _deleteToken() async {
    if (kIsWeb) {
      html.window.localStorage.remove('sentinel_token');
      return;
    }
    await _store.delete(key: 'sentinel_token');
  }

  Future<void> _boot() async {
    final tok = await _readToken();
    if (tok == null) { _status = AuthStatus.unauthenticated; notifyListeners(); return; }
    _api.setToken(tok);
    try {
      _user = await _api.getMe();
      _status = AuthStatus.authenticated;
    } catch (_) {
      await _deleteToken();
      _api.setToken(null);
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>> signIn(String email, String password) async {
    try {
      final res = await _api.login(email, password);
      final tok = res['token'] as String;
      _api.setToken(tok);
      await _writeToken(tok);
      _user = AppUser.fromJson(res['user'] ?? res['data']);
      _status = AuthStatus.authenticated;
      notifyListeners();
      return {'error': null};
    } catch (e) {
      return {'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>> signUp(Map<String, dynamic> payload) async {
    try {
      await _api.register(payload);
      return {'error': null};
    } catch (e) {
      return {'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>> requestPasswordReset(String email) async {
    try {
      final res = await _api.requestPasswordReset(email);
      return {'error': null, 'message': res['message']};
    } catch (e) {
      return {'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>> resetPassword({
    required String email,
    required String token,
    required String newPassword,
  }) async {
    try {
      final res = await _api.resetPassword(
        email: email,
        token: token,
        newPassword: newPassword,
      );
      return {'error': null, 'message': res['message']};
    } catch (e) {
      return {'error': e.toString()};
    }
  }

  Future<void> signOut() async {
    await _deleteToken();
    _api.setToken(null);
    _user = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<void> refreshMe() async {
    _user = await _api.getMe();
    notifyListeners();
  }
}

// ─── Datacenter connection state (mirrors useDatacenter.tsx) ──────────────────
class DatacenterProvider extends ChangeNotifier {
  Datacenter? _connectedDC;
  String? _pendingDCName;
  bool _connecting = false;
  int _connectStep = 0; // 0 = none, 1..3 = steps

  Datacenter? get connectedDC => _connectedDC;
  String? get pendingDCName => _pendingDCName;
  bool get connecting => _connecting;
  int get connectStep => _connectStep;
  bool get isConnected => _connectedDC != null;

  Future<void> connect(Datacenter dc, SocketService socket) async {
    if (_connectedDC?.id == dc.id && !_connecting) return;
    if (_connectedDC != null) socket.leaveDatacenter(_connectedDC!.id);
    _pendingDCName = dc.name;
    _connecting = true; _connectStep = 1; _connectedDC = null;
    notifyListeners();
    await Future.delayed(const Duration(milliseconds: 500));
    _connectStep = 2; notifyListeners();
    await Future.delayed(const Duration(milliseconds: 500));
    _connectStep = 3; notifyListeners();
    await Future.delayed(const Duration(milliseconds: 500));
    _connectedDC = dc;
    _pendingDCName = null;
    _connecting = false; _connectStep = 0;
    socket.joinDatacenter(dc.id);
    notifyListeners();
  }

  void disconnect(SocketService socket) {
    if (_connectedDC != null) socket.leaveDatacenter(_connectedDC!.id);
    _connectedDC = null;
    _pendingDCName = null;
    _connecting = false;
    _connectStep = 0;
    notifyListeners();
  }
}

// ─── App data provider (query cache, mirrors react-query data) ────────────────
class AppProvider extends ChangeNotifier {
  final ApiService _api;
  final SocketService _socket;

  List<Datacenter> _datacenters = [];
  List<Zone> _zones = [];
  List<SensorReading> _latestReadings = [];
  List<SensorHistoryRow> _history = [];
  List<AlertItem> _alerts = [];

  bool _loadingDC = false;
  bool _live = false;
  String? _error;

  List<Datacenter> get datacenters => _datacenters;
  List<Zone> get zones => _zones;
  List<SensorReading> get latestReadings => _latestReadings;
  List<SensorHistoryRow> get history => _history;
  List<AlertItem> get alerts => _alerts;
  bool get live => _live;
  bool get loading => _loadingDC;
  String? get error => _error;

  // Alert counts
  int get activeCount => _alerts.where((a) => a.isActive).length;
  int get criticalCount => _alerts.where((a) => a.isCritical && a.isActive).length;
  int get warningCount => _alerts.where((a) => a.severity == 'warning' && a.isActive).length;

  AppProvider(this._api, this._socket) {
    _socket.onReading = _onReading;
    _socket.onAlert = _onAlert;
    _socket.onStatus = _onStatus;
    _socket.onConnect = () { _live = true; notifyListeners(); };
    _socket.onDisconnect = () { _live = false; notifyListeners(); };
  }

  void _onReading(SensorReading r) {
    // upsert by nodeId (mirrors useRealtimeSensorReadings)
    _latestReadings.removeWhere((x) => x.nodeId == r.nodeId);
    _latestReadings.insert(0, r);
    _history.add(SensorHistoryRow(
      id: r.id, nodeId: r.nodeId,
      temperature: r.temperature, humidity: r.humidity,
      gasLevel: r.gasLevel, pressure: r.pressure, vibration: r.vibration,
      recordedAt: r.recordedAt,
    ));
    if (_history.length > 1500) {
      _history = _history.sublist(_history.length - 1500);
    }
    notifyListeners();
  }

  void _onAlert(AlertItem a) {
    final idx = _alerts.indexWhere((x) => x.id == a.id);
    if (idx >= 0) {
      _alerts[idx] = a;
    } else {
      _alerts.insert(0, a);
    }
    _alerts.sort((x, y) => y.createdAt.compareTo(x.createdAt));
    if (_alerts.length > 200) _alerts = _alerts.sublist(0, 200);
    notifyListeners();
  }

  void _onStatus(Map<String, dynamic> payload) {
    // Update zone/datacenter statuses
    final dcPayload = payload['datacenter'];
    final zonePayload = payload['zone'];
    if (dcPayload != null) {
      final id = dcPayload['id'] as String?;
      final status = dcPayload['status'] as String?;
      if (id != null && status != null) {
        _datacenters = _datacenters.map((d) =>
          d.id == id ? Datacenter(id: d.id, name: d.name, status: status, location: d.location, zones: d.zones) : d
        ).toList();
      }
    }
    if (zonePayload != null) {
      final id = zonePayload['id'] as String?;
      final status = zonePayload['status'] as String?;
      if (id != null && status != null) {
        _zones = _zones.map((z) =>
          z.id == id
              ? Zone(
                  id: z.id,
                  name: z.name,
                  status: status,
                  description: z.description,
                  datacenterId: z.datacenterId,
                  part: z.part,
                  room: z.room,
                  roomPart: z.roomPart,
                  nodes: z.nodes,
                )
              : z
        ).toList();
      }
    }
    notifyListeners();
  }

  void initSocket(String? token) {
    _socket.connect(token);
  }

  // ── Data loaders ─────────────────────────────────────────────────────────
  Future<void> loadDatacenters() async {
    _loadingDC = true; notifyListeners();
    try { _datacenters = await _api.getDatacenters(); }
    catch (e) { _error = e.toString(); }
    finally { _loadingDC = false; notifyListeners(); }
  }

  Future<void> loadZones(String dcId) async {
    try { _zones = await _api.getZones(dcId); notifyListeners(); }
    catch (e) { _error = e.toString(); notifyListeners(); }
  }

  Future<void> loadLatestReadings(String dcId) async {
    try { _latestReadings = await _api.getLatestReadings(dcId); notifyListeners(); }
    catch (_) {}
  }

  Future<void> loadHistory(String dcId, {String? from, String? to, int page = 1, int limit = 100}) async {
    try {
      final res = await _api.getSensorHistory(
        datacenterId: dcId, from: from, to: to, page: page, limit: limit);
      _history = (res['data'] as List<SensorHistoryRow>);
      notifyListeners();
    } catch (_) {}
  }

  Future<void> loadAlerts(String? dcId) async {
    try { _alerts = await _api.getAlerts(datacenterId: dcId); notifyListeners(); }
    catch (_) {}
  }

  Future<Map<String, dynamic>> getAiInsights(String dcId, {int hours = 6, int points = 18}) {
    return _api.getAiInsights(datacenterId: dcId, hours: hours, points: points);
  }

  Future<void> acknowledgeAlert(String id) async {
    await _api.acknowledgeAlert(id);
    final idx = _alerts.indexWhere((a) => a.id == id);
    if (idx >= 0) {
      final a = _alerts[idx];
      _alerts[idx] = AlertItem(
        id: a.id, severity: a.severity, status: 'acknowledged',
        message: a.message, metricName: a.metricName, nodeId: a.nodeId,
        zoneId: a.zoneId, datacenterId: a.datacenterId,
        metricValue: a.metricValue, thresholdExceeded: a.thresholdExceeded,
        createdAt: a.createdAt, nodeName: a.nodeName, zoneName: a.zoneName,
      );
      notifyListeners();
    }
  }

  Future<void> resolveAlert(String id) async {
    await _api.resolveAlert(id);
    final idx = _alerts.indexWhere((a) => a.id == id);
    if (idx >= 0) {
      final a = _alerts[idx];
      _alerts[idx] = AlertItem(
        id: a.id, severity: a.severity, status: 'resolved',
        message: a.message, metricName: a.metricName, nodeId: a.nodeId,
        zoneId: a.zoneId, datacenterId: a.datacenterId,
        metricValue: a.metricValue, thresholdExceeded: a.thresholdExceeded,
        createdAt: a.createdAt, nodeName: a.nodeName, zoneName: a.zoneName,
      );
      notifyListeners();
    }
  }

  SensorReading? latestForNode(String nodeId) =>
    _latestReadings.cast<SensorReading?>().firstWhere((r) => r?.nodeId == nodeId, orElse: () => null);

  // Averages across all latest readings (for sensor cards)
  Map<String, double?> get sensorAverages {
    if (_latestReadings.isEmpty) return {};
    avg(List<double?> vals) {
      final v = vals.whereType<double>().toList();
      return v.isEmpty ? null : v.reduce((a, b) => a + b) / v.length;
    }
    return {
      'temperature': avg(_latestReadings.map((r) => r.temperature).toList()),
      'humidity':    avg(_latestReadings.map((r) => r.humidity).toList()),
      'pressure':    avg(_latestReadings.map((r) => r.pressure).toList()),
      'gasLevel':    avg(_latestReadings.map((r) => r.gasLevel).toList()),
      'vibration':   avg(_latestReadings.map((r) => r.vibration).toList()),
    };
  }

  // Last 20 values of a metric from history (for sparklines)
  List<double> sparkFor(String metric) =>
    _history.map((r) => r.get(metric)).whereType<double>().toList().reversed.take(20).toList().reversed.toList();

  @override
  void dispose() { _socket.disconnect(); super.dispose(); }
}
