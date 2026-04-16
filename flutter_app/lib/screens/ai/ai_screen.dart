import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/app_state.dart';
import '../../utils/export_file.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';

class AIAssistantScreen extends StatefulWidget {
  const AIAssistantScreen({super.key});

  @override
  State<AIAssistantScreen> createState() => _AIAssistantScreenState();
}

class _AIAssistantScreenState extends State<AIAssistantScreen> {
  final _chatCtrl = TextEditingController();
  final _chatScroll = ScrollController();
  final FocusNode _chatFocus = FocusNode();
  final List<_ChatMsg> _messages = [
    const _ChatMsg(false, "Bonjour ! Je suis l'assistant IA du système de monitoring. Je peux analyser les tendances, classer les risques et vous aider à comprendre les alertes."),
  ];

  bool _chatLoading = false;
  bool _chatOpen = false;
  String _selectedMetric = 'temperature';
  String? _dcId;
  Future<Map<String, dynamic>>? _future;
  Map<String, dynamic>? _lastInsights;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final dcId = context.watch<DatacenterProvider>().connectedDC?.id;
    if (dcId != _dcId) {
      _dcId = dcId;
      _selectedMetric = 'temperature';
      _future = dcId == null ? null : context.read<AppProvider>().getAiInsights(dcId);
    }
  }

  @override
  void dispose() {
    _chatCtrl.dispose();
    _chatScroll.dispose();
    _chatFocus.dispose();
    super.dispose();
  }

  void _refresh() {
    if (_dcId == null) return;
    setState(() {
      _future = context.read<AppProvider>().getAiInsights(_dcId!);
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScroll.hasClients) {
        _chatScroll.animateTo(
          _chatScroll.position.maxScrollExtent + 120,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _toggleChat() {
    setState(() => _chatOpen = !_chatOpen);
    if (_chatOpen) {
      FocusScope.of(context).requestFocus(_chatFocus);
      _scrollToBottom();
    }
  }

  void _sendMsg() {
    final text = _chatCtrl.text.trim();
    if (text.isEmpty) return;

    final summary = (_lastInsights?['summary'] as String?) ??
        'Le système reste sous surveillance. Consultez les cartes de classification et les recommandations.';

    setState(() {
      _chatOpen = true;
      _messages.add(_ChatMsg(true, text));
      _chatLoading = true;
      _chatCtrl.clear();
    });
    _scrollToBottom();

    Future.delayed(const Duration(milliseconds: 700), () {
      if (!mounted) return;
      setState(() {
        _messages.add(_ChatMsg(false, 'Analyse IA: $summary'));
        _chatLoading = false;
      });
      _scrollToBottom();
    });
  }

  Future<void> _exportInsights(Map<String, dynamic> data) async {
    final metrics = (data['metrics'] as List? ?? []).cast<Map<String, dynamic>>();
    final anomalies = (data['anomalies'] as List? ?? []).cast<Map<String, dynamic>>();
    final recommendations = (data['recommendations'] as List? ?? []).cast<Map<String, dynamic>>();

    final sb = StringBuffer();
    sb.writeln('Assistant IA - Insights');
    sb.writeln('Date export: ${DateTime.now().toIso8601String()}');
    sb.writeln('Etat global: ${data['globalLabel'] ?? '—'}');
    sb.writeln('Résumé: ${data['summary'] ?? '—'}');
    sb.writeln('');

    if (metrics.isNotEmpty) {
      sb.writeln('Classifications');
      for (final metric in metrics) {
        sb.writeln(
          '- ${metric['label']}: ${metric['stateLabel']} '
          '(actuel: ${metric['currentValue'] ?? '—'} ${metric['unit'] ?? ''}, '
          'prévu: ${metric['predictedValue'] ?? '—'} ${metric['unit'] ?? ''}, '
          'risque: ${metric['riskScore'] ?? 0}%)',
        );
      }
      sb.writeln('');
    }

    if (anomalies.isNotEmpty) {
      sb.writeln('Anomalies');
      for (final anomaly in anomalies) {
        sb.writeln('- ${anomaly['title']} — ${anomaly['detail']} (${anomaly['source']})');
      }
      sb.writeln('');
    }

    if (recommendations.isNotEmpty) {
      sb.writeln('Recommandations');
      for (final rec in recommendations) {
        sb.writeln('- ${rec['title']}');
      }
    }

    final filename = 'assistant_ia_${DateTime.now().toIso8601String().substring(0, 10)}.txt';
    await saveTextFile(filename: filename, text: sb.toString());
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Export enregistré: $filename')),
    );
  }

  @override
  Widget build(BuildContext context) {
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

    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        final isPhone = MediaQuery.sizeOf(context).width < 900;

        if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 42, color: AppColors.statusCritical),
                  const SizedBox(height: 12),
                  Text(snapshot.error.toString(), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.mutedFg)),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(onPressed: _refresh, icon: const Icon(Icons.refresh), label: const Text('Réessayer')),
                ],
              ),
            ),
          );
        }

        final data = snapshot.data ?? const <String, dynamic>{};
        _lastInsights = data;

        final metrics = (data['metrics'] as List? ?? []).cast<Map<String, dynamic>>();
        final anomalies = (data['anomalies'] as List? ?? []).cast<Map<String, dynamic>>();
        final recommendations = (data['recommendations'] as List? ?? []).cast<Map<String, dynamic>>();
        final metric = metrics.firstWhere(
          (item) => item['key'] == _selectedMetric,
          orElse: () => metrics.isNotEmpty ? metrics.first : <String, dynamic>{},
        );

        if (metric.isNotEmpty) {
          _selectedMetric = (metric['key'] ?? 'temperature') as String;
        }

        final globalState = (data['globalState'] ?? 'stable') as String;
        final globalLabel = (data['globalLabel'] ?? 'Stable') as String;
        final globalColor = _stateColor(globalState);
        final nodeHealth = (data['nodeHealth'] as Map<String, dynamic>? ?? const {});

        return LayoutBuilder(
          builder: (context, constraints) {
            final stacked = constraints.maxWidth < 1180;
            return Stack(
              children: [
                RefreshIndicator(
                  onRefresh: () async => _refresh(),
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: EdgeInsets.all(isPhone ? 14 : 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Assistant IA', style: TextStyle(fontSize: isPhone ? 20 : 22, fontWeight: FontWeight.w800)),
                                  const Text('Classification multi-métriques et analyse prédictive', style: TextStyle(fontSize: 12, color: AppColors.mutedFg)),
                                ],
                              ),
                            ),
                            IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh), tooltip: 'Actualiser'),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Container(
                          padding: EdgeInsets.all(isPhone ? 16 : 20),
                          decoration: BoxDecoration(
                            color: globalColor.withOpacity(0.07),
                            border: Border.all(color: globalColor.withOpacity(0.28)),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Wrap(
                                spacing: 16,
                                runSpacing: 12,
                                crossAxisAlignment: WrapCrossAlignment.start,
                                children: [
                                  Container(
                                    width: 60,
                                    height: 60,
                                    decoration: BoxDecoration(
                                      color: globalColor.withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                    child: Icon(
                                      globalState == 'maintenance' ? Icons.build_circle_outlined : Icons.psychology,
                                      color: globalColor,
                                      size: 30,
                                    ),
                                  ),
                                  ConstrainedBox(
                                    constraints: BoxConstraints(maxWidth: isPhone ? constraints.maxWidth - 80 : 820),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Wrap(
                                          spacing: 10,
                                          runSpacing: 8,
                                          children: [
                                            const Text('État du système :', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                              decoration: BoxDecoration(
                                                borderRadius: BorderRadius.circular(999),
                                                border: Border.all(color: globalColor.withOpacity(0.35)),
                                                color: globalColor.withOpacity(0.08),
                                              ),
                                              child: Text(globalLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: globalColor)),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 8),
                                        Text((data['summary'] ?? 'Aucun résumé disponible.').toString(), style: const TextStyle(fontSize: 12.5, color: AppColors.mutedFg)),
                                        const SizedBox(height: 10),
                                        Wrap(
                                          spacing: 16,
                                          runSpacing: 8,
                                          children: [
                                            _MiniInfo(icon: Icons.trending_up, text: '${metrics.length} métriques classées'),
                                            _MiniInfo(icon: Icons.warning_amber_rounded, text: '${anomalies.length} anomalies'),
                                            _MiniInfo(icon: Icons.flash_on, text: '${recommendations.length} recommandations'),
                                            _MiniInfo(icon: Icons.wifi_tethering, text: '${nodeHealth['online'] ?? 0}/${nodeHealth['total'] ?? 0} nœuds en ligne'),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 18),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: metrics
                              .map((item) => _MetricChip(
                                    label: (item['label'] ?? '').toString(),
                                    selected: item['key'] == _selectedMetric,
                                    color: MetricMeta.chartColor((item['key'] ?? 'temperature').toString()),
                                    onTap: () => setState(() => _selectedMetric = (item['key'] ?? 'temperature').toString()),
                                  ))
                              .toList(),
                        ),
                        const SizedBox(height: 16),
                        if (stacked) ...[
                          _MainAiColumn(
                            metric: metric,
                            metrics: metrics,
                            anomalies: anomalies,
                            onExport: () => _exportInsights(data),
                          ),
                          const SizedBox(height: 16),
                          _RecommendationsColumn(recommendations: recommendations),
                        ] else
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: _MainAiColumn(
                                  metric: metric,
                                  metrics: metrics,
                                  anomalies: anomalies,
                                  onExport: () => _exportInsights(data),
                                ),
                              ),
                              const SizedBox(width: 20),
                              SizedBox(width: 350, child: _RecommendationsColumn(recommendations: recommendations)),
                            ],
                          ),
                        const SizedBox(height: 100),
                      ],
                    ),
                  ),
                ),
                if (_chatOpen)
                  Positioned(
                    right: isPhone ? 12 : 24,
                    left: isPhone ? 12 : null,
                    bottom: 86,
                    child: _ChatPanel(
                      mobile: isPhone,
                      messages: _messages,
                      loading: _chatLoading,
                      controller: _chatCtrl,
                      focusNode: _chatFocus,
                      scrollController: _chatScroll,
                      onClose: _toggleChat,
                      onSend: _sendMsg,
                    ),
                  ),
                Positioned(
                  right: 18,
                  bottom: 18,
                  child: _ChatFab(open: _chatOpen, loading: _chatLoading, onTap: _toggleChat),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

Color _stateColor(String state) {
  switch (state) {
    case 'watch':
      return const Color(0xFFFB923C);
    case 'alert':
      return AppColors.statusWarning;
    case 'critical':
      return AppColors.statusCritical;
    case 'maintenance':
      return const Color(0xFF6366F1);
    default:
      return AppColors.statusNormal;
  }
}

IconData _stateIcon(String state) {
  switch (state) {
    case 'maintenance':
      return Icons.build_circle_outlined;
    case 'critical':
      return Icons.error_outline;
    case 'alert':
      return Icons.warning_amber_rounded;
    case 'watch':
      return Icons.visibility_outlined;
    default:
      return Icons.task_alt;
  }
}

class _MiniInfo extends StatelessWidget {
  final IconData icon;
  final String text;
  const _MiniInfo({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: AppColors.mutedFg),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(fontSize: 11, color: AppColors.mutedFg)),
      ],
    );
  }
}

