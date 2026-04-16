// lib/screens/history/history_screen.dart — mirrors History.tsx
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/app_state.dart';
import '../../services/api.dart';
import '../../models/models.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';
import '../../utils/export_file.dart';

const _kAuditActionLabels = {
  'auth.login': 'Connexion',
  'auth.signup': 'Inscription',
  'auth.verify_email': 'Vérif. email',
  'threshold.create': 'Seuil créé',
  'threshold.update': 'Seuil modifié',
  'threshold.bulk_upsert': 'Seuils maj',
  'threshold.delete': 'Seuil supprimé',
  'profile.update': 'Profil mis à jour',
  'user.role_update': 'Rôle modifié',
  'user.delete': 'Utilisateur supprimé',
  'role_request.create': 'Demande élévation',
  'role_request.approved': 'Élévation accordée',
  'role_request.rejected': 'Élévation refusée',
  'alert.notified': 'Alerte notifiée',
};

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});
  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  String _tab = 'sensors'; // sensors | audit
  int _page = 1;
  bool _loading = false;
  List<SensorHistoryRow> _rows = [];
  List<dynamic> _auditRows = [];
  Map<String, dynamic> _pagination = {};
  String? _zoneId;
  String? _nodeId;
  DateTimeRange? _range;
  List<Zone> _zones = [];
  List<IoNode> _nodes = [];

  // Audit filters
  String _auditSearch = '';
  String _auditAction = '';    // '' = all
  String _auditTargetType = ''; // '' = all
  String _auditFrom = '';
  String _auditTo = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      final dcP = context.read<DatacenterProvider>();
      final api = context.read<ApiService>();
      final dcId = dcP.connectedDC?.id;
      if (dcId != null) {
        _zones = await api.getZones(dcId);
        _nodes = await api.getNodes(datacenterId: dcId, zoneId: _zoneId);
      } else {
        _zones = [];
        _nodes = [];
      }
      if (_tab == 'sensors') {
        final res = await api.getSensorHistory(
            datacenterId: _nodeId == null ? dcId : null,
            zoneId: _zoneId,
            nodeId: _nodeId,
            from: _range?.start.toIso8601String(),
            to: _range?.end.toIso8601String(),
            page: _page,
            limit: 100,
            hours: _range == null ? 24 : null);
        setState(() {
          _rows = res['data'] as List<SensorHistoryRow>;
          _pagination = res['pagination'] ?? {};
        });
      } else {
        final res = await api.getAuditLogs(
            action: _auditAction.isEmpty ? null : _auditAction,
            targetType: _auditTargetType.isEmpty ? null : _auditTargetType,
            from: _auditFrom.isEmpty ? null : _auditFrom,
            to: _auditTo.isEmpty ? null : _auditTo,
            page: _page,
            limit: 50);
        setState(() {
          _auditRows = res['data'] ?? [];
          _pagination = res['pagination'] ?? {};
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _exportCsv() async {
    final buffer = StringBuffer();
    String filename;
    if (_tab == 'sensors') {
      if (_rows.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Aucune donnée à exporter.')));
        return;
      }
      buffer.writeln(
          'recorded_at,node_id,node_name,temperature,humidity,pressure,vibration,gas_ppm');
      for (final r in _rows) {
        buffer.writeln(
            '${r.recordedAt.toUtc().toIso8601String()},${r.nodeId},${(r.nodeName ?? '').replaceAll(',', ' ')},${r.temperature ?? ''},${r.humidity ?? ''},${r.pressure ?? ''},${r.vibration ?? ''},${r.gasLevel ?? ''}');
      }
      filename = 'historique_capteurs_${DateTime.now().toIso8601String().substring(0, 10)}.csv';
    } else {
      if (_auditRows.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Aucun journal à exporter.')));
        return;
      }
      buffer.writeln('created_at,action,target,details');
      for (final raw in _auditRows) {
        final r = raw as Map<String, dynamic>;
        final created = r['createdAt'] ?? r['created_at'] ?? '';
        final action = r['action'] ?? '';
        final target = r['targetType'] ?? '';
        final details = (r['details'] ?? '').toString().replaceAll('"', '""');
        buffer.writeln('"$created","$action","$target","$details"');
      }
      filename = 'historique_audit_${DateTime.now().toIso8601String().substring(0, 10)}.csv';
    }
    await saveCsvFile(filename: filename, csv: buffer.toString());
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Export enregistré: $filename')),
    );
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
        context: context,
        firstDate: now.subtract(const Duration(days: 30)),
        lastDate: now.add(const Duration(days: 1)),
        initialDateRange: _range ??
            DateTimeRange(
                start: now.subtract(const Duration(hours: 6)), end: now));
    if (picked != null) {
      setState(() {
        _range = picked;
        _page = 1;
      });
      _load();
    }
  }

  void _resetFilters() {
    setState(() {
      _zoneId = null;
      _nodeId = null;
      _range = null;
      _page = 1;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final dcP = context.watch<DatacenterProvider>();
    return SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.history_outlined, size: 22, color: AppColors.primary),
            SizedBox(width: 8),
            Text('Historique',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800))
          ]),
          const Text('Données capteurs et journal d\'interventions / audit',
              style: TextStyle(fontSize: 12, color: AppColors.mutedFg)),
          const SizedBox(height: 16),
          // Tab switcher
          Row(children: [
            _TabBtn(
                'Données capteurs', _tab == 'sensors', Icons.storage_outlined,
                () {
              setState(() {
                _tab = 'sensors';
                _page = 1;
              });
              _load();
            }),
            const SizedBox(width: 8),
            _TabBtn('Interventions & Audit', _tab == 'audit',
                Icons.assignment_outlined, () {
              setState(() {
                _tab = 'audit';
                _page = 1;
              });
              _load();
            }),
          ]),
          const SizedBox(height: 14),
          // Controls — sensors tab
          if (_tab == 'sensors')
            AppCard(
                padding: const EdgeInsets.all(12),
                child: Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const _FilterLabel('DATACENTER'),
                            const SizedBox(height: 4),
                            Text(dcP.connectedDC?.name ?? 'Tous',
                                style: const TextStyle(
                                    fontSize: 12, fontWeight: FontWeight.w600)),
                          ]),
                      _DropdownBox(
                          label: 'ZONE',
                          value: _zoneId,
                          items: [
                            const DropdownMenuItem<String?>(
                                value: null, child: Text('Toutes')),
                            ..._zones.map((z) => DropdownMenuItem<String?>(
                                value: z.id,
                                child: Text(z.name,
                                    overflow: TextOverflow.ellipsis))),
                          ],
                          onChanged: (v) {
                            setState(() {
                              _zoneId = v;
                              _nodeId = null;
                              _page = 1;
                            });
                            _load();
                          }),
                      _DropdownBox(
                          label: 'NODE',
                          value: _nodeId,
                          items: [
                            const DropdownMenuItem<String?>(
                                value: null, child: Text('Tous')),
                            ..._nodes.map((n) => DropdownMenuItem<String?>(
                                value: n.id,
                                child: Text(n.name,
                                    overflow: TextOverflow.ellipsis))),
                          ],
                          onChanged: (v) {
                            setState(() {
                              _nodeId = v;
                              _page = 1;
                            });
                            _load();
                          }),
                      Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const _FilterLabel('PERIODE'),
                            const SizedBox(height: 4),
                            OutlinedButton.icon(
                                icon: const Icon(Icons.date_range, size: 14),
                                label: Text(
                                    _range == null
                                        ? '6 dernières heures'
                                        : '${_range!.start.toLocal().toString().substring(0, 16)} - ${_range!.end.toLocal().toString().substring(0, 16)}',
                                    style: const TextStyle(fontSize: 11)),
                                onPressed: _pickRange)
                          ]),
                      TextButton.icon(
                          onPressed: _resetFilters,
                          icon: const Icon(Icons.refresh, size: 14),
                          label: const Text('Réinitialiser',
                              style: TextStyle(fontSize: 11))),
                      ElevatedButton.icon(
                          icon: const Icon(Icons.download_outlined, size: 14),
                          label: const Text('Exporter CSV',
                              style: TextStyle(fontSize: 12)),
                          onPressed: _exportCsv,
                          style: ElevatedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 10))),
                    ])),
          // Controls — audit tab
          if (_tab == 'audit')
            AppCard(
                padding: const EdgeInsets.all(12),
                child: Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      SizedBox(
                          width: 200,
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const _FilterLabel('RECHERCHE'),
                                const SizedBox(height: 4),
                                TextField(
                                    onChanged: (v) =>
                                        setState(() => _auditSearch = v),
                                    decoration: const InputDecoration(
                                        hintText: 'Acteur, action...',
                                        prefixIcon: Icon(Icons.search,
                                            size: 16,
                                            color: AppColors.mutedFg),
                                        contentPadding: EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 8)),
                                    style: const TextStyle(fontSize: 12))
                              ])),
                      SizedBox(
                          width: 170,
                          child: _DropdownBox(
                              label: 'ACTION',
                              value: _auditAction.isEmpty ? null : _auditAction,
                              items: [
                                const DropdownMenuItem<String?>(
                                    value: null, child: Text('Toutes')),
                                ..._kAuditActionLabels.entries.map((e) =>
                                    DropdownMenuItem<String?>(
                                        value: e.key,
                                        child: Text(e.value,
                                            overflow: TextOverflow.ellipsis))),
                              ],
                              onChanged: (v) {
                                setState(() {
                                  _auditAction = v ?? '';
                                  _page = 1;
                                });
                                _load();
                              })),
                      SizedBox(
                          width: 150,
                          child: _DropdownBox(
                              label: 'TYPE CIBLE',
                              value: _auditTargetType.isEmpty
                                  ? null
                                  : _auditTargetType,
                              items: const [
                                DropdownMenuItem<String?>(
                                    value: null, child: Text('Tous')),
                                DropdownMenuItem<String?>(
                                    value: 'user',
                                    child: Text('Utilisateur')),
                                DropdownMenuItem<String?>(
                                    value: 'threshold',
                                    child: Text('Seuil')),
                                DropdownMenuItem<String?>(
                                    value: 'role_request',
                                    child: Text('Élévation rôle')),
                              ],
                              onChanged: (v) {
                                setState(() {
                                  _auditTargetType = v ?? '';
                                  _page = 1;
                                });
                                _load();
                              })),
                      Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const _FilterLabel('DU'),
                            const SizedBox(height: 4),
                            OutlinedButton.icon(
                                icon:
                                    const Icon(Icons.calendar_today, size: 12),
                                label: Text(
                                    _auditFrom.isEmpty
                                        ? 'Date début'
                                        : _auditFrom,
                                    style: const TextStyle(fontSize: 11)),
                                onPressed: () async {
                                  final d = await showDatePicker(
                                      context: context,
                                      initialDate: DateTime.now()
                                          .subtract(const Duration(days: 7)),
                                      firstDate: DateTime(2024),
                                      lastDate: DateTime.now());
                                  if (d != null) {
                                    setState(() {
                                      _auditFrom =
                                          d.toIso8601String().substring(0, 10);
                                      _page = 1;
                                    });
                                    _load();
                                  }
                                })
                          ]),
                      Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const _FilterLabel('AU'),
                            const SizedBox(height: 4),
                            OutlinedButton.icon(
                                icon:
                                    const Icon(Icons.calendar_today, size: 12),
                                label: Text(
                                    _auditTo.isEmpty ? 'Date fin' : _auditTo,
                                    style: const TextStyle(fontSize: 11)),
                                onPressed: () async {
                                  final d = await showDatePicker(
                                      context: context,
                                      initialDate: DateTime.now(),
                                      firstDate: DateTime(2024),
                                      lastDate: DateTime.now()
                                          .add(const Duration(days: 1)));
                                  if (d != null) {
                                    setState(() {
                                      _auditTo =
                                          d.toIso8601String().substring(0, 10);
                                      _page = 1;
                                    });
                                    _load();
                                  }
                                })
                          ]),
                      TextButton.icon(
                          onPressed: () {
                            setState(() {
                              _auditSearch = '';
                              _auditAction = '';
                              _auditTargetType = '';
                              _auditFrom = '';
                              _auditTo = '';
                              _page = 1;
                            });
                            _load();
                          },
                          icon: const Icon(Icons.refresh, size: 14),
                          label: const Text('Réinitialiser',
                              style: TextStyle(fontSize: 11))),
                      ElevatedButton.icon(
                          icon: const Icon(Icons.download_outlined, size: 14),
                          label: const Text('Exporter CSV',
                              style: TextStyle(fontSize: 12)),
                          onPressed: _exportCsv,
                          style: ElevatedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 10))),
                    ])),
          const SizedBox(height: 14),
          // Table
          _loading
              ? const Center(
                  child: Padding(
                      padding: EdgeInsets.all(40),
                      child:
                          CircularProgressIndicator(color: AppColors.primary)))
              : _tab == 'sensors'
                  ? _SensorTable(rows: _rows)
                  : _AuditTable(rows: _auditSearch.isEmpty
                      ? _auditRows
                      : _auditRows.where((raw) {
                          final r = raw as Map<String, dynamic>;
                          final q = _auditSearch.toLowerCase();
                          final actor = r['actorId'];
                          final actorStr = actor is Map
                              ? '${actor['firstName'] ?? ''} ${actor['lastName'] ?? ''} ${actor['email'] ?? ''}'
                                  .toLowerCase()
                              : '';
                          return (r['action'] ?? '').toString().toLowerCase().contains(q) ||
                              actorStr.contains(q) ||
                              (r['targetType'] ?? '').toString().toLowerCase().contains(q);
                        }).toList()),
          const SizedBox(height: 12),
          // Pagination
          if (_pagination.isNotEmpty)
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              IconButton(
                  icon: const Icon(Icons.chevron_left),
                  onPressed: _page > 1
                      ? () {
                          setState(() => _page--);
                          _load();
                        }
                      : null,
                  color: AppColors.primary),
              Text('Page $_page / ${_pagination['pages'] ?? 1}',
                  style: const TextStyle(fontSize: 12)),
              IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: _page < (_pagination['pages'] ?? 1)
                      ? () {
                          setState(() => _page++);
                          _load();
                        }
                      : null,
                  color: AppColors.primary),
              Text(' — ${_pagination['total'] ?? 0} entrées',
                  style:
                      const TextStyle(fontSize: 11, color: AppColors.mutedFg)),
            ]),
        ]));
  }
}

