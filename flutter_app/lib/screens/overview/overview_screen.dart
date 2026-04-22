import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';

import '../../providers/app_state.dart';
import '../../models/models.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';
import '../../utils/export_file.dart';

class OverviewScreen extends StatefulWidget {
  const OverviewScreen({super.key});

  @override
  State<OverviewScreen> createState() => _OverviewScreenState();
}

class _OverviewScreenState extends State<OverviewScreen> {
  String _tab = 'CARTE ZONES';
  String _analyticsMetric = 'temperature';
  String? _selectedNodeId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  void _load() {
    final app = context.read<AppProvider>();
    final dcP = context.read<DatacenterProvider>();
    if (dcP.connectedDC == null) return;
    app.loadZones(dcP.connectedDC!.id);
    app.loadLatestReadings(dcP.connectedDC!.id);
    app.loadAlerts(dcP.connectedDC!.id);
    if (app.history.isEmpty) app.loadHistory(dcP.connectedDC!.id, limit: 2000);
  }

  Future<void> _exportReport(AppProvider app, DatacenterProvider dcP, Map<String, double?> avg) async {
    final zoneMap = app.zones
        .expand((z) => z.nodes.map((n) => {
              'id': n.name,
              'zone': z.name,
              'status': n.status,
            }))
        .toList();
    final systemLogs = app.alerts.take(8).map((a) => {
          'time': '${a.createdAt.hour.toString().padLeft(2, '0')}:${a.createdAt.minute.toString().padLeft(2, '0')}',
          'severity': a.severity == 'critical' ? 'CRITICAL' : a.severity.toUpperCase(),
          'message': a.message ?? a.metricName ?? 'Alerte',
          'source': a.nodeName ?? a.zoneName ?? 'Système',
        }).toList();

    final csvRows = <List<String>>[
      ['Datacenter', dcP.connectedDC?.name ?? ''],
      ['Date export', DateFormat('dd/MM/yyyy HH:mm:ss').format(DateTime.now())],
      [],
      ['Métrique', 'Valeur Moyenne', 'Unité'],
      ['TEMPÉRATURE MOY.', avg['temperature']?.toStringAsFixed(1) ?? '—', '°C'],
      ['HUMIDITÉ MOY.', avg['humidity']?.toStringAsFixed(1) ?? '—', '%'],
      ['GAZ CO2', avg['pressure']?.toStringAsFixed(0) ?? '—', 'PPM'],
      ['FUMEE', avg['gasLevel']?.toStringAsFixed(0) ?? '—', 'PPM'],
      ['VIBRATION', avg['vibration']?.toStringAsFixed(2) ?? '—', 'mm/s'],
      [],
      ['Nœud', 'Zone', 'Statut'],
      ...zoneMap.map((z) => ['${z['id']}', '${z['zone']}', '${z['status']}']),
      [],
      ['Heure', 'Sévérité', 'Message', 'Source'],
      ...systemLogs.map((l) => ['${l['time']}', '${l['severity']}', '${l['message']}', '${l['source']}']),
    ];

    final csv = csvRows.map((row) => row.map((cell) => '"${cell.replaceAll('"', '""')}"').join(',')).join('\n');
    final safeName = (dcP.connectedDC?.name ?? 'datacenter').replaceAll(RegExp(r'\s+'), '_');
    final filename = 'rapport_${safeName}_${DateTime.now().toIso8601String().substring(0, 10)}.csv';
    await saveCsvFile(filename: filename, csv: csv);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Rapport exporté: $filename')));
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppProvider>();
    final dcP = context.watch<DatacenterProvider>();
    if (dcP.connectedDC == null) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off, size: 48, color: AppColors.mutedFg),
            SizedBox(height: 16),
            Text('Connectez-vous à un datacenter', style: TextStyle(fontSize: 14, color: AppColors.mutedFg)),
          ],
        ),
      );
    }

    final avg = app.sensorAverages;
    final zones = app.zones;
    final sensorCards = [
      {'title': 'TEMPÉRATURE MOY.', 'key': 'temperature', 'unit': '°C', 'color': AppColors.chartRed},
      {'title': 'HUMIDITÉ MOY.', 'key': 'humidity', 'unit': '%', 'color': AppColors.chartAmber},
      {'title': 'GAZ CO2', 'key': 'pressure', 'unit': 'PPM', 'color': AppColors.chartBlue},
      {'title': 'FUMEE', 'key': 'gasLevel', 'unit': 'PPM', 'color': AppColors.chartGreen},
      {'title': 'VIBRATION', 'key': 'vibration', 'unit': 'mm/s', 'color': AppColors.chartOrange},
    ];
    final systemLogs = app.alerts.take(8).map<Map<String, dynamic>>((a) {
      final metricLabel = (a.metricName ?? '').isEmpty ? 'Métrique' : a.metricName!.replaceAll('gasLevel', 'Fumee').replaceAll('pressure', 'Gaz CO2');
      final valueText = a.metricValue != null ? a.metricValue!.toStringAsFixed(a.metricName == 'pressure' ? 0 : 2) : '—';
      final thresholdText = a.thresholdExceeded?.toStringAsFixed(a.metricName == 'pressure' ? 0 : 2);
      final sourceParts = <String>[if ((a.nodeName ?? '').isNotEmpty) a.nodeName!, if ((a.zoneName ?? '').isNotEmpty) a.zoneName!];
      return {
        'id': a.id,
        'severity': a.severity,
        'status': a.status,
        'time': '${a.createdAt.hour.toString().padLeft(2, '0')}:${a.createdAt.minute.toString().padLeft(2, '0')}',
        'title': (a.message != null && a.message!.trim().isNotEmpty) ? a.message! : '$metricLabel hors seuil détecté(e)',
        'detail': a.metricName != null ? '$metricLabel: $valueText${thresholdText != null ? ' (seuil: $thresholdText)' : ''}' : 'Aucune valeur détaillée',
        'source': sourceParts.isNotEmpty ? sourceParts.join(' / ') : 'Système',
      };
    }).toList();
    final zoneMap = zones
        .expand<Map<String, dynamic>>((z) => z.nodes.map((n) => {
              'id': n.id,
              'name': n.name,
              'zone': z.name,
              'status': n.status,
              'isOnline': n.isOnline,
            }))
        .toList();

    return LayoutBuilder(
      builder: (context, constraints) {
        final isPhone = constraints.maxWidth < 760;
        final compact = constraints.maxWidth < 1000;
        final p = isPhone ? 14.0 : 20.0;

        final double logsHeight = compact ? 520.0 : (constraints.maxHeight.isFinite ? (constraints.maxHeight - (p * 2)).clamp(420.0, 860.0) : 620.0);
        final Widget logsPanel = _LogsPanel(logs: systemLogs, onAcknowledge: app.acknowledgeAlert, maxHeight: logsHeight);

        // ── Sensor cards: compact horizontal scroll strip ──────────────────
        final Widget sensorStrip = SizedBox(
          height: isPhone ? 88.0 : 98.0,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.symmetric(horizontal: p),
            itemCount: sensorCards.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) {
              final c = sensorCards[i];
              final val = avg[c['key'] as String];
              final color = c['color'] as Color;
              final spark = app.sparkFor(c['key'] as String);
              return SizedBox(
                width: isPhone ? 128.0 : 148.0,
                child: AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        c['title'] as String,
                        style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.mutedFg),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            val == null ? '—' : val.toStringAsFixed(1),
                            style: TextStyle(fontSize: isPhone ? 20 : 22, fontWeight: FontWeight.w700, color: color),
                          ),
                          const SizedBox(width: 3),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 2),
                            child: Text(c['unit'] as String, style: TextStyle(fontSize: constraints.maxWidth < 500 ? 9.5 : 10.5, color: AppColors.mutedFg)),
                          ),
                        ],
                      ),
                      if (spark.isNotEmpty) Expanded(child: SparkLine(data: spark, color: color)),
                    ],
                  ),
                ),
              );
            },
          ),
        );

        // ── Tab bar ────────────────────────────────────────────────────────
        final tabs = ['CARTE ZONES', 'ANALYTIQUES', 'FLUX CCTV', if (compact) 'JOURNAUX'];
        final Widget tabBarRow = Padding(
          padding: EdgeInsets.fromLTRB(p, 10, p, 0),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final tab in tabs)
                  InkWell(
                    onTap: () => setState(() => _tab = tab),
                    borderRadius: BorderRadius.circular(4),
                    child: Padding(
                      padding: const EdgeInsets.only(right: 16, bottom: 6),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            tab,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: _tab == tab ? FontWeight.w700 : FontWeight.w400,
                              color: _tab == tab ? AppColors.foreground : AppColors.mutedFg,
                            ),
                          ),
                          if (_tab == tab) Container(height: 2, width: 52, color: AppColors.primary),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: () => _exportReport(app, dcP, avg),
                  icon: const Icon(Icons.download_outlined, size: 12),
                  label: const Text('EXPORT', style: TextStyle(fontSize: 10)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
              ],
            ),
          ),
        );

        // ── Tab body ───────────────────────────────────────────────────────
        Widget tabBody;
        if (_tab == 'CARTE ZONES') {
          tabBody = _RoomMapTab(
            zones: zones,
            zoneMap: zoneMap,
            selectedNodeId: _selectedNodeId,
            latestReadings: app.latestReadings,
            onSelect: (id, _, __, ___) => setState(() => _selectedNodeId = _selectedNodeId == id ? null : id),
          );
        } else if (_tab == 'ANALYTIQUES') {
          tabBody = _AnalyticsTab(
            dcName: dcP.connectedDC!.name,
            history: app.history,
            metricKey: _analyticsMetric,
            onMetricSelected: (metric) => setState(() => _analyticsMetric = metric),
          );
        } else if (_tab == 'JOURNAUX') {
          tabBody = logsPanel;
        } else {
          tabBody = _CctvTab(dcName: dcP.connectedDC!.name);
        }

        // ── Main column (fills viewport, content scrolls inside Expanded) ──
        final Widget mainColumn = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(p, p, p, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Vue d\'ensemble', style: TextStyle(fontSize: isPhone ? 18 : 20, fontWeight: FontWeight.w800, height: 1.2)),
                  Text('Datacenter — ${dcP.connectedDC!.name}', style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
                ],
              ),
            ),
            sensorStrip,
            tabBarRow,
            Expanded(
              child: Padding(
                padding: EdgeInsets.fromLTRB(p, 10, compact ? p : 0, p),
                child: SingleChildScrollView(child: tabBody),
              ),
            ),
          ],
        );

        if (compact) return mainColumn;

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: mainColumn),
            Container(
              width: 300,
              margin: EdgeInsets.fromLTRB(0, p, p, p),
              child: logsPanel,
            ),
          ],
        );
      },
    );
  }
}

