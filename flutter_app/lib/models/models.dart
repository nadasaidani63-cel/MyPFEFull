// lib/models/models.dart
// Field names mirror the normalized shapes from useApiData.ts

class AppUser {
  final String id, email, firstName, lastName, fullName, role;
  final String? phone, avatarUrl;
  final Map<String, dynamic> notificationPreferences;
  AppUser({required this.id, required this.email, required this.firstName,
    required this.lastName, required this.fullName, required this.role,
    this.phone, this.avatarUrl, this.notificationPreferences = const {}});
  bool get isAdmin => role == 'admin';
  String get initials {
    final p = fullName.trim().split(' ');
    if (p.length >= 2) return '${p.first[0]}${p.last[0]}'.toUpperCase();
    return fullName.isNotEmpty ? fullName[0].toUpperCase() : '?';
  }
  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
    id: j['_id'] ?? j['id'] ?? '',
    email: j['email'] ?? '',
    firstName: j['firstName'] ?? '',
    lastName: j['lastName'] ?? '',
    fullName: j['fullName'] ?? '${j['firstName'] ?? ''} ${j['lastName'] ?? ''}'.trim(),
    role: j['role'] ?? 'utilisateur',
    phone: j['phone'],
    avatarUrl: j['avatarUrl'],
    notificationPreferences: (j['notificationPreferences'] as Map?)
            ?.cast<String, dynamic>() ??
        const {},
  );
}

class Datacenter {
  final String id, name, status;
  final String? location;
  final List<Zone> zones;
  Datacenter({required this.id, required this.name, required this.status,
    this.location, this.zones = const []});
  int get totalNodes => zones.fold(0, (s, z) => s + z.nodes.length);
  int get onlineNodes => zones.fold(0, (s, z) => s + z.nodes.where((n) => n.isOnline).length);
  int get currentLoad => totalNodes == 0 ? 0 : ((onlineNodes / totalNodes) * 100).round();
  factory Datacenter.fromJson(Map<String, dynamic> j) => Datacenter(
    id: j['_id'] ?? j['id'] ?? '',
    name: j['name'] ?? '',
    status: j['status'] ?? 'normal',
    location: j['location'],
    zones: (j['zones'] as List? ?? []).map((z) => Zone.fromJson(z)).toList(),
  );
}

class Zone {
  final String id, name, status;
  final String? description, datacenterId, part, room, roomPart;
  final List<IoNode> nodes;
  Zone({required this.id, required this.name, required this.status,
    this.description, this.datacenterId, this.part, this.room, this.roomPart,
    this.nodes = const []});
  factory Zone.fromJson(Map<String, dynamic> j) => Zone(
    id: j['_id'] ?? j['id'] ?? '',
    name: j['name'] ?? '',
    status: j['status'] ?? 'normal',
    description: j['description'],
    datacenterId: j['datacenterId'] is Map ? j['datacenterId']['_id'] : j['datacenterId'],
    part: j['part'],
    room: j['room'],
    roomPart: j['roomPart'] ?? j['room_part'],
    nodes: (j['nodes'] as List? ?? []).map((n) => IoNode.fromJson(n)).toList(),
  );
}

class IoNode {
  final String id, name, status;
  final bool isOnline;
  final DateTime? lastPing;
  final String? macAddress, firmwareVersion, zoneId;
  IoNode({required this.id, required this.name, required this.status,
    required this.isOnline, this.lastPing, this.macAddress,
    this.firmwareVersion, this.zoneId});
  factory IoNode.fromJson(Map<String, dynamic> j) => IoNode(
    id: j['_id'] ?? j['id'] ?? '',
    name: j['name'] ?? '',
    status: j['status'] ?? 'normal',
    isOnline: j['isOnline'] ?? j['is_online'] ?? false,
    lastPing: j['lastPing'] != null ? DateTime.tryParse(j['lastPing']) : null,
    macAddress: j['macAddress'] ?? j['mac_address'],
    firmwareVersion: j['firmwareVersion'] ?? j['firmware_version'],
    zoneId: j['zoneId'] is Map ? j['zoneId']['_id'] : j['zoneId'],
  );
}

// Mirrors useLatestReadings normalized shape: gas_level, node_id, recorded_at
class SensorReading {
  final String id, nodeId;
  final double? temperature, humidity, gasLevel, pressure, vibration;
  final DateTime recordedAt;
  SensorReading({required this.id, required this.nodeId, this.temperature,
    this.humidity, this.gasLevel, this.pressure, this.vibration,
    required this.recordedAt});
  double? get(String k) {
    switch (k) {
      case 'temperature': return temperature;
      case 'humidity': return humidity;
      case 'gasLevel': case 'gas_level': return gasLevel;
      case 'pressure': return pressure;
      case 'vibration': return vibration;
      default: return null;
    }
  }
  factory SensorReading.fromJson(Map<String, dynamic> j) => SensorReading(
    id: j['_id'] ?? j['id'] ?? '',
    nodeId: j['nodeId'] is Map ? j['nodeId']['_id'] : (j['nodeId'] ?? j['node_id'] ?? ''),
    temperature: (j['temperature'] as num?)?.toDouble(),
    humidity: (j['humidity'] as num?)?.toDouble(),
    gasLevel: (j['gasLevel'] ?? j['gas_level'] as num?)?.toDouble(),
    pressure: (j['pressure'] as num?)?.toDouble(),
    vibration: (j['vibration'] as num?)?.toDouble(),
    recordedAt: DateTime.tryParse(j['recordedAt'] ?? j['recorded_at'] ?? '') ?? DateTime.now(),
  );
}

