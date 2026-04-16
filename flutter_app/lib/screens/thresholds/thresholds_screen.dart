import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/app_state.dart';
import '../../services/api.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';

class ThresholdsScreen extends StatefulWidget {
  const ThresholdsScreen({super.key});

  @override
  State<ThresholdsScreen> createState() => _ThresholdsScreenState();
}

class _ThresholdsScreenState extends State<ThresholdsScreen> {
  String _mode = 'datacenter';
  String _datacenterId = '';
  String _roomKey = '';
  String _nodeId = '';
  bool _loading = false;
  bool _saving = false;
  bool _dirty = false;
  List<Datacenter> _datacenters = [];
  List<Zone> _zones = [];
  List<IoNode> _nodes = [];
  List<_MetricRow> _rows = _defaults();

  static List<_MetricRow> _defaults() => MetricMeta.orderedKeys
      .map((metric) => _MetricRow(metric, MetricMeta.label[metric] ?? metric, MetricMeta.unit[metric] ?? '', MetricMeta.warnMin[metric] ?? 0, MetricMeta.warnMax[metric] ?? 0, MetricMeta.alertMin[metric] ?? 0, MetricMeta.alertMax[metric] ?? 0, true))
      .toList();

  List<_RoomGroup> get _rooms {
    final grouped = <String, _RoomGroup>{};
    for (final zone in _zones) {
      final part = zone.part ?? 'Salles';
      final room = zone.room ?? zone.name;
      final key = '$part::$room';
      final current = grouped[key];
      if (current == null) {
        grouped[key] = _RoomGroup(key, part, room, zone.id, [zone.id], zone.nodes.length, 1, zone.roomPart == null ? const [] : [zone.roomPart!]);
      } else {
        grouped[key] = _RoomGroup(key, part, room, current.firstZoneId, [...current.zoneIds, zone.id], current.nodeCount + zone.nodes.length, current.zoneCount + 1, {...current.roomParts, if (zone.roomPart != null) zone.roomPart!}.toList());
      }
    }
    final list = grouped.values.toList()..sort((a, b) => a.part == b.part ? a.room.compareTo(b.room) : a.part.compareTo(b.part));
    return list;
  }