class _LogsPanel extends StatelessWidget {
  final List<Map<String, dynamic>> logs;
  final Future<void> Function(String id) onAcknowledge;
  final double maxHeight;
  const _LogsPanel({required this.logs, required this.onAcknowledge, required this.maxHeight});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: EdgeInsets.zero,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(14, 12, 14, 8),
              child: Row(
                children: [
                  Text('JOURNAUX SYSTÈME', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                  Spacer(),
                  LiveBadge(),
                ],
              ),
            ),
            const Divider(height: 1),
            if (logs.isEmpty)
              const Padding(
                padding: EdgeInsets.all(20),
                child: Text('Aucun journal', style: TextStyle(color: AppColors.mutedFg, fontSize: 12)),
              )
            else
              Expanded(
                child: Scrollbar(
                  thumbVisibility: true,
                  child: ListView.separated(
                    padding: EdgeInsets.zero,
                    itemCount: logs.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                final log = logs[i];
                final sev = log['severity'] as String;
                final c = AppColors.status(sev);
                return Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: c.withValues(alpha: 0.1),
                              border: Border.all(color: c.withValues(alpha: 0.4)),
                              borderRadius: BorderRadius.circular(3),
                            ),
                            child: Text(sev.toUpperCase(), style: TextStyle(fontSize: 8, fontWeight: FontWeight.w700, color: c)),
                          ),
                          const Spacer(),
                          Text(log['time'] as String, style: const TextStyle(fontSize: 9, color: AppColors.mutedFg, fontFamily: 'monospace')),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(log['title'] as String, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 3),
                      Text(log['detail'] as String, style: const TextStyle(fontSize: 10, color: AppColors.mutedFg)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: Text(log['source'] as String, style: const TextStyle(fontSize: 10, color: AppColors.mutedFg), overflow: TextOverflow.ellipsis),
                          ),
                          if (log['status'] == 'active')
                            GestureDetector(
                              onTap: () => onAcknowledge(log['id'] as String),
                              child: const Text('ACQUITTER', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.primary)),
                            ),
                        ],
                      ),
                    ],
                  ),
                );
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RoomMapTab extends StatelessWidget {
  final List<Zone> zones;
  final List<Map<String, dynamic>> zoneMap;
  final String? selectedNodeId;
  final List<SensorReading> latestReadings;
  final void Function(String id, String name, String zone, String status) onSelect;

  const _RoomMapTab({
    required this.zones,
    required this.zoneMap,
    required this.selectedNodeId,
    required this.latestReadings,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    // Group zones by part → room  (mirrors web roomMap useMemo)
    final Map<String, Map<String, List<Zone>>> grouped = {};
    for (final z in zones) {
      final part = z.part ?? 'Général';
      final room = z.room ?? 'Salle Principale';
      grouped.putIfAbsent(part, () => {}).putIfAbsent(room, () => []).add(z);
    }

    // Find selected zone (first zone whose first node matches selectedNodeId)
    Zone? selectedZone;
    if (selectedNodeId != null) {
      for (final z in zones) {
        if (z.nodes.any((n) => n.id == selectedNodeId)) {
          selectedZone = z;
          break;
        }
      }
    }

    final reading = selectedNodeId == null
        ? null
        : latestReadings.cast<SensorReading?>().firstWhere(
              (r) => r?.nodeId == selectedNodeId,
              orElse: () => null,
            );

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          const Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              Text('CARTE DES SALLES', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
              Wrap(spacing: 12, children: [
                _Dot('NORMAL', AppColors.statusNormal),
                _Dot('AVERT.', AppColors.statusWarning),
                _Dot('CRITIQUE', AppColors.statusCritical),
              ]),
            ],
          ),
          const SizedBox(height: 14),
          // Parts → Rooms → Zones
          ...grouped.entries.map((partEntry) {
            final part = partEntry.key;
            final rooms = partEntry.value;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(part.toUpperCase(),
                    style: const TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: AppColors.mutedFg)),
                const SizedBox(height: 6),
                const Divider(height: 1),
                const SizedBox(height: 10),
                ...rooms.entries.map((roomEntry) {
                  final room = roomEntry.key;
                  final roomZones = roomEntry.value;
                  // Room status = worst of its zones
                  final roomStatus = roomZones.any((z) => z.status == 'critical' || z.status == 'alert')
                      ? 'critical'
                      : roomZones.any((z) => z.status == 'warning')
                          ? 'warning'
                          : 'normal';
                  final roomColor = AppColors.status(roomStatus);
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    decoration: BoxDecoration(
                      color: roomColor.withValues(alpha: 0.05),
                      border: Border.all(color: roomColor.withValues(alpha: 0.25)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Room header
                        Padding(
                          padding: const EdgeInsets.fromLTRB(10, 8, 10, 6),
                          child: Row(children: [
                            Text(room,
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: roomColor)),
                            const Spacer(),
                            Text(
                                '${roomZones.length} zone${roomZones.length > 1 ? 's' : ''}',
                                style: const TextStyle(
                                    fontSize: 10,
                                    color: AppColors.mutedFg)),
                          ]),
                        ),
                        const Divider(height: 1),
                        // Zone boxes grid (one box per zone — mirrors web)
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: LayoutBuilder(
                            builder: (context, constraints) {
                              final cols = constraints.maxWidth < 330
                                  ? 2
                                  : constraints.maxWidth < 700
                                      ? 3
                                      : constraints.maxWidth < 1100
                                          ? 4
                                          : 5;
                              return GridView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                itemCount: roomZones.length,
                                gridDelegate:
                                    SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: cols,
                                  mainAxisSpacing: 6,
                                  crossAxisSpacing: 6,
                                  childAspectRatio: constraints.maxWidth < 500 ? 1.95 : 2.35,
                                ),
                                itemBuilder: (_, i) {
                                  final z = roomZones[i];
                                  // Use first node id for selection
                                  final firstNodeId =
                                      z.nodes.isNotEmpty ? z.nodes.first.id : z.id;
                                  final selected = selectedZone?.id == z.id;
                                  final zc = AppColors.status(z.status);
                                  // Short label: last segment after " - "
                                  final label = z.roomPart != null
                                      ? '${z.roomPart} - ${z.name.split(' - ').last}'
                                      : z.name.split(' - ').last;
                                  return GestureDetector(
                                    onTap: () => onSelect(
                                        firstNodeId, z.name, z.name, z.status),
                                    child: AnimatedContainer(
                                      duration:
                                          const Duration(milliseconds: 150),
                                      decoration: BoxDecoration(
                                        color: zc.withValues(alpha: 0.08),
                                        border: Border.all(
                                            color: selected
                                                ? AppColors.primary
                                                : zc.withValues(alpha: 0.3),
                                            width: selected ? 2 : 1.5),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Center(
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          child: Text(label,
                                              style: TextStyle(
                                                  fontSize: 10,
                                                  fontWeight: FontWeight.w700,
                                                  color: zc),
                                              textAlign: TextAlign.center,
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis),
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              );
                            },
                          ),
                        ),
                        // Show selected node panel inline, below this room's zones
                        if (selectedNodeId != null && selectedZone != null && roomZones.any((z) => z.id == selectedZone!.id))
                          Padding(
                            padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                            child: _SelectedNodePanel(
                              zoneMap: zoneMap,
                              selectedNodeId: selectedNodeId!,
                              reading: reading,
                            ),
                          ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 6),
              ],
            );
          }),
          Text('Total Zones: ${zones.length}',
              style: const TextStyle(fontSize: 10, color: AppColors.mutedFg),
              textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _SelectedNodePanel extends StatelessWidget {
  final List<Map<String, dynamic>> zoneMap;
  final String selectedNodeId;
  final SensorReading? reading;
  const _SelectedNodePanel({required this.zoneMap, required this.selectedNodeId, required this.reading});

  @override
  Widget build(BuildContext context) {
    final selectedNode = zoneMap.firstWhere(
      (n) => n['id'] == selectedNodeId,
      orElse: () => {'id': '', 'name': '?', 'zone': '', 'status': 'normal', 'isOnline': false},
    );
    final nodeName = (selectedNode['name'] ?? '?') as String;
    final zoneName = (selectedNode['zone'] ?? '') as String;
    final nodeStatus = (selectedNode['status'] ?? 'normal') as String;
    final isOnline = (selectedNode['isOnline'] ?? false) as bool;
    final metrics = [
      {'key': 'temperature', 'label': 'Température', 'unit': '°C', 'icon': Icons.device_thermostat},
      {'key': 'humidity', 'label': 'Humidité', 'unit': '%', 'icon': Icons.water_drop_outlined},
      {'key': 'pressure', 'label': 'Gaz CO2', 'unit': 'ppm', 'icon': Icons.speed_outlined},
      {'key': 'vibration', 'label': 'Vibration', 'unit': 'mm/s', 'icon': Icons.waves},
      {'key': 'gasLevel', 'label': 'Fumee', 'unit': 'ppm', 'icon': Icons.shield_outlined},
    ];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 6,
            runSpacing: 6,
            children: [
              Icon(isOnline ? Icons.wifi : Icons.wifi_off, size: 14, color: isOnline ? AppColors.statusNormal : AppColors.mutedFg),
              Text(nodeName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              Text('— $zoneName', style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
              _NodeStatusBadge(status: nodeStatus),
            ],
          ),
          const SizedBox(height: 12),
          if (reading == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Center(child: Text(isOnline ? 'Chargement des métriques...' : 'Node hors ligne — aucune donnée récente', style: const TextStyle(fontSize: 11, color: AppColors.mutedFg))),
            )
          else
            LayoutBuilder(
              builder: (context, constraints) {
                final cols = constraints.maxWidth >= 1000 ? 5 : constraints.maxWidth >= 650 ? 3 : 2;
                return GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: metrics.length,
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: cols,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    childAspectRatio: 1.45,
                  ),
                  itemBuilder: (_, i) {
                    final m = metrics[i];
                    return _ZoneMetricCard(
                      metricKey: m['key'] as String,
                      label: m['label'] as String,
                      unit: m['unit'] as String,
                      icon: m['icon'] as IconData,
                      value: reading!.get(m['key'] as String),
                    );
                  },
                );
              },
            ),
          if (reading != null) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: Text('Dernière lecture : ${DateFormat('dd/MM/yyyy HH:mm').format(reading!.recordedAt.toLocal())}', style: const TextStyle(fontSize: 10, color: AppColors.mutedFg)),
            ),
          ],
        ],
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  final String l;
  final Color c;
  const _Dot(this.l, this.c);

  @override
  Widget build(BuildContext _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 7, height: 7, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 4),
          Text(l, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: AppColors.mutedFg)),
        ],
      );
}

