import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/app_state.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';
import 'zone_details_screen.dart';

class InfoScreen extends StatefulWidget {
  final String? selectedZoneId;
  final ValueChanged<String>? onZoneOpen;
  final VoidCallback? onZoneClose;

  const InfoScreen({
    super.key,
    this.selectedZoneId,
    this.onZoneOpen,
    this.onZoneClose,
  });

  @override
  State<InfoScreen> createState() => _InfoScreenState();
}

class _InfoScreenState extends State<InfoScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final a = context.read<AppProvider>();
      final d = context.read<DatacenterProvider>();
      if (d.connectedDC != null) {
        if (a.zones.isEmpty) await a.loadZones(d.connectedDC!.id);
        await a.loadLatestReadings(d.connectedDC!.id);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppProvider>();
    final dcP = context.watch<DatacenterProvider>();
    final dc = dcP.connectedDC;

    if (widget.selectedZoneId != null) {
      return ZoneDetailsScreen(
        zoneId: widget.selectedZoneId!,
        onBack: widget.onZoneClose ?? () {},
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Informations',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const Text('Détails structurels et configuration du système',
              style: TextStyle(fontSize: 12, color: AppColors.mutedFg)),
          const SizedBox(height: 16),
          if (dc == null)
            const EmptyState(
              'Connectez-vous à un datacenter pour voir les informations',
              icon: Icons.info_outline,
            )
          else ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.statusWarning.withOpacity(0.06),
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.dns_outlined,
                            color: AppColors.primary, size: 22),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(dc.name,
                                style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700)),
                            if (dc.location != null)
                              Row(
                                children: [
                                  const Icon(Icons.location_on_outlined,
                                      size: 12, color: AppColors.mutedFg),
                                  const SizedBox(width: 3),
                                  Text(dc.location!,
                                      style: const TextStyle(
                                          fontSize: 12,
                                          color: AppColors.mutedFg)),
                                ],
                              ),
                          ],
                        ),
                      ),
                      StatusBadge(dc.status),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(Icons.show_chart,
                          size: 14, color: AppColors.mutedFg),
                      const SizedBox(width: 4),
                      Text('Zones: ${dc.zones.length}',
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.mutedFg)),
                      const SizedBox(width: 24),
                      const Icon(Icons.memory_outlined,
                          size: 14, color: AppColors.mutedFg),
                      const SizedBox(width: 4),
                      Text('Nœuds: ${dc.totalNodes}',
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.mutedFg)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text('Zones d\'Infrastructure',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            ...app.zones.map(
              (z) => InkWell(
                onTap: () => widget.onZoneOpen?.call(z.id),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    border: Border.all(color: AppColors.border),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: AppColors.status(z.status).withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(Icons.location_on_outlined,
                            color: AppColors.status(z.status), size: 16),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(z.name,
                                style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600)),
                            if (z.description != null)
                              Text(z.description!,
                                  style: const TextStyle(
                                      fontSize: 11,
                                      color: AppColors.mutedFg)),
                            Text('${z.nodes.length} nœuds',
                                style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.mutedFg)),
                          ],
                        ),
                      ),
                      StatusBadge(z.status),
                      const SizedBox(width: 8),
                      const Icon(Icons.chevron_right,
                          size: 18, color: AppColors.mutedFg),
                    ],
                  ),
                ),
              ),
            ),
            if (app.zones.isNotEmpty) ...[
              const SizedBox(height: 20),
              const Text('Capteurs & Nœuds IoT',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              AppCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                      color: AppColors.muted.withOpacity(0.3),
                      child: const Row(
                        children: [
                          Expanded(
                              flex: 2,
                              child: Text('ID',
                                  style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.mutedFg,
                                      letterSpacing: 0.5))),
                          Expanded(
                              flex: 2,
                              child: Text('ZONE',
                                  style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.mutedFg,
                                      letterSpacing: 0.5))),
                          Expanded(
                              flex: 2,
                              child: Text('STATUT',
                                  style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.mutedFg,
                                      letterSpacing: 0.5))),
                          Expanded(
                              flex: 2,
                              child: Text('FIRMWARE',
                                  style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.mutedFg,
                                      letterSpacing: 0.5))),
                          Expanded(
                              flex: 3,
                              child: Text('MAC',
                                  style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.mutedFg,
                                      letterSpacing: 0.5))),
                        ],
                      ),
                    ),
                    ...app.zones.expand(
                      (z) => z.nodes.map(
                        (n) => Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 10),
                          decoration: const BoxDecoration(
                              border: Border(
                                  top: BorderSide(color: AppColors.border))),
                          child: Row(
                            children: [
                              Expanded(
                                  flex: 2,
                                  child: Text(n.name,
                                      style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600),
                                      overflow: TextOverflow.ellipsis)),
                              Expanded(
                                  flex: 2,
                                  child: Text(z.name,
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.mutedFg),
                                      overflow: TextOverflow.ellipsis)),
                              Expanded(
                                flex: 2,
                                child: Row(
                                  children: [
                                    Container(
                                        width: 6,
                                        height: 6,
                                        margin:
                                            const EdgeInsets.only(right: 5),
                                        decoration: BoxDecoration(
                                            color: n.isOnline
                                                ? AppColors.statusNormal
                                                : AppColors.statusCritical,
                                            shape: BoxShape.circle)),
                                    Text(n.isOnline ? 'En ligne' : 'Hors ligne',
                                        style: TextStyle(
                                            fontSize: 11,
                                            color: n.isOnline
                                                ? AppColors.statusNormal
                                                : AppColors.statusCritical))
                                  ],
                                ),
                              ),
                              Expanded(
                                  flex: 2,
                                  child: Text(n.firmwareVersion ?? 'v2.1.3',
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.mutedFg))),
                              Expanded(
                                  flex: 3,
                                  child: Text(
                                      n.macAddress ?? 'AA:BB:CC:DD:EE:FF',
                                      style: const TextStyle(
                                          fontSize: 10,
                                          color: AppColors.mutedFg,
                                          fontFamily: 'monospace'),
                                      overflow: TextOverflow.ellipsis)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