// Mirrors useAlerts normalized shape
class AlertItem {
  final String id, severity, status;
  final String? message, metricName, nodeId, zoneId, datacenterId;
  final double? metricValue, thresholdExceeded;
  final DateTime createdAt;
  final String? nodeName, zoneName;

  AlertItem({required this.id, required this.severity, required this.status,
    this.message, this.metricName, this.nodeId, this.zoneId, this.datacenterId,
    this.metricValue, this.thresholdExceeded, required this.createdAt,
    this.nodeName, this.zoneName});

  bool get isActive => status == 'active';
  bool get isCritical => severity == 'critical';

  String get displaySeverity {
    switch (severity) {
      case 'critical': return 'Critique';
      case 'warning': return 'Avertissement';
      default: return 'Info';
    }
  }
  String get displayStatus {
    switch (status) {
      case 'active': return 'Active';
      case 'acknowledged': return 'Acquittée';
      case 'resolved': return 'Résolue';
      default: return status;
    }
  }

  factory AlertItem.fromJson(Map<String, dynamic> j) {
    // Backend uses 'alert' as severity but frontend normalizes to 'critical'
    final sev = (j['severity'] == 'alert') ? 'critical' : (j['severity'] ?? 'info');
    final node = j['nodeId'] is Map ? j['nodeId'] : null;
    final zone = j['zoneId'] is Map ? j['zoneId'] : null;
    return AlertItem(
      id: j['_id'] ?? j['id'] ?? '',
      severity: sev,
      status: j['status'] ?? 'active',
      message: j['message'],
      metricName: j['metricName'],
      metricValue: (j['metricValue'] as num?)?.toDouble(),
      thresholdExceeded: (j['thresholdExceeded'] as num?)?.toDouble(),
      nodeId: node?['_id'] ?? (j['nodeId'] is String ? j['nodeId'] : null),
      zoneId: zone?['_id'] ?? (j['zoneId'] is String ? j['zoneId'] : null),
      datacenterId: j['datacenterId'] is Map ? j['datacenterId']['_id'] : j['datacenterId'],
      createdAt: DateTime.tryParse(j['createdAt'] ?? j['created_at'] ?? '') ?? DateTime.now(),
      nodeName: node?['name'],
      zoneName: zone?['name'],
    );
  }
}

class AlertThreshold {
  final String id, metricName;
  final double warningMin, warningMax, alertMin, alertMax;
  final bool enabled;
  final String? scopeType, scopeId;
  AlertThreshold({required this.id, required this.metricName,
    required this.warningMin, required this.warningMax,
    required this.alertMin, required this.alertMax,
    required this.enabled, this.scopeType, this.scopeId});
  factory AlertThreshold.fromJson(Map<String, dynamic> j) => AlertThreshold(
    id: j['_id'] ?? j['id'] ?? '',
    metricName: j['metricName'] ?? '',
    warningMin: (j['warningMin'] as num?)?.toDouble() ?? 0,
    warningMax: (j['warningMax'] as num?)?.toDouble() ?? 0,
    alertMin: (j['alertMin'] as num?)?.toDouble() ?? 0,
    alertMax: (j['alertMax'] as num?)?.toDouble() ?? 0,
    enabled: j['enabled'] ?? true,
    scopeType: j['scopeType'],
    scopeId: j['scopeId'],
  );
  Map<String, dynamic> toJson() => {
    'metricName': metricName, 'warningMin': warningMin, 'warningMax': warningMax,
    'alertMin': alertMin, 'alertMax': alertMax, 'enabled': enabled,
    if (scopeType != null) 'scopeType': scopeType,
    if (scopeId != null) 'scopeId': scopeId,
  };
}

class SensorHistoryRow {
  final String id, nodeId;
  final String? nodeName;
  final double? temperature, humidity, gasLevel, pressure, vibration;
  final DateTime recordedAt;
  SensorHistoryRow({required this.id, required this.nodeId, this.nodeName,
    this.temperature, this.humidity, this.gasLevel, this.pressure,
    this.vibration, required this.recordedAt});
  double? get(String k) {
    switch (k) {
      case 'temperature': return temperature;
      case 'humidity': return humidity;
      case 'gasLevel': case 'gas_level': return gasLevel;
      case 'pressure': return pressure;
      case 'vibration': return vibration;
      default: return null;
    }
  }
  factory SensorHistoryRow.fromJson(Map<String, dynamic> j) => SensorHistoryRow(
    id: j['_id'] ?? j['id'] ?? '',
    nodeId: j['nodeId'] is Map ? j['nodeId']['_id'] : (j['nodeId'] ?? j['node_id'] ?? ''),
    nodeName: j['nodeId'] is Map ? j['nodeId']['name'] : j['node_name'],
    temperature: (j['temperature'] as num?)?.toDouble(),
    humidity: (j['humidity'] as num?)?.toDouble(),
    gasLevel: ((j['gasLevel'] ?? j['gas_level']) as num?)?.toDouble(),
    pressure: (j['pressure'] as num?)?.toDouble(),
    vibration: (j['vibration'] as num?)?.toDouble(),
    recordedAt: DateTime.tryParse(j['recordedAt'] ?? j['recorded_at'] ?? '') ?? DateTime.now(),
  );
}