class _TabBtn extends StatelessWidget {
  final String l;
  final bool active;
  final IconData icon;
  final VoidCallback onTap;
  const _TabBtn(this.l, this.active, this.icon, this.onTap);
  @override
  Widget build(BuildContext c) => GestureDetector(
      onTap: onTap,
      child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
              color: active ? AppColors.card : Colors.transparent,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(6)),
          child: Row(children: [
            Icon(icon,
                size: 14,
                color: active ? AppColors.foreground : AppColors.mutedFg),
            const SizedBox(width: 6),
            Text(l,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                    color: active ? AppColors.foreground : AppColors.mutedFg))
          ])));
}

class _FilterLabel extends StatelessWidget {
  final String t;
  const _FilterLabel(this.t);
  @override
  Widget build(BuildContext c) => Text(t,
      style: const TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: AppColors.mutedFg,
          letterSpacing: 0.5));
}

class _DropdownBox extends StatelessWidget {
  final String label;
  final String? value;
  final List<DropdownMenuItem<String?>> items;
  final ValueChanged<String?> onChanged;
  const _DropdownBox(
      {required this.label,
      required this.value,
      required this.items,
      required this.onChanged});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: 160,
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _FilterLabel(label),
              const SizedBox(height: 4),
              DropdownButton<String?>(
                  value: value,
                  isExpanded: true,
                  items: items,
                  onChanged: onChanged,
                  underline: Container(
                      height: 1, color: AppColors.border),
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.foreground))
            ]),
      );
}

