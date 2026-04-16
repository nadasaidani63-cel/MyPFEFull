// lib/screens/alerts/alerts_screen.dart — mirrors Alerts.tsx exactly
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/app_state.dart';
import '../../models/models.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});
  @override State<AlertsScreen> createState() => _AlertsScreenState();
}
class _AlertsScreenState extends State<AlertsScreen> {
  String _sev = 'all', _st = 'all', _search = '';
  String _sortBy = 'recent'; // 'recent' | 'severity'
  @override void initState() { super.initState(); WidgetsBinding.instance.addPostFrameCallback((_) { final a = context.read<AppProvider>(); final d = context.read<DatacenterProvider>(); if (a.alerts.isEmpty) a.loadAlerts(d.connectedDC?.id); }); }

  List<AlertItem> _filter(List<AlertItem> all) {
    final filtered = all.where((a) {
      if (_sev != 'all' && a.severity != _sev) return false;
      if (_st != 'all' && a.status != _st) return false;
      if (_search.isNotEmpty) { final q = _search.toLowerCase(); if (!(a.message ?? '').toLowerCase().contains(q) && !(a.nodeName ?? '').toLowerCase().contains(q)) return false; }
      return true;
    }).toList();
    if (_sortBy == 'severity') {
      const order = {'critical': 0, 'warning': 1, 'info': 2};
      filtered.sort((a, b) => (order[a.severity] ?? 2).compareTo(order[b.severity] ?? 2));
    }
    return filtered;
  }

  @override Widget build(BuildContext context) {
    final app = context.watch<AppProvider>(); final auth = context.watch<AuthProvider>();
    final alerts = app.alerts; final filtered = _filter(alerts);
    final active = alerts.where((a) => a.isActive).length;
    final crit = alerts.where((a) => a.severity == 'critical' && a.isActive).length;
    final warn = alerts.where((a) => a.severity == 'warning' && a.isActive).length;

    return RefreshIndicator(color: AppColors.primary, onRefresh: () => app.loadAlerts(context.read<DatacenterProvider>().connectedDC?.id), child: SingleChildScrollView(
      padding: const EdgeInsets.all(20), physics: const AlwaysScrollableScrollPhysics(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Alertes', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
        const Text('Gestion des alertes et notifications en temps réel', style: TextStyle(fontSize: 12, color: AppColors.mutedFg)),
        const SizedBox(height: 16),
        // KPI row
        Row(children: [
          _KpiCard('$active', 'Alertes Actives', AppColors.foreground),
          const SizedBox(width: 10),
          _KpiCard('$crit', 'Critiques', AppColors.statusCritical),
          const SizedBox(width: 10),
          _KpiCard('$warn', 'Avertissements', AppColors.statusWarning),
          const SizedBox(width: 10),
          _KpiCard('${alerts.length}', 'Total', AppColors.foreground),
        ]),
        const SizedBox(height: 14),
        // Search + filters
        Row(children: [
          Expanded(child: TextField(onChanged: (v) => setState(() => _search = v), decoration: const InputDecoration(hintText: 'Rechercher alertes, nœuds...', prefixIcon: Icon(Icons.search, size: 18, color: AppColors.mutedFg)))),
          const SizedBox(width: 8),
          FilterSelect(value: _sev, values: const ['all','critical','warning','info'], labels: const ['Toutes','Critique','Avertissement','Info'], onChanged: (v) => setState(() => _sev = v!)),
          const SizedBox(width: 6),
          FilterSelect(value: _st, values: const ['all','active','acknowledged','resolved'], labels: const ['Tous','Actives','Acquittées','Résolues'], onChanged: (v) => setState(() => _st = v!)),
          const SizedBox(width: 6),
          OutlinedButton.icon(
            icon: const Icon(Icons.swap_vert, size: 14),
            label: Text(_sortBy == 'recent' ? 'Récent' : 'Sévérité', style: const TextStyle(fontSize: 12)),
            onPressed: () => setState(() => _sortBy = _sortBy == 'recent' ? 'severity' : 'recent'),
          ),
        ]),
        const SizedBox(height: 14),
        filtered.isEmpty
          ? const EmptyState('Aucune alerte correspondante', icon: Icons.notifications_off_outlined)
          : Column(children: filtered.map((a) => _AlertRow(alert: a, isAdmin: auth.isAdmin, app: app)).toList()),
      ]),
    ));
  }
}