class _MetricChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;
  const _MetricChip({required this.label, required this.selected, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: selected ? color : AppColors.border),
          color: selected ? color.withOpacity(0.1) : AppColors.card,
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: selected ? color : AppColors.foreground),
        ),
      ),
    );
  }
}

class _MainAiColumn extends StatelessWidget {
  final Map<String, dynamic> metric;
  final List<Map<String, dynamic>> metrics;
  final List<Map<String, dynamic>> anomalies;
  final VoidCallback onExport;

  const _MainAiColumn({required this.metric, required this.metrics, required this.anomalies, required this.onExport});

  @override
  Widget build(BuildContext context) {
    final orderedMetrics = [...metrics]..sort((a, b) => (b['riskScore'] ?? 0).compareTo(a['riskScore'] ?? 0));
    return Column(
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.auto_graph, size: 16, color: AppColors.statusWarning),
                  SizedBox(width: 8),
                  Expanded(child: Text('Classification & analyse de risque', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700))),
                ],
              ),
              const SizedBox(height: 12),
              if (orderedMetrics.isEmpty)
                const EmptyState('Aucune classification disponible', icon: Icons.analytics_outlined)
              else
                ...orderedMetrics.map((item) => _MetricClassificationCard(metric: item)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.show_chart, size: 16, color: AppColors.foreground),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Projection ${metric['label'] ?? 'métrique'}',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  TextButton.icon(
                    onPressed: onExport,
                    icon: const Icon(Icons.download_outlined, size: 14),
                    label: const Text('Exporter', style: TextStyle(fontSize: 11)),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(height: 280, child: _PredictionChart(metric: metric)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.shield_outlined, size: 16, color: AppColors.primary),
                  SizedBox(width: 8),
                  Expanded(child: Text('Détection d\'anomalies', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700))),
                ],
              ),
              const SizedBox(height: 12),
              if (anomalies.isEmpty)
                const EmptyState('Aucune anomalie active', icon: Icons.task_alt)
              else
                ...anomalies.map((item) => _AnomalyCard(anomaly: item)),
            ],
          ),
        ),
      ],
    );
  }
}