class _NodeStatusBadge extends StatelessWidget {
  final String status;
  const _NodeStatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final s = status.toLowerCase();
    final color = AppColors.status(s);
    final label = s == 'warning' ? 'Warning' : (s == 'alert' || s == 'critical') ? 'Alert' : 'Normal';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(999),
        color: color.withValues(alpha: 0.04),
      ),
      child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

class _ZoneMetricCard extends StatelessWidget {
  final String metricKey;
  final String label;
  final String unit;
  final IconData icon;
  final double? value;
  const _ZoneMetricCard({required this.metricKey, required this.label, required this.unit, required this.icon, required this.value});

  @override
  Widget build(BuildContext context) {
    final status = MetricMeta.valueStatus(metricKey, value);
    late final Color bg;
    late final Color border;
    late final Color labelColor;
    late final Color valueColor;
    switch (status) {
      case 'alert':
        bg = AppColors.statusCritical.withValues(alpha: 0.08);
        border = AppColors.statusCritical.withValues(alpha: 0.30);
        labelColor = AppColors.statusCritical;
        valueColor = AppColors.statusCritical;
        break;
      case 'warning':
        bg = AppColors.statusWarning.withValues(alpha: 0.08);
        border = AppColors.statusWarning.withValues(alpha: 0.30);
        labelColor = AppColors.statusWarning;
        valueColor = AppColors.statusWarning;
        break;
      case 'unknown':
        bg = AppColors.muted.withValues(alpha: 0.35);
        border = AppColors.border;
        labelColor = AppColors.mutedFg;
        valueColor = AppColors.mutedFg;
        break;
      default:
        bg = AppColors.statusNormal.withValues(alpha: 0.05);
        border = AppColors.statusNormal.withValues(alpha: 0.20);
        labelColor = AppColors.statusNormal;
        valueColor = AppColors.foreground;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, border: Border.all(color: border), borderRadius: BorderRadius.circular(8)),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 14, color: labelColor),
              const SizedBox(width: 4),
              Flexible(child: Text(label, style: TextStyle(fontSize: 10, color: labelColor, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis, textAlign: TextAlign.center)),
            ],
          ),
          const SizedBox(height: 8),
          Text(value != null ? value!.toStringAsFixed(metricKey == 'pressure' ? 0 : 2) : '—', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: valueColor), textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(unit, style: const TextStyle(fontSize: 10, color: AppColors.mutedFg)),
        ],
      ),
    );
  }
}