  _RoomGroup? get _selectedRoom => _rooms.where((room) => room.key == _roomKey).firstOrNull;
  String get _scopeType => _mode == 'room' ? 'zone' : _mode;
  String get _scopeId => _mode == 'room' ? (_selectedRoom?.firstZoneId ?? '') : (_mode == 'node' ? _nodeId : _datacenterId);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _boot());
  }

  Future<void> _boot() async {
    final app = context.read<AppProvider>();
    final dc = context.read<DatacenterProvider>();
    final api = context.read<ApiService>();
    if (app.datacenters.isEmpty) await app.loadDatacenters();
    _datacenters = app.datacenters;
    _datacenterId = dc.connectedDC?.id ?? _datacenters.firstOrNull?.id ?? '';
    if (_datacenterId.isNotEmpty) {
      _zones = await api.getZones(_datacenterId);
      _nodes = await api.getNodes(datacenterId: _datacenterId);
    }
    if (_rooms.isNotEmpty) _roomKey = _rooms.first.key;
    if (_nodes.isNotEmpty) _nodeId = _nodes.first.id;
    if (_scopeId.isNotEmpty) await _loadThresholds();
    if (mounted) setState(() {});
  }

  Future<void> _loadThresholds() async {
    if (_scopeId.isEmpty) return;
    setState(() => _loading = true);
    try {
      final res = await context.read<ApiService>().getThresholds(scopeType: _scopeType, scopeId: _scopeId);
      final items = (res['items'] as List<AlertThreshold>?) ?? [];
      final defaults = (res['defaults'] as Map?) ?? {};
      _rows = _defaults().map((row) {
        final existing = items.where((item) => item.metricName == row.metric).firstOrNull;
        final fallback = defaults[row.metric] as Map<String, dynamic>?;
        return row.copyWith(
          warnMin: (existing?.warningMin ?? fallback?['warningMin'] ?? row.warnMin).toDouble(),
          warnMax: (existing?.warningMax ?? fallback?['warningMax'] ?? row.warnMax).toDouble(),
          alertMin: (existing?.alertMin ?? fallback?['alertMin'] ?? row.alertMin).toDouble(),
          alertMax: (existing?.alertMax ?? fallback?['alertMax'] ?? row.alertMax).toDouble(),
          enabled: existing?.enabled ?? row.enabled,
        );
      }).toList();
      _dirty = false;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (_scopeId.isEmpty) return;
    setState(() => _saving = true);
    try {
      final roomScopes = _mode == 'room' ? (_selectedRoom?.zoneIds ?? const <String>[]) : <String>[];
      final items = (roomScopes.isEmpty ? [_scopeId] : roomScopes)
          .expand((scopeId) => _rows.map((row) => {
                'scopeType': _mode == 'room' ? 'zone' : _scopeType,
                'scopeId': scopeId,
                'metricName': row.metric,
                'warningMin': row.warnMin,
                'warningMax': row.warnMax,
                'alertMin': row.alertMin,
                'alertMax': row.alertMax,
                'enabled': row.enabled,
              }))
          .toList();
      await context.read<ApiService>().bulkUpsertThresholds(items);
      await _loadThresholds();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Seuils sauvegardes.')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _update(String metric, _MetricRow next) {
    setState(() {
      _rows = _rows.map((row) => row.metric == metric ? next : row).toList();
      _dirty = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final summary = _mode == 'room'
        ? (_selectedRoom?.room ?? 'Salle')
        : _mode == 'node'
            ? _nodes.where((node) => node.id == _nodeId).firstOrNull?.name ?? 'Noeud'
            : _datacenters.where((dc) => dc.id == _datacenterId).firstOrNull?.name ?? 'Global';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Seuils d\'alerte', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            SizedBox(height: 4),
            Text('Vue compacte Global / Salle / Noeud, alignee avec le web.', style: TextStyle(fontSize: 12, color: AppColors.mutedFg)),
          ])),
          ElevatedButton.icon(onPressed: !_dirty || _saving ? null : _save, icon: _saving ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.save_outlined, size: 16), label: const Text('Sauvegarder')),
        ]),
        const SizedBox(height: 16),
        _ModeStrip(mode: _mode, onChanged: (next) async { setState(() => _mode = next); await _loadThresholds(); }),
        const SizedBox(height: 16),
        AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(summary, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(_mode == 'room' ? 'La sauvegarde est propagee a toutes les zones de cette salle.' : _mode == 'node' ? 'Priorite maximale sur ce noeud.' : 'Par defaut pour les noeuds non personnalises.', style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
        ])),
        const SizedBox(height: 16),
        AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (_mode == 'datacenter')
            ..._datacenters.map((dc) => _ChoiceTile(title: dc.name, subtitle: '${dc.zones.length} zones actives', selected: dc.id == _datacenterId, onTap: () async { setState(() => _datacenterId = dc.id); await _loadThresholds(); })),
          if (_mode == 'room')
            ..._rooms.map((room) => _ChoiceTile(title: room.room, subtitle: '${room.nodeCount} noeuds${room.roomParts.isNotEmpty ? ' · ${room.roomParts.join(' / ')}' : ''}', selected: room.key == _roomKey, onTap: () async { setState(() => _roomKey = room.key); await _loadThresholds(); })),
          if (_mode == 'node')
            ..._nodes.map((node) => _ChoiceTile(title: node.name, subtitle: _zones.where((zone) => zone.id == node.zoneId).firstOrNull?.room ?? 'Salle', selected: node.id == _nodeId, onTap: () async { setState(() => _nodeId = node.id); await _loadThresholds(); }, compact: true)),
        ])),
        const SizedBox(height: 16),
        if (_loading)
          const SkeletonBox(height: 240)
        else
          Wrap(spacing: 12, runSpacing: 12, children: _rows.map((row) {
            final digits = MetricMeta.fractionDigits(row.metric);
            final step = row.metric == 'pressure' || row.metric == 'gasLevel' ? 10.0 : row.metric == 'vibration' ? 0.1 : 1.0;
            return SizedBox(width: 360, child: AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(MetricMeta.shortLabel[row.metric] ?? row.label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.mutedFg)),
                  const SizedBox(height: 2),
                  Text(row.label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  Text(row.unit, style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
                ])),
                Switch(value: row.enabled, activeColor: AppColors.primary, onChanged: (value) => _update(row.metric, row.copyWith(enabled: value))),
              ]),
              const SizedBox(height: 12),
              _StepRow(label: 'Warning min', value: row.warnMin, digits: digits, step: step, onChanged: (value) => _update(row.metric, row.copyWith(warnMin: value))),
              _StepRow(label: 'Warning max', value: row.warnMax, digits: digits, step: step, onChanged: (value) => _update(row.metric, row.copyWith(warnMax: value))),
              _StepRow(label: 'Alert min', value: row.alertMin, digits: digits, step: step, onChanged: (value) => _update(row.metric, row.copyWith(alertMin: value))),
              _StepRow(label: 'Alert max', value: row.alertMax, digits: digits, step: step, onChanged: (value) => _update(row.metric, row.copyWith(alertMax: value))),
              const SizedBox(height: 8),
              Text('Warning ${row.warnMin.toStringAsFixed(digits)}-${row.warnMax.toStringAsFixed(digits)} ${row.unit} · Alert ${row.alertMin.toStringAsFixed(digits)}-${row.alertMax.toStringAsFixed(digits)} ${row.unit}', style: const TextStyle(fontSize: 11, color: AppColors.mutedFg)),
            ])));
          }).toList()),
      ]),
    );
  }
}