class _SensorTable extends StatelessWidget {
  final List<SensorHistoryRow> rows;
  const _SensorTable({required this.rows});
  Color _metricColor(String m, double? v) {
    if (v == null) return AppColors.foreground;
    final st = MetricMeta.valueStatus(m, v);
    if (st == 'alert') return AppColors.statusCritical;
    if (st == 'warning') return AppColors.statusWarning;
    return AppColors.foreground;
  }

  @override
  Widget build(BuildContext c) {
    if (rows.isEmpty) {
      return const EmptyState('Aucune donnée', icon: Icons.storage_outlined);
    }
    final fmt = DateFormat('dd/MM/yyyy HH:mm:ss');
    return AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          // Header
          Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: AppColors.border))),
              child: Row(children: [
                const Icon(Icons.storage_outlined,
                    size: 14, color: AppColors.primary),
                const SizedBox(width: 6),
                const Text('Relevés capteurs',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(width: 6),
                Text('— ${rows.length} entrées',
                    style: const TextStyle(
                        fontSize: 11, color: AppColors.mutedFg)),
              ])),
          // Column headers
          Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              color: AppColors.muted.withOpacity(0.3),
              child: const Row(children: [
                Expanded(
                    flex: 3,
                    child: Text('DATE / HEURE',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5))),
                Expanded(
                    flex: 3,
                    child: Text('NODE',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5))),
                Expanded(
                    flex: 2,
                    child: Text('T (°C)',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5),
                        textAlign: TextAlign.right)),
                Expanded(
                    flex: 2,
                    child: Text('H (%)',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5),
                        textAlign: TextAlign.right)),
                Expanded(
                    flex: 2,
                    child: Text('P (HPA)',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5),
                        textAlign: TextAlign.right)),
                Expanded(
                    flex: 2,
                    child: Text('V (MM/S)',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5),
                        textAlign: TextAlign.right)),
                Expanded(
                    flex: 2,
                    child: Text('FUMEE (PPM)',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5),
                        textAlign: TextAlign.right)),
              ])),
          // Rows
          ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final r = rows[i];
                return Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                    child: Row(children: [
                      Expanded(
                          flex: 3,
                          child: Text(fmt.format(r.recordedAt.toLocal()),
                              style: const TextStyle(
                                  fontSize: 11, fontFamily: 'monospace'))),
                      Expanded(
                          flex: 3,
                          child: Text(r.nodeName ?? r.nodeId.substring(0, 8),
                              style: const TextStyle(fontSize: 11),
                              overflow: TextOverflow.ellipsis)),
                      Expanded(
                          flex: 2,
                          child: Text(r.temperature?.toStringAsFixed(2) ?? '—',
                              style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: _metricColor(
                                      'temperature', r.temperature)),
                              textAlign: TextAlign.right)),
                      Expanded(
                          flex: 2,
                          child: Text(r.humidity?.toStringAsFixed(2) ?? '—',
                              style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: _metricColor('humidity', r.humidity)),
                              textAlign: TextAlign.right)),
                      Expanded(
                          flex: 2,
                          child: Text(r.pressure?.toStringAsFixed(0) ?? '—',
                              style: const TextStyle(
                                  fontSize: 11, fontWeight: FontWeight.w600),
                              textAlign: TextAlign.right)),
                      Expanded(
                          flex: 2,
                          child: Text(r.vibration?.toStringAsFixed(2) ?? '—',
                              style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color:
                                      _metricColor('vibration', r.vibration)),
                              textAlign: TextAlign.right)),
                      Expanded(
                          flex: 2,
                          child: Text(r.gasLevel?.toStringAsFixed(0) ?? '—',
                              style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: _metricColor('gasLevel', r.gasLevel)),
                              textAlign: TextAlign.right)),
                    ]));
              }),
        ]));
  }
}