class _AnalyticsTab extends StatelessWidget {
  final String dcName;
  final List<SensorHistoryRow> history;
  final String metricKey;
  final ValueChanged<String> onMetricSelected;
  const _AnalyticsTab({required this.dcName, required this.history, required this.metricKey, required this.onMetricSelected});

  List<Map<String, dynamic>> _buildSeries(String key) {
    final rows = history
        .map((r) => {'time': r.recordedAt.toLocal(), 'value': r.get(key)})
        .where((row) => row['value'] != null)
        .toList();
    if (rows.isEmpty) return const [];

    final bucketSize = ((rows.length / 14).ceil().clamp(1, rows.length));
    final series = <Map<String, dynamic>>[];
    for (int i = 0; i < rows.length; i += bucketSize) {
      final chunk = rows.sublist(i, ((i + bucketSize).clamp(0, rows.length)));
      final avg = chunk.map((e) => (e['value'] as num).toDouble()).reduce((a, b) => a + b) / chunk.length;
      final middle = chunk[chunk.length ~/ 2]['time'] as DateTime;
      series.add({
        'label': '${middle.hour.toString().padLeft(2, '0')}:${middle.minute.toString().padLeft(2, '0')}',
        'actual': avg,
      });
    }

    if (series.length > 1) {
      final recent = series.skip(series.length > 4 ? series.length - 4 : 0).map((e) => (e['actual'] as double)).toList();
      final baseline = recent.isNotEmpty ? recent.last : (series.last['actual'] as double);
      final first = recent.isNotEmpty ? recent.first : baseline;
      final slope = (baseline - first) / ((recent.length > 1 ? recent.length - 1 : 1));
      final maxStep = ((baseline == 0 ? 1 : baseline.abs()) * 0.08).clamp(0.4, 999999.0);
      final safeSlope = slope.clamp(-maxStep, maxStep);
      for (int i = 0; i < 4; i++) {
        final predicted = baseline + safeSlope * (i + 1);
        series.add({
          'label': i == 0 ? series.last['label'] : '+$i',
          'actual': i == 0 ? baseline : null,
          'predicted': predicted,
        });
      }
    }

    return series;
  }

