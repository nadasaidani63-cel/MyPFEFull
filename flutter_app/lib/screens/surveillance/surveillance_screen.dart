import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/app_state.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';

class SurveillanceScreen extends StatefulWidget {
  const SurveillanceScreen({super.key});

  @override
  State<SurveillanceScreen> createState() => _SurveillanceScreenState();
}

class _SurveillanceScreenState extends State<SurveillanceScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  void _load() {
    final app = context.read<AppProvider>();
    final dc = context.read<DatacenterProvider>().connectedDC;
    if (dc == null) return;
    app.loadLatestReadings(dc.id);
    app.loadHistory(dc.id, limit: 320);
    app.loadAlerts(dc.id);
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppProvider>();
    final dc = context.watch<DatacenterProvider>().connectedDC;

    if (dc == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.wifi_off, size: 48, color: AppColors.mutedFg),
              SizedBox(height: 16),
              Text('Connectez-vous à un datacenter', style: TextStyle(color: AppColors.mutedFg, fontSize: 14)),
            ],
          ),
        ),
      );
    }

    final history = app.history;
    final latest = app.latestReadings;
    final activeAlerts = app.alerts.where((a) => a.isActive).toList();
    final onlineNodes = latest.length;
    final metrics = [
      const _MetricCfg('temperature', 'Température', '°C', AppColors.chartRed),
      const _MetricCfg('humidity', 'Humidité', '%', AppColors.chartAmber),
      const _MetricCfg('pressure', 'Gaz CO2', 'ppm', AppColors.chartBlue),
      const _MetricCfg('vibration', 'Vibration', 'mm/s', AppColors.chartOrange),
      const _MetricCfg('gasLevel', 'Fumee', 'ppm', AppColors.chartGreen),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final isPhone = constraints.maxWidth < 700;
        final isTablet = constraints.maxWidth < 1200;
        final chartCols = isPhone ? 1 : isTablet ? 2 : 2;

        return SingleChildScrollView(
          padding: EdgeInsets.all(isPhone ? 14 : 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Tableau de bord', style: TextStyle(fontSize: isPhone ? 18 : 20, fontWeight: FontWeight.w800)),
              Text('Vue temps réel des métriques — ${dc.name}', style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
              const SizedBox(height: 16),
              if (activeAlerts.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.statusCritical.withOpacity(0.05),
                    border: Border.all(color: AppColors.statusCritical.withOpacity(0.25)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    children: activeAlerts.take(4).map((alert) {
                      final color = AppColors.status(alert.severity);
                      return Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.warning_amber_rounded, size: 14, color: color),
                          const SizedBox(width: 5),
                          ConstrainedBox(
                            constraints: BoxConstraints(maxWidth: isPhone ? constraints.maxWidth - 100 : 260),
                            child: Text(
                              alert.message ?? alert.metricName ?? 'Alerte active',
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 11, color: color),
                            ),
                          ),
                        ],
                      );
                    }).toList(),
                  ),
                ),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: isPhone ? 1 : 3,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: isPhone ? 2.1 : 2.6,
                children: [
                  _StatCard(label: 'Nodes', value: '$onlineNodes', sub: '/ $onlineNodes en ligne'),
                  _StatCard(label: 'Alertes actives', value: '${app.activeCount}', sub: '${app.warningCount} warning / ${app.criticalCount} critique'),
                  _StatCard(label: 'Datacenter', value: dc.name, sub: dc.location ?? '', valueSize: 13),
                ],
              ),
              const SizedBox(height: 18),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: chartCols,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: isPhone ? 1.38 : 1.55,
                ),
                itemCount: metrics.length,
                itemBuilder: (_, index) {
                  final metric = metrics[index];
                  final data = _buildSeries(history, metric.key, maxPoints: 24);
                  final current = _average(latest.map((row) => row.get(metric.key)).whereType<double>().toList());
                  final state = MetricMeta.valueStatus(metric.key, current);
                  return _FixedMetricChartCard(metric: metric, series: data, currentValue: current, state: state);
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MetricCfg {
  final String key;
  final String label;
  final String unit;
  final Color color;
  const _MetricCfg(this.key, this.label, this.unit, this.color);
}

List<_ChartPoint> _buildSeries(List<dynamic> history, String key, {int maxPoints = 24}) {
  if (history.isEmpty) return const [];
  final rows = history
      .map((row) => _ChartPointCandidate(
            time: row.recordedAt as DateTime,
            value: (row.get(key) as double?),
          ))
      .where((row) => row.value != null)
      .toList();
  if (rows.isEmpty) return const [];
  if (rows.length <= maxPoints) {
    return rows
        .map((row) => _ChartPoint(
              label: '${row.time.hour.toString().padLeft(2, '0')}:${row.time.minute.toString().padLeft(2, '0')}',
              value: row.value!,
            ))
        .toList();
  }

  final bucketSize = (rows.length / maxPoints).ceil();
  final points = <_ChartPoint>[];
  for (int i = 0; i < rows.length; i += bucketSize) {
    final chunk = rows.sublist(i, (i + bucketSize).clamp(0, rows.length));
    final avg = _average(chunk.map((e) => e.value!).toList());
    final middle = chunk[chunk.length ~/ 2].time;
    points.add(_ChartPoint(
      label: '${middle.hour.toString().padLeft(2, '0')}:${middle.minute.toString().padLeft(2, '0')}',
      value: avg ?? 0,
    ));
  }
  return points;
}

double? _average(List<double> values) {
  if (values.isEmpty) return null;
  return values.reduce((a, b) => a + b) / values.length;
}

class _ChartPointCandidate {
  final DateTime time;
  final double? value;
  const _ChartPointCandidate({required this.time, required this.value});
}

class _ChartPoint {
  final String label;
  final double value;
  const _ChartPoint({required this.label, required this.value});
}

class _FixedMetricChartCard extends StatelessWidget {
  final _MetricCfg metric;
  final List<_ChartPoint> series;
  final double? currentValue;
  final String state;
  const _FixedMetricChartCard({required this.metric, required this.series, required this.currentValue, required this.state});

  @override
  Widget build(BuildContext context) {
    final stateColor = state == 'alert' ? AppColors.statusCritical : state == 'warning' ? AppColors.statusWarning : AppColors.statusNormal;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: 12,
            runSpacing: 6,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${metric.label} temps réel', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        currentValue == null ? '—' : currentValue!.toStringAsFixed(metric.key == 'pressure' ? 0 : 2),
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: metric.color),
                      ),
                      const SizedBox(width: 4),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 3),
                        child: Text(metric.unit, style: const TextStyle(fontSize: 11, color: AppColors.mutedFg)),
                      ),
                    ],
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: stateColor.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: stateColor.withOpacity(0.24)),
                ),
                child: Text(
                  state == 'alert' ? 'Critique' : state == 'warning' ? 'Avert.' : 'Normal',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: stateColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 170,
            child: series.length < 2
                ? const Center(child: Text('Chargement...', style: TextStyle(fontSize: 11, color: AppColors.mutedFg)))
                : _MetricChart(metric: metric, series: series),
          ),
        ],
      ),
    );
  }
}