class _MetricClassificationCard extends StatelessWidget {
  final Map<String, dynamic> metric;
  const _MetricClassificationCard({required this.metric});

  @override
  Widget build(BuildContext context) {
    final state = (metric['state'] ?? 'stable').toString();
    final color = _stateColor(state);
    final label = (metric['stateLabel'] ?? 'Stable').toString();
    final unit = (metric['unit'] ?? '').toString();
    final current = metric['currentValue'];
    final predicted = metric['predictedValue'];
    final trend = (metric['trendLabel'] ?? 'Stable').toString();
    final recommendation = (metric['recommendation'] ?? '').toString();
    final risk = (metric['riskScore'] ?? 0).toString();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.06),
        border: Border.all(color: color.withOpacity(0.22)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Icon(_stateIcon(state), color: color, size: 18),
              Text((metric['label'] ?? '').toString(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: color.withOpacity(0.35)),
                  color: color.withOpacity(0.08),
                ),
                child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: AppColors.border),
                ),
                child: Text('$risk% risque', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Actuel: ${current ?? '—'} $unit   •   Prévu: ${predicted ?? '—'} $unit   •   Tendance: $trend',
            style: const TextStyle(fontSize: 12, color: AppColors.mutedFg),
          ),
          const SizedBox(height: 6),
          Text(recommendation, style: const TextStyle(fontSize: 12, color: AppColors.foreground)),
        ],
      ),
    );
  }
}

