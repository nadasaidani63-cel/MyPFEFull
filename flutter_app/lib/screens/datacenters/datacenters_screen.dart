import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/app_state.dart';
import '../../services/socket_service.dart';
import '../../utils/location_resolver.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';

class DatacentersScreen extends StatefulWidget {
  final VoidCallback? onConnected;
  const DatacentersScreen({super.key, this.onConnected});

  @override
  State<DatacentersScreen> createState() => _DatacentersScreenState();
}

class _DatacentersScreenState extends State<DatacentersScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final app = context.read<AppProvider>();
      if (app.datacenters.isEmpty) app.loadDatacenters();
    });
  }

  Future<void> _connect(
      Datacenter dc, DatacenterProvider dcP, SocketService sock) async {
    await dcP.connect(dc, sock);
    if (mounted) widget.onConnected?.call();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppProvider>();
    final dcP = context.watch<DatacenterProvider>();
    final sock = context.read<SocketService>();

    if (app.loading && app.datacenters.isEmpty) {
      return const Center(
          child: CircularProgressIndicator(color: AppColors.primary));
    }

    return Stack(
      children: [
        RefreshIndicator(
          color: AppColors.primary,
          onRefresh: () => app.loadDatacenters(),
          child: SingleChildScrollView(
            padding: EdgeInsets.all(
                MediaQuery.sizeOf(context).width < 700 ? 14 : 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${app.datacenters.length} datacenter${app.datacenters.length != 1 ? "s" : ""} disponibles',
                  style: const TextStyle(
                    fontSize: 15,
                    color: AppColors.mutedFg,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (dcP.connectedDC != null) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      const StatusDot(color: AppColors.statusNormal, size: 8),
                      Text(
                        'Connecté — ${dcP.connectedDC!.name}',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.statusNormal,
                        ),
                      ),
                      GestureDetector(
                        onTap: () => dcP.disconnect(sock),
                        child: const Text(
                          'Déconnecter',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.mutedFg,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 16),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isDesktop = constraints.maxWidth >= 900;
                    final crossAxisCount = isDesktop ? 2 : 1;

                    return GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: app.datacenters.length,
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: crossAxisCount,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                        childAspectRatio: isDesktop ? 2.15 : 1.35,
                      ),
                      itemBuilder: (context, index) {
                        final dc = app.datacenters[index];
                        return _DcCard(
                          dc: dc,
                          dcP: dcP,
                          sock: sock,
                          onConnect: () => _connect(dc, dcP, sock),
                          onOpenDashboard: widget.onConnected,
                        );
                      },
                    );
                  },
                ),
                const SizedBox(height: 20),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final narrow = constraints.maxWidth < 980;
                    if (narrow) {
                      return Column(
                        children: [
                          _MapCard(datacenters: app.datacenters),
                          const SizedBox(height: 16),
                          _SiteComparison(datacenters: app.datacenters),
                        ],
                      );
                    }
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                            flex: 2,
                            child: _MapCard(datacenters: app.datacenters)),
                        const SizedBox(width: 16),
                        SizedBox(
                            width: 280,
                            child:
                                _SiteComparison(datacenters: app.datacenters)),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ),
        if (dcP.connecting)
          Positioned.fill(
            child: ConnectingOverlay(
              hubName: dcP.pendingDCName ?? dcP.connectedDC?.name ?? 'Hub',
              step: dcP.connectStep,
            ),
          ),
      ],
    );
  }
}

class _DcCard extends StatelessWidget {
  final Datacenter dc;
  final DatacenterProvider dcP;
  final SocketService sock;
  final VoidCallback onConnect;
  final VoidCallback? onOpenDashboard;

  const _DcCard({
    required this.dc,
    required this.dcP,
    required this.sock,
    required this.onConnect,
    this.onOpenDashboard,
  });