class _MetricChart extends StatelessWidget {
  final _MetricCfg metric;
  final List<_ChartPoint> series;
  const _MetricChart({required this.metric, required this.series});

  @override
  Widget build(BuildContext context) {
    final spots = <FlSpot>[];
    double minY = double.infinity;
    double maxY = -double.infinity;
    for (int i = 0; i < series.length; i++) {
      final value = series[i].value;
      spots.add(FlSpot(i.toDouble(), value));
      minY = value < minY ? value : minY;
      maxY = value > maxY ? value : maxY;
    }
    final pad = ((maxY - minY).abs() * 0.14).clamp(1, 40).toDouble();

    return LineChart(
      LineChartData(
        minY: minY - pad,
        maxY: maxY + pad,
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => const FlLine(color: AppColors.border, strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 34,
              interval: (maxY - minY) / 4,
              getTitlesWidget: (value, _) => Text(value.toStringAsFixed(metric.key == 'pressure' ? 0 : 1), style: const TextStyle(fontSize: 9, color: AppColors.mutedFg)),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 18,
              interval: (series.length / 4).clamp(1, 6).toDouble(),
              getTitlesWidget: (value, _) {
                final index = value.toInt();
                if (index < 0 || index >= series.length) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(series[index].label, style: const TextStyle(fontSize: 8.5, color: AppColors.mutedFg)),
                );
              },
            ),
          ),
        ),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            color: metric.color,
            barWidth: 2.1,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(show: true, color: metric.color.withOpacity(0.08)),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  final double valueSize;
  const _StatCard({required this.label, required this.value, required this.sub, this.valueSize = 22});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.mutedFg)),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: valueSize, fontWeight: FontWeight.w800), overflow: TextOverflow.ellipsis),
          if (sub.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(sub, style: const TextStyle(fontSize: 10, color: AppColors.mutedFg), overflow: TextOverflow.ellipsis),
          ],
        ],
      ),
    );
  }
}
