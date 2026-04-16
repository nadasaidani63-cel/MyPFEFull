import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../core/app_config.dart';
import '../models/models.dart';

class SocketService {
  io.Socket? _socket;
  bool _connected = false;
  bool get isConnected => _connected;

  void Function(SensorReading)? onReading;
  void Function(AlertItem)? onAlert;
  void Function(Map<String, dynamic>)? onStatus;
  void Function()? onConnect;
  void Function()? onDisconnect;

  void connect(String? token) {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = io.io(
      AppConfig.socketUrl,
      <String, dynamic>{
        'transports': ['websocket', 'polling'],
        'autoConnect': false,
        'forceNew': true,
        if (token != null && token.isNotEmpty) 'auth': {'token': token},
      },
    );

    _socket!.onConnect((_) { _connected = true; onConnect?.call(); });
    _socket!.onDisconnect((_) { _connected = false; onDisconnect?.call(); });
    _socket!.onConnectError((e) { if (kDebugMode) debugPrint('Socket connect error: $e'); });

    _socket!.on('reading:new', (data) {
      try {
        final m = Map<String, dynamic>.from(data as Map);
        final values = Map<String, dynamic>.from(m['values'] ?? {});
        final r = SensorReading(
          id: '${m['nodeId']}:${m['recordedAt']}',
          nodeId: m['nodeId'] ?? '',
          temperature: (values['temperature'] as num?)?.toDouble(),
          humidity: (values['humidity'] as num?)?.toDouble(),
          gasLevel: (values['gasLevel'] as num?)?.toDouble(),
          pressure: (values['pressure'] as num?)?.toDouble(),
          vibration: (values['vibration'] as num?)?.toDouble(),
          recordedAt: DateTime.tryParse(m['recordedAt'] ?? '') ?? DateTime.now(),
        );
        onReading?.call(r);
      } catch (_) {}
    });

    _socket!.on('alert:event', (data) {
      try {
        final m = Map<String, dynamic>.from(data as Map);
        final a = m['alert'] ?? m;
        onAlert?.call(AlertItem.fromJson(Map<String, dynamic>.from(a)));
      } catch (_) {}
    });

    _socket!.on('status:update', (data) {
      try {
        onStatus?.call(Map<String, dynamic>.from(data as Map));
      } catch (_) {}
    });

    _socket!.connect();
  }

  void joinDatacenter(String dcId) => _socket?.emit('join-datacenter', dcId);
  void leaveDatacenter(String dcId) => _socket?.emit('leave-datacenter', dcId);

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _connected = false;
  }
}