class _KpiCard extends StatelessWidget {
  final String v, l; final Color c;
  const _KpiCard(this.v, this.l, this.c);
  @override Widget build(BuildContext ctx) => Expanded(child: AppCard(child: Column(children: [Text(v, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: c)), Text(l, style: const TextStyle(fontSize: 11, color: AppColors.mutedFg), textAlign: TextAlign.center)])));
}

class _AlertRow extends StatelessWidget {
  final AlertItem alert; final bool isAdmin; final AppProvider app;
  const _AlertRow({required this.alert, required this.isAdmin, required this.app});
  @override Widget build(BuildContext context) {
    final a = alert; final sc = AppColors.status(a.severity);
    final fmt = DateFormat('dd/MM/yyyy HH:mm:ss');
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(8), border: Border.all(color: a.isActive ? sc.withOpacity(0.3) : AppColors.border, width: a.isActive ? 1.5 : 1)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 2, right: 10), child: Icon(a.severity == 'critical' ? Icons.error : a.severity == 'warning' ? Icons.warning_amber_rounded : Icons.info_outline, color: sc, size: 18)),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [SeverityBadge(a.severity), const SizedBox(width: 8), Expanded(child: Text(a.message ?? '${a.metricName ?? 'Alerte'} hors seuil', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis))]),
          const SizedBox(height: 3),
          Text('${a.nodeName ?? '—'} / ${a.zoneName ?? '—'}', style: const TextStyle(fontSize: 10, color: AppColors.mutedFg)),
          const SizedBox(height: 2),
          Wrap(children: [
            if (a.metricName != null) ...[const Text('Paramètre: ', style: TextStyle(fontSize: 10, color: AppColors.mutedFg)), Text(a.metricName!, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600)), const SizedBox(width: 8)],
            if (a.metricValue != null) ...[const Text('Valeur: ', style: TextStyle(fontSize: 10, color: AppColors.mutedFg)), Text(a.metricValue!.toStringAsFixed(2), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: sc)), if (a.thresholdExceeded != null) Text(' (Seuil: ${a.thresholdExceeded!.toStringAsFixed(0)})', style: const TextStyle(fontSize: 10, color: AppColors.mutedFg)), const SizedBox(width: 8)],
            Text(fmt.format(a.createdAt.toLocal()), style: const TextStyle(fontSize: 9, color: AppColors.mutedFg)),
          ]),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          _StatusChip(a.status), const SizedBox(height: 6),
          if (a.isActive) _ABtn('Acquitter', AppColors.statusWarning, () => app.acknowledgeAlert(a.id)),
          if (isAdmin && (a.isActive || a.status == 'acknowledged')) ...[const SizedBox(height: 4), _ABtn('Résoudre', AppColors.statusNormal, () => app.resolveAlert(a.id))],
        ]),
      ]),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String s; const _StatusChip(this.s);
  @override Widget build(BuildContext c) {
    Color col; String l;
    switch (s) { case 'active': col = AppColors.statusCritical; l = 'Active'; break; case 'acknowledged': col = AppColors.statusWarning; l = 'Acquittée'; break; default: col = AppColors.statusNormal; l = 'Résolue'; }
    return Container(padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3), decoration: BoxDecoration(color: col.withOpacity(0.1), border: Border.all(color: col.withOpacity(0.4)), borderRadius: BorderRadius.circular(4)), child: Text(l, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: col)));
  }
}

class _ABtn extends StatelessWidget {
  final String l; final Color c; final VoidCallback t;
  const _ABtn(this.l, this.c, this.t);
  @override Widget build(BuildContext ctx) => GestureDetector(onTap: t, child: Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: c.withOpacity(0.08), border: Border.all(color: c.withOpacity(0.4)), borderRadius: BorderRadius.circular(4)), child: Text(l, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c))));
}