class _PredictionChart extends StatelessWidget {
  final Map<String, dynamic> metric;
  const _PredictionChart({required this.metric});

  @override
  Widget build(BuildContext context) {
    final metricKey = (metric['key'] ?? 'temperature').toString();
    final color = MetricMeta.chartColor(metricKey);
    final series = (metric['series'] as List? ?? []).cast<Map<String, dynamic>>();
    if (series.length < 2) {
      return const Center(child: Text('Données insuffisantes', style: TextStyle(color: AppColors.mutedFg, fontSize: 12)));
    }

    final actualSpots = <FlSpot>[];
    final predSpots = <FlSpot>[];
    double minY = double.infinity;
    double maxY = -double.infinity;

    for (int i = 0; i < series.length; i++) {
      final actual = (series[i]['actual'] as num?)?.toDouble();
      final predicted = (series[i]['predicted'] as num?)?.toDouble();
      if (actual != null) {
        actualSpots.add(FlSpot(i.toDouble(), actual));
        minY = actual < minY ? actual : minY;
        maxY = actual > maxY ? actual : maxY;
      }
      if (predicted != null) {
        predSpots.add(FlSpot(i.toDouble(), predicted));
        minY = predicted < minY ? predicted : minY;
        maxY = predicted > maxY ? predicted : maxY;
      }
    }

    final warningMin = (series.first['warningMin'] as num?)?.toDouble();
    final warningMax = (series.first['warningMax'] as num?)?.toDouble();
    final alertMin = (series.first['alertMin'] as num?)?.toDouble();
    final alertMax = (series.first['alertMax'] as num?)?.toDouble();
    if (warningMin != null) {
      minY = minY == double.infinity ? warningMin : (warningMin < minY ? warningMin : minY);
      maxY = warningMin > maxY ? warningMin : maxY;
    }
    if (warningMax != null) {
      minY = minY == double.infinity ? warningMax : (warningMax < minY ? warningMax : minY);
      maxY = warningMax > maxY ? warningMax : maxY;
    }
    if (alertMin != null) {
      minY = minY == double.infinity ? alertMin : (alertMin < minY ? alertMin : minY);
      maxY = alertMin > maxY ? alertMin : maxY;
    }
    if (alertMax != null) {
      minY = minY == double.infinity ? alertMax : (alertMax < minY ? alertMax : minY);
      maxY = alertMax > maxY ? alertMax : maxY;
    }

    final padding = ((maxY - minY).abs() * 0.12).clamp(1, 40).toDouble();
    minY = (minY == double.infinity ? 0 : minY) - padding;
    maxY = (maxY == -double.infinity ? 1 : maxY) + padding;

    return LineChart(
      LineChartData(
        minY: minY,
        maxY: maxY,
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
              getTitlesWidget: (value, _) => Text(value.toStringAsFixed(metricKey == 'pressure' ? 0 : 1), style: const TextStyle(fontSize: 10, color: AppColors.mutedFg)),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 22,
              interval: (series.length / 4).clamp(1, 6).toDouble(),
              getTitlesWidget: (value, _) {
                final index = value.toInt();
                if (index < 0 || index >= series.length) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text((series[index]['label'] ?? '').toString(), style: const TextStyle(fontSize: 9, color: AppColors.mutedFg)),
                );
              },
            ),
          ),
        ),
        extraLinesData: ExtraLinesData(
          horizontalLines: [
            if (warningMin != null) HorizontalLine(y: warningMin, color: AppColors.statusWarning.withOpacity(0.7), strokeWidth: 1, dashArray: [5, 5]),
            if (warningMax != null) HorizontalLine(y: warningMax, color: AppColors.statusWarning.withOpacity(0.7), strokeWidth: 1, dashArray: [5, 5]),
            if (alertMin != null) HorizontalLine(y: alertMin, color: AppColors.statusCritical.withOpacity(0.8), strokeWidth: 1, dashArray: [7, 4]),
            if (alertMax != null) HorizontalLine(y: alertMax, color: AppColors.statusCritical.withOpacity(0.8), strokeWidth: 1, dashArray: [7, 4]),
          ],
        ),
        lineBarsData: [
          LineChartBarData(
            spots: actualSpots,
            isCurved: true,
            color: color,
            barWidth: 2.6,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(show: true, color: color.withOpacity(0.08)),
          ),
          LineChartBarData(
            spots: predSpots,
            isCurved: true,
            color: _stateColor((metric['state'] ?? 'watch').toString()),
            barWidth: 2.4,
            dashArray: [6, 4],
            dotData: const FlDotData(show: false),
          ),
        ],
      ),
    );
  }
}