  @override
  Widget build(BuildContext context) {
    const metricKeys = ['temperature', 'humidity', 'pressure', 'vibration', 'gasLevel'];
    final summaries = metricKeys.map((key) {
      final series = _buildSeries(key);
      final current = series.lastWhere((item) => item['actual'] != null, orElse: () => const {'actual': null})['actual'] as double?;
      final predicted = series.lastWhere((item) => item['predicted'] != null, orElse: () => const {'predicted': null})['predicted'] as double?;
      return {
        'key': key,
        'label': MetricMeta.label[key] ?? key,
        'unit': MetricMeta.unit[key] ?? '',
        'color': MetricMeta.chartColor(key),
        'current': current,
        'predicted': predicted,
        'status': MetricMeta.valueStatus(key, predicted ?? current),
      };
    }).toList();

    final selectedSeries = _buildSeries(metricKey);
    final selectedColor = MetricMeta.chartColor(metricKey);
    final selectedLabel = MetricMeta.label[metricKey] ?? metricKey;
    final selectedUnit = MetricMeta.unit[metricKey] ?? '';
    final alertMin = MetricMeta.alertMin[metricKey];
    final alertMax = MetricMeta.alertMax[metricKey];
    final warnMin = MetricMeta.warnMin[metricKey];
    final warnMax = MetricMeta.warnMax[metricKey];

    final actualSpots = <FlSpot>[];
    final predictedSpots = <FlSpot>[];
    for (int i = 0; i < selectedSeries.length; i++) {
      final item = selectedSeries[i];
      final actual = item['actual'] as double?;
      final predicted = item['predicted'] as double?;
      if (actual != null) actualSpots.add(FlSpot(i.toDouble(), actual));
      if (predicted != null) predictedSpots.add(FlSpot(i.toDouble(), predicted));
    }

    HorizontalLine thresholdLine(double value, Color color) => HorizontalLine(y: value, color: color.withOpacity(0.8), strokeWidth: 1, dashArray: [5, 4]);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('⚡', style: TextStyle(fontSize: 14, color: AppColors.primary)),
              const SizedBox(width: 6),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Prediction multi-metriques - $dcName', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                    const Text('Projection IA sur temperature, humidite, Gaz CO2, Fumee et vibration.', style: TextStyle(fontSize: 11, color: AppColors.mutedFg)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: metricKeys.map((key) {
              final selected = key == metricKey;
              return ChoiceChip(
                label: Text(MetricMeta.label[key] ?? key, style: TextStyle(fontSize: 11, color: selected ? MetricMeta.chartColor(key) : AppColors.foreground)),
                selected: selected,
                onSelected: (_) => onMetricSelected(key),
                side: BorderSide(color: selected ? MetricMeta.chartColor(key) : AppColors.border),
                selectedColor: MetricMeta.chartColor(key).withOpacity(0.08),
                backgroundColor: Colors.white,
              );
            }).toList(),
          ),
          const SizedBox(height: 14),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: summaries.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.9,
            ),
            itemBuilder: (_, index) {
              final item = summaries[index];
              final status = item['status'] as String;
              final borderColor = status == 'alert'
                  ? AppColors.statusCritical.withOpacity(0.28)
                  : status == 'warning'
                      ? AppColors.statusWarning.withOpacity(0.28)
                      : AppColors.border;
              final bgColor = status == 'alert'
                  ? AppColors.statusCritical.withOpacity(0.05)
                  : status == 'warning'
                      ? AppColors.statusWarning.withOpacity(0.05)
                      : AppColors.muted.withOpacity(0.22);
              final current = item['current'] as double?;
              final predicted = item['predicted'] as double?;
              final unit = item['unit'] as String;
              final key = item['key'] as String;
              return Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: bgColor, border: Border.all(color: borderColor), borderRadius: BorderRadius.circular(10)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item['label'] as String, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.mutedFg)),
                    const Spacer(),
                    RichText(
                      text: TextSpan(
                        style: const TextStyle(color: AppColors.foreground),
                        children: [
                          TextSpan(
                            text: current == null ? '—' : current.toStringAsFixed(key == 'pressure' ? 0 : 2),
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: item['color'] as Color),
                          ),
                          TextSpan(text: ' $unit', style: const TextStyle(fontSize: 10, color: AppColors.mutedFg)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Prévu: ${predicted == null ? '—' : predicted.toStringAsFixed(key == 'pressure' ? 0 : 2)} $unit',
                      style: const TextStyle(fontSize: 10, color: AppColors.mutedFg),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 300,
            child: actualSpots.length < 2
                ? const Center(child: Text('Pas assez de données', style: TextStyle(color: AppColors.mutedFg)))
                : LineChart(
                    LineChartData(
                      minX: 0,
                      maxX: (selectedSeries.length - 1).toDouble(),
                      gridData: FlGridData(show: true, drawVerticalLine: false, getDrawingHorizontalLine: (_) => const FlLine(color: AppColors.border, strokeWidth: 1)),
                      borderData: FlBorderData(show: false),
                      extraLinesData: ExtraLinesData(horizontalLines: [
                        if (warnMin != null) thresholdLine(warnMin, AppColors.statusWarning),
                        if (warnMax != null) thresholdLine(warnMax, AppColors.statusWarning),
                        if (alertMin != null) thresholdLine(alertMin, AppColors.statusCritical),
                        if (alertMax != null) thresholdLine(alertMax, AppColors.statusCritical),
                      ]),
                      titlesData: FlTitlesData(
                        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 34, getTitlesWidget: (v, _) => Text(v.toStringAsFixed(metricKey == 'pressure' ? 0 : 1), style: const TextStyle(fontSize: 10, color: AppColors.mutedFg)))),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 24,
                            interval: selectedSeries.length > 8 ? 2 : 1,
                            getTitlesWidget: (value, _) {
                              final index = value.toInt();
                              if (index < 0 || index >= selectedSeries.length) return const SizedBox.shrink();
                              return Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(selectedSeries[index]['label'] as String, style: const TextStyle(fontSize: 9, color: AppColors.mutedFg)),
                              );
                            },
                          ),
                        ),
                      ),
                      lineTouchData: LineTouchData(
                        touchTooltipData: LineTouchTooltipData(
                          getTooltipItems: (spots) => spots.map((spot) {
                            final value = spot.y.toStringAsFixed(metricKey == 'pressure' ? 0 : 2);
                            return LineTooltipItem('$selectedLabel\n$value $selectedUnit', const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white));
                          }).toList(),
                        ),
                      ),
                      lineBarsData: [
                        LineChartBarData(spots: actualSpots, isCurved: true, color: selectedColor, barWidth: 2.4, dotData: const FlDotData(show: false)),
                        if (predictedSpots.isNotEmpty)
                          LineChartBarData(spots: predictedSpots, isCurved: true, color: AppColors.statusWarning, barWidth: 2.2, dashArray: [6, 4], dotData: const FlDotData(show: false)),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _CctvTab extends StatelessWidget {
  final String dcName;
  const _CctvTab({required this.dcName});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        children: [
          const Icon(Icons.videocam_outlined, size: 40, color: AppColors.mutedFg),
          const SizedBox(height: 12),
          Text('Flux CCTV — $dcName', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          const Text('Aperçu CCTV indisponible sur cette maquette Flutter.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.mutedFg)),
        ],
      ),
    );
  }
}