class _AuditTable extends StatelessWidget {
  final List rows;
  const _AuditTable({required this.rows});

  Color _actionColor(String action) {
    if (action.startsWith('auth.')) return const Color(0xFF2563EB);
    if (action.startsWith('alert.')) return AppColors.statusCritical;
    if (action.contains('role') || action.startsWith('user.')) return AppColors.statusWarning;
    if (action.startsWith('threshold.')) return const Color(0xFF7C3AED);
    return AppColors.mutedFg;
  }

  @override
  Widget build(BuildContext c) {
    if (rows.isEmpty) {
      return const EmptyState('Aucun journal d\'audit',
          icon: Icons.assignment_outlined);
    }
    final fmt = DateFormat('dd/MM/yyyy HH:mm:ss');
    return AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          // Header row
          Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                  color: AppColors.muted.withValues(alpha: 0.3),
                  border: const Border(
                      bottom: BorderSide(color: AppColors.border))),
              child: const Row(children: [
                Expanded(
                    flex: 3,
                    child: Text('DATE / HEURE',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5))),
                Expanded(
                    flex: 3,
                    child: Text('ACTEUR',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5))),
                Expanded(
                    flex: 3,
                    child: Text('ACTION',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5))),
                Expanded(
                    flex: 2,
                    child: Text('TYPE CIBLE',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5))),
                Expanded(
                    flex: 4,
                    child: Text('DÉTAILS',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 0.5))),
              ])),
          ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: rows.length,
              separatorBuilder: (_, __) =>
                  const Divider(height: 1, color: AppColors.border),
              itemBuilder: (_, i) {
                final r = rows[i] as Map<String, dynamic>;
                final action = r['action'] as String? ?? '';
                final actAt = r['createdAt'] ?? r['created_at'] ?? '';
                final dt = DateTime.tryParse(actAt.toString());
                final actor = r['actorId'];
                final actorName = actor is Map
                    ? ('${actor['firstName'] ?? ''} ${actor['lastName'] ?? ''}'.trim().isEmpty
                        ? actor['email'] ?? 'Système'
                        : '${actor['firstName'] ?? ''} ${actor['lastName'] ?? ''}'.trim())
                    : 'Système';
                final actorEmail =
                    actor is Map ? (actor['email'] as String? ?? '') : '';
                final label =
                    _kAuditActionLabels[action] ?? action;
                final actionCol = _actionColor(action);

                // Build details string from metadata or after fields
                String details = '—';
                final meta = r['metadata'];
                final after = r['after'];
                if (meta is Map && meta.isNotEmpty) {
                  details = meta.entries
                      .map((e) => '${e.key}: ${e.value}')
                      .join(' · ');
                } else if (after is Map && after.isNotEmpty) {
                  const showKeys = [
                    'role', 'email', 'phone', 'metricName',
                    'warningMax', 'status'
                  ];
                  final filtered = after.entries
                      .where((e) => showKeys.contains(e.key))
                      .map((e) => '${e.key}=${e.value}')
                      .join(' · ');
                  if (filtered.isNotEmpty) details = filtered;
                }

                return Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 9),
                    child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Expanded(
                              flex: 3,
                              child: Text(
                                  dt != null
                                      ? fmt.format(dt.toLocal())
                                      : '—',
                                  style: const TextStyle(
                                      fontSize: 10,
                                      color: AppColors.mutedFg,
                                      fontFamily: 'monospace'))),
                          Expanded(
                              flex: 3,
                              child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(actorName,
                                        style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600),
                                        overflow: TextOverflow.ellipsis),
                                    if (actorEmail.isNotEmpty &&
                                        actorEmail != actorName)
                                      Text(actorEmail,
                                          style: const TextStyle(
                                              fontSize: 9,
                                              color: AppColors.mutedFg),
                                          overflow: TextOverflow.ellipsis),
                                  ])),
                          Expanded(
                              flex: 3,
                              child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 3),
                                  decoration: BoxDecoration(
                                      color:
                                          actionCol.withValues(alpha: 0.08),
                                      border: Border.all(
                                          color: actionCol
                                              .withValues(alpha: 0.35)),
                                      borderRadius:
                                          BorderRadius.circular(4)),
                                  child: Text(label,
                                      style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: actionCol),
                                      overflow: TextOverflow.ellipsis))),
                          Expanded(
                              flex: 2,
                              child: Text(
                                  r['targetType']?.toString() ?? '—',
                                  style: const TextStyle(
                                      fontSize: 10,
                                      color: AppColors.mutedFg),
                                  overflow: TextOverflow.ellipsis)),
                          Expanded(
                              flex: 4,
                              child: Text(details,
                                  style: const TextStyle(
                                      fontSize: 10,
                                      color: AppColors.mutedFg),
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 2)),
                        ]));
              }),
        ]));
  }
}