class _AnomalyCard extends StatelessWidget {
  final Map<String, dynamic> anomaly;
  const _AnomalyCard({required this.anomaly});

  @override
  Widget build(BuildContext context) {
    final severity = (anomaly['severity'] ?? 'warning').toString();
    final color = severity == 'critical' ? AppColors.statusCritical : AppColors.statusWarning;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.05),
        border: Border.all(color: color.withOpacity(0.18)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text((anomaly['title'] ?? '').toString(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 5),
          Text((anomaly['detail'] ?? '').toString(), style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
          const SizedBox(height: 8),
          Text('${anomaly['source'] ?? 'Système'} • ${anomaly['time'] ?? ''}', style: const TextStyle(fontSize: 11, color: AppColors.mutedFg)),
        ],
      ),
    );
  }
}

class _RecommendationsColumn extends StatelessWidget {
  final List<Map<String, dynamic>> recommendations;
  const _RecommendationsColumn({required this.recommendations});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.bolt_outlined, size: 16, color: AppColors.primary),
              SizedBox(width: 8),
              Expanded(child: Text('Recommandations IA', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700))),
            ],
          ),
          const SizedBox(height: 12),
          ...recommendations.map((item) => _RecommendationCard(rec: item)),
        ],
      ),
    );
  }
}

