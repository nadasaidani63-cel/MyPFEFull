import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/app_state.dart';
import '../../services/api.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';

class ZoneDetailsScreen extends StatefulWidget {
  final String zoneId;
  final VoidCallback onBack;

  const ZoneDetailsScreen({
    super.key,
    required this.zoneId,
    required this.onBack,
  });

  @override
  State<ZoneDetailsScreen> createState() => _ZoneDetailsScreenState();
}

class _ZoneDetailsScreenState extends State<ZoneDetailsScreen> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void didUpdateWidget(covariant ZoneDetailsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.zoneId != widget.zoneId) {
      _future = _load();
    }
  }

  Future<Map<String, dynamic>> _load() async {
    final auth = context.read<AuthProvider>();
    final api = ApiService()..setToken(auth.token);
    final zone = await api.getZoneNodesLatest(widget.zoneId);
    final thresholds = await api.getThresholds(scopeType: 'zone', scopeId: widget.zoneId);
    return {
      'zone': zone,
      'thresholds': thresholds,
    };
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError || !snapshot.hasData) {
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                OutlinedButton.icon(onPressed: widget.onBack, icon: const Icon(Icons.arrow_back), label: const Text('Retour')),
                const SizedBox(height: 12),
                const Text('Erreur lors du chargement de la salle.', style: TextStyle(color: AppColors.statusCritical)),
              ],
            ),
          );
        }

        final payload = snapshot.data!;
        final zone = payload['zone'] as Map<String, dynamic>;
        final thresholdsRaw = payload['thresholds'] as Map<String, dynamic>;
        final thresholdItems = (thresholdsRaw['items'] as List<AlertThreshold>?) ?? const <AlertThreshold>[];
        final thresholdDefaults = (thresholdsRaw['defaults'] as Map?) ?? {};
        final nodes = (zone['nodes'] as List? ?? const []);
        final online = nodes.where((node) => (node as Map)['isOnline'] == true).length;

        _MetricThreshold thresholdFor(String metric) {
          final existing = thresholdItems.where((item) => item.metricName == metric).firstOrNull;
          final fallback = thresholdDefaults[metric] as Map<String, dynamic>?;
          return _MetricThreshold(
            warningMin: (existing?.warningMin ?? fallback?['warningMin'] ?? MetricMeta.warnMin[metric] ?? 0).toDouble(),
            warningMax: (existing?.warningMax ?? fallback?['warningMax'] ?? MetricMeta.warnMax[metric] ?? 0).toDouble(),
            alertMin: (existing?.alertMin ?? fallback?['alertMin'] ?? MetricMeta.alertMin[metric] ?? 0).toDouble(),
            alertMax: (existing?.alertMax ?? fallback?['alertMax'] ?? MetricMeta.alertMax[metric] ?? 0).toDouble(),
          );
        }

        return SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Salle', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                SizedBox(height: 2),
                Text('Visualisation des donnees des noeuds et seuils appliques.', style: TextStyle(fontSize: 12, color: AppColors.mutedFg)),
              ])),
              OutlinedButton.icon(onPressed: widget.onBack, icon: const Icon(Icons.arrow_back), label: const Text('Retour')),
            ]),
            const SizedBox(height: 16),
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${zone['room'] ?? zone['name'] ?? 'Salle'}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  [
                    if (zone['part'] != null) '${zone['part']}',
                    if (zone['roomPart'] != null) '${zone['roomPart']}',
                    if (zone['datacenterId'] is Map) '${zone['datacenterId']['name']}',
                  ].join(' · '),
                  style: const TextStyle(fontSize: 12, color: AppColors.mutedFg),
                ),
                const SizedBox(height: 12),
                Row(children: [
                  const Icon(Icons.memory_outlined, size: 15, color: AppColors.mutedFg),
                  const SizedBox(width: 6),
                  Text('${nodes.length} noeuds', style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
                  const SizedBox(width: 18),
                  Icon(online > 0 ? Icons.wifi : Icons.wifi_off, size: 15, color: AppColors.mutedFg),
                  const SizedBox(width: 6),
                  Text('$online/${nodes.length} en ligne', style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
                ]),
              ]),
            ),
            const SizedBox(height: 14),
            const Text('Seuils appliques a la salle', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: MetricMeta.orderedKeys.map((metric) {
                final thresholds = thresholdFor(metric);
                return SizedBox(
                  width: 220,
                  child: AppCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(MetricMeta.shortLabel[metric] ?? metric, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.mutedFg)),
                      const SizedBox(height: 2),
                      Text(MetricMeta.label[metric] ?? metric, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      _ThresholdChip(text: 'Warning ${thresholds.warningMin.toStringAsFixed(MetricMeta.fractionDigits(metric))}-${thresholds.warningMax.toStringAsFixed(MetricMeta.fractionDigits(metric))} ${MetricMeta.unit[metric] ?? ''}', color: AppColors.statusWarning),
                      const SizedBox(height: 6),
                      _ThresholdChip(text: 'Alert ${thresholds.alertMin.toStringAsFixed(MetricMeta.fractionDigits(metric))}-${thresholds.alertMax.toStringAsFixed(MetricMeta.fractionDigits(metric))} ${MetricMeta.unit[metric] ?? ''}', color: AppColors.statusCritical),
                    ]),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 18),
            const Text('Visualisation des donnees des noeuds', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            if (nodes.isEmpty)
              const EmptyState('Aucun noeud dans cette salle.', icon: Icons.memory_outlined)
            else
              ...nodes.map((raw) {
                final node = raw as Map<String, dynamic>;
                final latest = node['latestMetrics'] as Map<String, dynamic>?;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AppCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${node['name'] ?? 'Node'}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text('${node['macAddress'] ?? 'Aucune adresse MAC'}', style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
                        ])),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            border: Border.all(color: (node['isOnline'] == true ? AppColors.statusNormal : AppColors.mutedFg).withOpacity(0.35)),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(node['isOnline'] == true ? 'online' : 'offline', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: node['isOnline'] == true ? AppColors.statusNormal : AppColors.mutedFg)),
                        ),
                      ]),
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: MetricMeta.orderedKeys.map((metric) {
                          final thresholds = thresholdFor(metric);
                          final value = latest?[metric == 'gasLevel' ? 'gasLevel' : metric] as num?;
                          final status = MetricMeta.valueStatus(metric, value?.toDouble());
                          return SizedBox(
                            width: 210,
                            child: AppCard(
                              borderColor: status == 'alert' ? AppColors.statusCritical.withOpacity(0.25) : status == 'warning' ? AppColors.statusWarning.withOpacity(0.25) : AppColors.border,
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(MetricMeta.shortLabel[metric] ?? metric, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.mutedFg)),
                                const SizedBox(height: 2),
                                Text(MetricMeta.label[metric] ?? metric, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                                const SizedBox(height: 10),
                                Text('${MetricMeta.formatValue(metric, value?.toDouble())} ${MetricMeta.unit[metric] ?? ''}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                                const SizedBox(height: 10),
                                _ThresholdChip(text: 'Warning ${thresholds.warningMin.toStringAsFixed(MetricMeta.fractionDigits(metric))}-${thresholds.warningMax.toStringAsFixed(MetricMeta.fractionDigits(metric))} ${MetricMeta.unit[metric] ?? ''}', color: AppColors.statusWarning),
                                const SizedBox(height: 6),
                                _ThresholdChip(text: 'Alert ${thresholds.alertMin.toStringAsFixed(MetricMeta.fractionDigits(metric))}-${thresholds.alertMax.toStringAsFixed(MetricMeta.fractionDigits(metric))} ${MetricMeta.unit[metric] ?? ''}', color: AppColors.statusCritical),
                              ]),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Derniere lecture: ${latest?['recordedAt'] != null ? DateFormat('dd/MM/yyyy HH:mm:ss').format(DateTime.parse(latest!['recordedAt']).toLocal()) : 'Aucune donnee'}',
                        style: const TextStyle(fontSize: 11, color: AppColors.mutedFg),
                      ),
                    ]),
                  ),
                );
              }),
          ]),
        );
      },
    );
  }
}

class _MetricThreshold {
  final double warningMin;
  final double warningMax;
  final double alertMin;
  final double alertMax;
  const _MetricThreshold({
    required this.warningMin,
    required this.warningMax,
    required this.alertMin,
    required this.alertMax,
  });
}

class _ThresholdChip extends StatelessWidget {
  final String text;
  final Color color;
  const _ThresholdChip({required this.text, required this.color});
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          border: Border.all(color: color.withOpacity(0.2)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(text, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
      );
}