  @override
  Widget build(BuildContext context) {
    final isConnected = dcP.connectedDC?.id == dc.id;
    final isConnecting = dcP.connecting && dcP.pendingDCName == dc.name;
    final hasOtherConnected = dcP.connectedDC != null && !isConnected;
    final load = dc.currentLoad / 100.0;

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 420;

        Widget badge = isConnected
            ? const _ConnectedBadge()
            : _StatusOutlineBadge(status: dc.status);

        return AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          padding: EdgeInsets.all(compact ? 16 : 20),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isConnected ? AppColors.statusNormal : AppColors.border,
              width: isConnected ? 2 : 1,
            ),
            boxShadow: [
              BoxShadow(
                color: isConnected
                    ? AppColors.statusNormal.withOpacity(0.10)
                    : const Color(0x08000000),
                blurRadius: isConnected ? 18 : 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (compact) ...[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _DcIconBox(isConnected: isConnected),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            dc.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.foreground,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            dc.location ?? '',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.mutedFg,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Align(alignment: Alignment.centerRight, child: badge),
              ] else ...[
                Row(
                  children: [
                    _DcIconBox(isConnected: isConnected),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            dc.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.foreground,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            dc.location ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.mutedFg,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    badge,
                  ],
                ),
              ],
              const SizedBox(height: 18),
              Row(
                children: [
                  const Text('Nœuds',
                      style: TextStyle(fontSize: 13, color: AppColors.mutedFg)),
                  const Spacer(),
                  Text('${dc.totalNodes}',
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.foreground)),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('Charge Actuelle',
                      style: TextStyle(fontSize: 11, color: AppColors.mutedFg)),
                  const Spacer(),
                  Text('${dc.currentLoad} %',
                      style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: AppColors.foreground)),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: load,
                  minHeight: 6,
                  backgroundColor: AppColors.muted,
                  valueColor:
                      AlwaysStoppedAnimation(_loadBarColor(dc.currentLoad)),
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                height: 46,
                child: isConnected
                    ? ElevatedButton(
                        onPressed: onOpenDashboard,
                        style: ElevatedButton.styleFrom(
                          elevation: 0,
                          backgroundColor:
                              AppColors.statusNormal.withOpacity(0.18),
                          foregroundColor: AppColors.statusNormal,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                            side: BorderSide(
                                color:
                                    AppColors.statusNormal.withOpacity(0.35)),
                          ),
                        ),
                        child: Text(
                          compact
                              ? 'OUVRIR LE TABLEAU DE BORD'
                              : 'ACCÉDER AU TABLEAU DE BORD',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.1),
                        ),
                      )
                    : OutlinedButton(
                        onPressed: (hasOtherConnected || dcP.connecting)
                            ? null
                            : onConnect,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: hasOtherConnected
                              ? AppColors.statusCritical.withOpacity(0.6)
                              : AppColors.primary,
                          side: BorderSide(
                            color: hasOtherConnected
                                ? AppColors.statusCritical.withOpacity(0.28)
                                : AppColors.primary.withOpacity(0.28),
                          ),
                          disabledForegroundColor:
                              AppColors.statusCritical.withOpacity(0.7),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8)),
                        ),
                        child: Text(
                          isConnecting
                              ? 'CONNEXION...'
                              : hasOtherConnected
                                  ? 'NON DISPONIBLE'
                                  : 'CONNEXION AU HUB',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.1),
                        ),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  Color _loadBarColor(int load) {
    if (load >= 80) return const Color(0xFF71717A);
    if (load >= 60) return const Color(0xFFD4D4D8);
    return AppColors.primary;
  }
}

class _DcIconBox extends StatelessWidget {
  final bool isConnected;
  const _DcIconBox({required this.isConnected});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: isConnected
            ? AppColors.statusNormal.withOpacity(0.16)
            : AppColors.primary.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(
        Icons.dns_outlined,
        size: 24,
        color: isConnected ? AppColors.statusNormal : AppColors.primary,
      ),
    );
  }
}