class _RecommendationCard extends StatelessWidget {
  final Map<String, dynamic> rec;
  const _RecommendationCard({required this.rec});

  @override
  Widget build(BuildContext context) {
    final priority = (rec['priority'] ?? 'normal').toString();
    Color color;
    switch (priority) {
      case 'urgent':
        color = AppColors.statusCritical;
        break;
      case 'important':
        color = AppColors.statusWarning;
        break;
      default:
        color = AppColors.mutedFg;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              border: Border.all(color: color.withOpacity(0.35)),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              priority == 'urgent' ? 'Urgent' : priority == 'important' ? 'Important' : 'Info',
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color),
            ),
          ),
          const SizedBox(height: 10),
          Text((rec['title'] ?? '').toString(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text((rec['detail'] ?? '').toString(), style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
          const SizedBox(height: 8),
          Text((rec['target'] ?? '').toString(), style: const TextStyle(fontSize: 11, color: AppColors.mutedFg)),
        ],
      ),
    );
  }
}

class _ChatPanel extends StatelessWidget {
  final bool mobile;
  final List<_ChatMsg> messages;
  final bool loading;
  final TextEditingController controller;
  final FocusNode focusNode;
  final ScrollController scrollController;
  final VoidCallback onClose;
  final VoidCallback onSend;

  const _ChatPanel({
    required this.mobile,
    required this.messages,
    required this.loading,
    required this.controller,
    required this.focusNode,
    required this.scrollController,
    required this.onClose,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    final width = mobile ? MediaQuery.sizeOf(context).width - 24 : 380.0;
    final height = mobile ? 430.0 : 500.0;

    return Material(
      color: Colors.transparent,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: AppColors.card,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 18, offset: Offset(0, 8))],
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 10, 12),
              child: Row(
                children: [
                  const Expanded(child: Text('Messages', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                  IconButton(onPressed: onClose, icon: const Icon(Icons.close)),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: messages.length > 1 || loading
                  ? ListView.builder(
                      controller: scrollController,
                      padding: const EdgeInsets.all(14),
                      itemCount: messages.length + (loading ? 1 : 0),
                      itemBuilder: (_, index) {
                        if (loading && index == messages.length) {
                          return const Padding(
                            padding: EdgeInsets.only(top: 8),
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: _Bubble(ai: true, text: 'Analyse en cours...'),
                            ),
                          );
                        }
                        final msg = messages[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Align(
                            alignment: msg.user ? Alignment.centerRight : Alignment.centerLeft,
                            child: _Bubble(ai: !msg.user, text: msg.text),
                          ),
                        );
                      },
                    )
                  : const Center(child: Text('Aucun message pour le moment', style: TextStyle(color: AppColors.mutedFg))),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: controller,
                      focusNode: focusNode,
                      onSubmitted: (_) => onSend(),
                      decoration: const InputDecoration(hintText: 'Poser une question...'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(onPressed: onSend, child: const Icon(Icons.send, size: 18)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final bool ai;
  final String text;
  const _Bubble({required this.ai, required this.text});

  @override
  Widget build(BuildContext context) {
    final bg = ai ? AppColors.muted : AppColors.primary;
    final fg = ai ? AppColors.foreground : Colors.white;
    return Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.68),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(text, style: TextStyle(fontSize: 12, color: fg, height: 1.35)),
    );
  }
}

class _ChatFab extends StatelessWidget {
  final bool open;
  final bool loading;
  final VoidCallback onTap;
  const _ChatFab({required this.open, required this.loading, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      onPressed: onTap,
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
      child: loading ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : Icon(open ? Icons.close : Icons.chat_bubble_outline),
    );
  }
}

class _ChatMsg {
  final bool user;
  final String text;
  const _ChatMsg(this.user, this.text);
}