class _ModeStrip extends StatelessWidget {
  final String mode;
  final ValueChanged<String> onChanged;
  const _ModeStrip({required this.mode, required this.onChanged});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(20)),
        child: Row(children: [for (final item in const [('datacenter', 'Global'), ('room', 'Salle'), ('node', 'Noeud')]) Expanded(child: InkWell(onTap: () => onChanged(item.$1), borderRadius: BorderRadius.circular(16), child: Container(padding: const EdgeInsets.symmetric(vertical: 13), decoration: BoxDecoration(color: mode == item.$1 ? AppColors.primary : Colors.transparent, borderRadius: BorderRadius.circular(16)), child: Text(item.$2, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: mode == item.$1 ? Colors.white : AppColors.mutedFg)))))]),
      );
}

class _ChoiceTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;
  final bool compact;
  const _ChoiceTile({required this.title, required this.subtitle, required this.selected, required this.onTap, this.compact = false});
  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(bottom: compact ? 6 : 8),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            padding: EdgeInsets.all(compact ? 12 : 14),
            decoration: BoxDecoration(color: selected ? AppColors.primary.withOpacity(0.05) : AppColors.muted.withOpacity(0.2), border: Border.all(color: selected ? AppColors.primary.withOpacity(0.25) : AppColors.border), borderRadius: BorderRadius.circular(18)),
            child: Row(children: [
              Container(width: compact ? 36 : 44, height: compact ? 36 : 44, decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.12), borderRadius: BorderRadius.circular(14)), child: Center(child: Container(width: 12, height: 12, decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.7), borderRadius: BorderRadius.circular(4))))),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: compact ? 13 : 15, fontWeight: FontWeight.w700, color: selected ? AppColors.primary : AppColors.foreground)), Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AppColors.mutedFg))])),
            ]),
          ),
        ),
      );
}

class _StepRow extends StatelessWidget {
  final String label;
  final double value;
  final int digits;
  final double step;
  final ValueChanged<double> onChanged;
  const _StepRow({required this.label, required this.value, required this.digits, required this.step, required this.onChanged});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 11, color: AppColors.mutedFg, fontWeight: FontWeight.w600))),
          IconButton(onPressed: () => onChanged(value - step), icon: const Icon(Icons.remove_circle_outline, size: 18)),
          SizedBox(width: 70, child: Text(value.toStringAsFixed(digits), textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
          IconButton(onPressed: () => onChanged(value + step), icon: const Icon(Icons.add_circle_outline, size: 18)),
        ]),
      );
}

class _RoomGroup {
  final String key;
  final String part;
  final String room;
  final String firstZoneId;
  final List<String> zoneIds;
  final int nodeCount;
  final int zoneCount;
  final List<String> roomParts;
  const _RoomGroup(this.key, this.part, this.room, this.firstZoneId, this.zoneIds, this.nodeCount, this.zoneCount, this.roomParts);
}

class _MetricRow {
  final String metric;
  final String label;
  final String unit;
  final double warnMin;
  final double warnMax;
  final double alertMin;
  final double alertMax;
  final bool enabled;
  const _MetricRow(this.metric, this.label, this.unit, this.warnMin, this.warnMax, this.alertMin, this.alertMax, this.enabled);
  _MetricRow copyWith({double? warnMin, double? warnMax, double? alertMin, double? alertMax, bool? enabled}) => _MetricRow(metric, label, unit, warnMin ?? this.warnMin, warnMax ?? this.warnMax, alertMin ?? this.alertMin, alertMax ?? this.alertMax, enabled ?? this.enabled);
}