class _ConnectedBadge extends StatelessWidget {
  const _ConnectedBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.statusNormal),
        borderRadius: BorderRadius.circular(999),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle_outline,
              size: 12, color: AppColors.statusNormal),
          SizedBox(width: 5),
          Text(
            'CONNECTÉ',
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.statusNormal),
          ),
        ],
      ),
    );
  }
}

class _StatusOutlineBadge extends StatelessWidget {
  final String status;
  const _StatusOutlineBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = AppColors.status(status);
    final s = status.toLowerCase();
    final label = s == 'warning'
        ? 'AVERT.'
        : (s == 'alert' || s == 'critical')
            ? 'CRITIQUE'
            : 'NORMAL';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        border: Border.all(color: color.withOpacity(0.55)),
        borderRadius: BorderRadius.circular(999),
        color: color.withOpacity(0.03),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

class _MapCard extends StatefulWidget {
  final List<Datacenter> datacenters;
  const _MapCard({required this.datacenters});

  @override
  State<_MapCard> createState() => _MapCardState();
}

class _MapCardState extends State<_MapCard> {
  int? _selectedIndex;

  @override
  Widget build(BuildContext context) {
    final datacenters = widget.datacenters;
    final points = datacenters
        .map((dc) => resolveLocation(dc.location ?? dc.name))
        .toList();

    final center = _center(points);
    final hasData = datacenters.isNotEmpty;
    final selectedDc =
        (_selectedIndex != null && _selectedIndex! < datacenters.length)
            ? datacenters[_selectedIndex!]
            : null;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Text(
                'Carte des Sites',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
              Spacer(),
              Row(
                children: [
                  _Leg('NORMAL', AppColors.statusNormal),
                  SizedBox(width: 12),
                  _Leg('AVERT.', AppColors.statusWarning),
                  SizedBox(width: 12),
                  _Leg('CRITIQUE', AppColors.statusCritical),
                ],
              )
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Distribution géospatiale des datacenters en Tunisie',
            style: TextStyle(fontSize: 11, color: AppColors.mutedFg),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 320,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: hasData
                  ? Stack(
                      children: [
                        FlutterMap(
                          options: MapOptions(
                            initialCenter: center,
                            initialZoom: 6.2,
                            onTap: (_, __) {
                              if (_selectedIndex != null) {
                                setState(() => _selectedIndex = null);
                              }
                            },
                            interactionOptions: const InteractionOptions(
                              flags: InteractiveFlag.pinchZoom |
                                  InteractiveFlag.drag |
                                  InteractiveFlag.doubleTapZoom,
                            ),
                          ),
                          children: [
                            TileLayer(
                              urlTemplate:
                                  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                              userAgentPackageName: 'com.ooredoo.sentinel',
                            ),
                            MarkerLayer(
                              markers: [
                                for (int i = 0; i < datacenters.length; i++)
                                  Marker(
                                    point: points[i],
                                    width: 44,
                                    height: 44,
                                    child: GestureDetector(
                                      onTap: () {
                                        setState(() {
                                          _selectedIndex =
                                              _selectedIndex == i ? null : i;
                                        });
                                      },
                                      child: _MapMarker(
                                        status: datacenters[i].status,
                                        selected: _selectedIndex == i,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                        if (selectedDc != null)
                          Positioned(
                            top: 14,
                            left: 14,
                            right: 14,
                            child: Center(
                              child: ConstrainedBox(
                                constraints:
                                    const BoxConstraints(maxWidth: 260),
                                child: _DatacenterPopupCard(
                                  datacenter: selectedDc,
                                  onClose: () {
                                    setState(() => _selectedIndex = null);
                                  },
                                ),
                              ),
                            ),
                          ),
                      ],
                    )
                  : Container(
                      color: const Color(0xFFF2F4F7),
                      child: const Center(
                        child: Text(
                          'Aucun datacenter à afficher',
                          style: TextStyle(
                            color: AppColors.mutedFg,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  LatLng _center(List<LatLng> points) {
    if (points.isEmpty) return const LatLng(35.5, 9.8);
    final avgLat =
        points.map((p) => p.latitude).reduce((a, b) => a + b) / points.length;
    final avgLng =
        points.map((p) => p.longitude).reduce((a, b) => a + b) / points.length;
    return LatLng(avgLat, avgLng);
  }
}

class _MapMarker extends StatelessWidget {
  final String status;
  final bool selected;

  const _MapMarker({required this.status, required this.selected});

  @override
  Widget build(BuildContext context) {
    final color = AppColors.status(status);

    return AnimatedScale(
      scale: selected ? 1.12 : 1.0,
      duration: const Duration(milliseconds: 180),
      child: Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
          boxShadow: [
            BoxShadow(
              color: const Color(0x33000000),
              blurRadius: selected ? 10 : 6,
              spreadRadius: selected ? 1 : 0,
            ),
          ],
        ),
        child: Icon(
          status == 'critical'
              ? Icons.close
              : status == 'warning'
                  ? Icons.priority_high
                  : Icons.check,
          color: Colors.white,
          size: 18,
        ),
      ),
    );
  }
}

class _DatacenterPopupCard extends StatelessWidget {
  final Datacenter datacenter;
  final VoidCallback onClose;

  const _DatacenterPopupCard({
    required this.datacenter,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final statusColor = AppColors.status(datacenter.status);
    final ds = datacenter.status.toLowerCase();
    final statusLabel = ds == 'warning'
        ? 'AVERT.'
        : (ds == 'alert' || ds == 'critical')
            ? 'CRITIQUE'
            : 'NORMAL';

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 18,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    Text(
                      datacenter.name,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppColors.foreground,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: statusColor.withOpacity(0.08),
                        border:
                            Border.all(color: statusColor.withOpacity(0.45)),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        statusLabel,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: statusColor,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              InkWell(
                onTap: onClose,
                borderRadius: BorderRadius.circular(20),
                child: const Padding(
                  padding: EdgeInsets.all(2),
                  child: Icon(Icons.close, size: 18, color: AppColors.mutedFg),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            datacenter.location ?? 'Tunisie',
            style: const TextStyle(fontSize: 12, color: AppColors.mutedFg),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _PopupMetric(
                  label: 'Nœuds',
                  value: '${datacenter.totalNodes}',
                ),
              ),
              Expanded(
                child: _PopupMetric(
                  label: 'Charge',
                  value: '${datacenter.currentLoad}%',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PopupMetric extends StatelessWidget {
  final String label;
  final String value;

  const _PopupMetric({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label,
            style: const TextStyle(fontSize: 11, color: AppColors.mutedFg)),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: AppColors.foreground,
          ),
        ),
      ],
    );
  }
}

class _Leg extends StatelessWidget {
  final String l;
  final Color c;
  const _Leg(this.l, this.c);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: c, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(
          l,
          style: const TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w600,
            color: AppColors.mutedFg,
          ),
        ),
      ],
    );
  }
}

class _SiteComparison extends StatelessWidget {
  final List<Datacenter> datacenters;
  const _SiteComparison({required this.datacenters});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Comparaison des Sites',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          for (final dc in datacenters)
            Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          dc.name,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.foreground,
                          ),
                        ),
                      ),
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: AppColors.status(dc.status),
                          shape: BoxShape.circle,
                        ),
                      )
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _CompMetric(
                            label: 'Utilisation', value: '${dc.currentLoad}%'),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _CompMetric(
                            label: 'Nœuds', value: '${dc.totalNodes}'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    height: 2,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: AppColors.status(dc.status),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _CompMetric extends StatelessWidget {
  final String label;
  final String value;
  const _CompMetric({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 10,
            color: AppColors.mutedFg,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.foreground,
          ),
        ),
      ],
    );
  }
}
