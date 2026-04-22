import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../providers/app_state.dart';
import '../services/socket_service.dart';
import '../utils/theme.dart';
import '../widgets/shared.dart';
import 'ai/ai_screen.dart';
import 'alerts/alerts_screen.dart';
import 'datacenters/datacenters_screen.dart';
import 'history/history_screen.dart';
import 'info/info_screen.dart';
import 'overview/overview_screen.dart';
import 'settings/settings_screen.dart';
import 'surveillance/surveillance_screen.dart';
import 'thresholds/thresholds_screen.dart';
import 'users/users_screen.dart';

class _NavItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool adminOnly;

  const _NavItem(
    this.icon,
    this.activeIcon,
    this.label, {
    this.adminOnly = false,
  });
}

class _RoomGroup {
  final String part;
  final String room;
  final String firstZoneId;
  final String status;
  final int zoneCount;
  final int nodeCount;
  final List<String> roomParts;
  final List<String> zoneIds;

  const _RoomGroup({
    required this.part,
    required this.room,
    required this.firstZoneId,
    required this.status,
    required this.zoneCount,
    required this.nodeCount,
    required this.roomParts,
    required this.zoneIds,
  });
}

const _allNav = [
  _NavItem(Icons.language_outlined, Icons.language, 'Datacenters'),
  _NavItem(Icons.visibility_outlined, Icons.visibility, "Vue d'ensemble"),
  _NavItem(Icons.monitor_heart_outlined, Icons.monitor_heart, 'Surveillance'),
  _NavItem(Icons.notifications_outlined, Icons.notifications, 'Alertes'),
  _NavItem(Icons.history_outlined, Icons.history, 'Historique'),
  _NavItem(Icons.tune_outlined, Icons.tune, 'Seuils'),
  _NavItem(Icons.psychology_outlined, Icons.psychology, 'Assistant IA'),
  _NavItem(Icons.info_outline, Icons.info, 'Informations'),
  _NavItem(Icons.settings_outlined, Icons.settings, 'Paramètres'),
  _NavItem(
    Icons.admin_panel_settings_outlined,
    Icons.admin_panel_settings,
    'Utilisateurs',
    adminOnly: true,
  ),
];

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  int _idx = 0;
  bool _exp = true;
  double _sidebarWidth = 304;
  String? _selectedZoneId;

  List<_NavItem> _nav(AuthProvider auth) =>
      _allNav.where((item) => !item.adminOnly || auth.isAdmin).toList();

  Widget _screen(List<_NavItem> nav) {
    final label = nav[_idx].label;

    switch (label) {
      case 'Datacenters':
        return DatacentersScreen(
          onConnected: () => setState(() => _idx = 1),
        );
      case "Vue d'ensemble":
        return const OverviewScreen();
      case 'Surveillance':
        return const SurveillanceScreen();
      case 'Alertes':
        return const AlertsScreen();
      case 'Historique':
        return const HistoryScreen();
      case 'Seuils':
        return const ThresholdsScreen();
      case 'Assistant IA':
        return const AIAssistantScreen();
      case 'Informations':
        return InfoScreen(
          selectedZoneId: _selectedZoneId,
          onZoneOpen: (zoneId) => setState(() {
            _selectedZoneId = zoneId;
          }),
          onZoneClose: () => setState(() {
            _selectedZoneId = null;
          }),
        );
      case 'Paramètres':
        return const SettingsScreen();
      case 'Utilisateurs':
        return const UsersScreen();
      default:
        return DatacentersScreen(
          onConnected: () => setState(() => _idx = 1),
        );
    }
  }

  void _openZoneFromSidebar(String zoneId, List<_NavItem> nav, bool desktop) {
    final infoIndex = nav.indexWhere((item) => item.label == 'Informations');

    setState(() {
      if (infoIndex >= 0) _idx = infoIndex;
      _selectedZoneId = zoneId;
    });

    if (!desktop && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  List<_RoomGroup> _groupRooms(List<Zone> zones) {
    final grouped = <String, _RoomGroup>{};

    for (final zone in zones) {
      final part = zone.part ?? 'Salles';
      final room = zone.room ?? zone.name;
      final key = '$part::$room';
      final zoneStatus = zone.status == 'alert' ? 'critical' : zone.status;
      final current = grouped[key];

      if (current == null) {
        grouped[key] = _RoomGroup(
          part: part,
          room: room,
          firstZoneId: zone.id,
          status: zoneStatus,
          zoneCount: 1,
          nodeCount: zone.nodes.length,
          roomParts: zone.roomPart == null ? const [] : [zone.roomPart!],
          zoneIds: [zone.id],
        );
        continue;
      }

      grouped[key] = _RoomGroup(
        part: current.part,
        room: current.room,
        firstZoneId: current.firstZoneId,
        status: current.status == 'critical' || zoneStatus == 'critical'
            ? 'critical'
            : current.status == 'warning' || zoneStatus == 'warning'
                ? 'warning'
                : 'normal',
        zoneCount: current.zoneCount + 1,
        nodeCount: current.nodeCount + zone.nodes.length,
        roomParts: {
          ...current.roomParts,
          if (zone.roomPart != null) zone.roomPart!,
        }.toList(),
        zoneIds: [...current.zoneIds, zone.id],
      );
    }

    final rooms = grouped.values.toList()
      ..sort((a, b) {
        final partCompare = a.part.compareTo(b.part);
        if (partCompare != 0) return partCompare;
        return a.room.compareTo(b.room);
      });
    return rooms;
  }

  Widget _buildResizeHandle() {
    return MouseRegion(
      cursor: SystemMouseCursors.resizeColumn,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onHorizontalDragUpdate: (details) {
          if (!_exp) {
            setState(() => _exp = true);
          }
          setState(() {
            _sidebarWidth = (_sidebarWidth + details.delta.dx).clamp(272, 420).toDouble();
          });
        },
        child: Container(
          width: 10,
          color: Colors.transparent,
          alignment: Alignment.center,
          child: Container(
            width: 2,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.sidebarBorder,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final app = context.watch<AppProvider>();
    final dcP = context.watch<DatacenterProvider>();
    final sock = context.read<SocketService>();
    final nav = _nav(auth);

    if (_idx >= nav.length) _idx = 0;

    return LayoutBuilder(
      builder: (context, constraints) {
        final desktop = constraints.maxWidth >= 1100;
        final sidebar = _buildSidebar(auth, app, dcP, sock, nav, desktop);

        return Scaffold(
          key: _scaffoldKey,
          backgroundColor: AppColors.background,
          drawer: desktop ? null : Drawer(width: 320, child: sidebar),
          body: Row(
            children: [
              if (desktop)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  width: _exp ? _sidebarWidth : 84,
                  child: sidebar,
                ),
              if (desktop) _buildResizeHandle(),
              Expanded(
                child: Column(
                  children: [
                    _buildTopBar(auth, nav[_idx].label, desktop),
                    Expanded(child: _screen(nav)),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSidebar(
    AuthProvider auth,
    AppProvider app,
    DatacenterProvider dcP,
    SocketService sock,
    List<_NavItem> nav,
    bool desktop,
  ) {
    final expanded = _exp || !desktop;

    return Container(
      height: double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.sidebarBg,
        border: Border(
          right: BorderSide(color: AppColors.sidebarBorder),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _buildSidebarHeader(desktop, expanded),
            if (expanded && dcP.connectedDC != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(6, 8, 6, 2),
                child: ConnectedChip(
                  dcName: dcP.connectedDC!.name,
                  onDisconnect: () => dcP.disconnect(sock),
                ),
              ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.symmetric(
                  vertical: 8,
                  horizontal: expanded ? 0 : 4,
                ),
                children: List.generate(
                  nav.length,
                  (i) => _Tile(
                    nav[i],
                    i == _idx,
                    expanded,
                    nav[i].label == 'Alertes' ? app.activeCount : 0,
                    () {
                      setState(() {
                        _idx = i;
                        if (nav[i].label != 'Informations') {
                          _selectedZoneId = null;
                        }
                      });

                      if (!desktop) Navigator.of(context).pop();
                    },
                  ),
                ),
              ),
            ),
            const Divider(height: 1),
            if (expanded) _buildInfraPanel(app, dcP, nav, desktop),
            if (expanded) const Divider(height: 1),
            _buildFooter(auth, app, dcP, expanded),
          ],
        ),
      ),
    );
  }

  Widget _buildSidebarHeader(bool desktop, bool expanded) {
    return Container(
      height: 70,
      padding: EdgeInsets.symmetric(horizontal: expanded ? 14 : 0),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: AppColors.sidebarBorder),
        ),
      ),
      child: expanded
          ? Row(
              children: [
                Image.asset(
                  'assets/ooredoo-icon.jpeg',
                  width: 42,
                  height: 42,
                  fit: BoxFit.contain,
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'ooredoo',
                        style: TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w900,
                          fontSize: 16,
                          height: 1,
                        ),
                      ),
                      SizedBox(height: 3),
                      Text(
                        'SENTINEL IOT',
                        style: TextStyle(
                          color: AppColors.mutedFg,
                          fontSize: 8,
                          letterSpacing: 1.8,
                          fontWeight: FontWeight.w700,
                          height: 1,
                        ),
                      ),
                    ],
                  ),
                ),
                if (desktop)
                  InkWell(
                    onTap: () => setState(() => _exp = false),
                    borderRadius: BorderRadius.circular(20),
                    child: const Padding(
                      padding: EdgeInsets.all(6),
                      child: Icon(
                        Icons.chevron_left,
                        size: 18,
                        color: AppColors.mutedFg,
                      ),
                    ),
                  ),
              ],
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                InkWell(
                  onTap: () => setState(() => _exp = true),
                  borderRadius: BorderRadius.circular(21),
                  child: Image.asset(
                    'assets/ooredoo-icon.jpeg',
                    width: 42,
                    height: 42,
                    fit: BoxFit.contain,
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildInfra(
    AppProvider app,
    DatacenterProvider dcP,
    List<_NavItem> nav,
    bool desktop,
  ) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'INFRASTRUCTURE',
            style: TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.w700,
              color: AppColors.mutedFg,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(
                Icons.dns_outlined,
                size: 14,
                color: AppColors.sidebarFg,
              ),
              const SizedBox(width: 6),
              const Text(
                'Datacenter',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 6),
              if (dcP.connectedDC != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: AppColors.statusNormal.withOpacity(0.1),
                    border: Border.all(
                      color: AppColors.statusNormal.withOpacity(0.4),
                    ),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'OK',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: AppColors.statusNormal,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (dcP.connectedDC != null)
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 220),
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    for (final z in dcP.connectedDC!.zones)
                      Padding(
                        padding: const EdgeInsets.only(left: 8, top: 4),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(8),
                          onTap: () => _openZoneFromSidebar(z.id, nav, desktop),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: _selectedZoneId == z.id
                                  ? AppColors.sidebarAccent
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.location_on_outlined,
                                  size: 13,
                                  color: _selectedZoneId == z.id
                                      ? AppColors.primary
                                      : AppColors.mutedFg,
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    z.name,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: _selectedZoneId == z.id
                                          ? AppColors.primary
                                          : AppColors.sidebarFg,
                                      fontWeight: _selectedZoneId == z.id
                                          ? FontWeight.w700
                                          : FontWeight.w400,
                                    ),
                                  ),
                                ),
                                if (_selectedZoneId == z.id)
                                  const Icon(
                                    Icons.chevron_right,
                                    size: 14,
                                    color: AppColors.primary,
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.only(top: 6, left: 4),
              child: Text(
                'Aucun datacenter connecté',
                style: TextStyle(
                  fontSize: 11,
                  color: AppColors.mutedFg,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildInfraPanel(
    AppProvider app,
    DatacenterProvider dcP,
    List<_NavItem> nav,
    bool desktop,
  ) {
    final connected = dcP.connectedDC;
    final zones = app.zones.isNotEmpty ? app.zones : (connected?.zones ?? const <Zone>[]);
    final groupedRooms = _groupRooms(zones);
    const accents = <Color>[
      Color(0xFFFF6B6B),
      Color(0xFF46B3F7),
      Color(0xFFA181FF),
      Color(0xFF4AD37A),
      Color(0xFF34C7EB),
      Color(0xFFF6A623),
    ];
    final parts = {...groupedRooms.map((room) => room.part)}.toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'INFRASTRUCTURE',
            style: TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.w700,
              color: AppColors.mutedFg,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          if (connected != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.statusNormal.withOpacity(0.05),
                border: Border.all(color: AppColors.statusNormal.withOpacity(0.18)),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.public, color: AppColors.primary, size: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          connected.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                        ),
                        Text(
                          '${zones.length} zones actives',
                          style: const TextStyle(fontSize: 11, color: AppColors.mutedFg),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.statusNormal.withOpacity(0.1),
                      border: Border.all(color: AppColors.statusNormal.withOpacity(0.28)),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'OK',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: AppColors.statusNormal,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 10),
          if (connected != null)
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 260),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final part in parts) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(2, 4, 2, 8),
                        child: Text(
                          part,
                          style: const TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mutedFg,
                            letterSpacing: 1,
                          ),
                        ),
                      ),
                      for (final entry in groupedRooms.where((room) => room.part == part).toList().asMap().entries)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Builder(
                            builder: (context) {
                              final room = entry.value;
                              final accent = accents[entry.key % accents.length];
                              final selected = room.zoneIds.contains(_selectedZoneId);
                              final borderColor = room.status == 'critical'
                                  ? AppColors.statusCritical.withOpacity(0.2)
                                  : room.status == 'warning'
                                      ? AppColors.statusWarning.withOpacity(0.24)
                                      : AppColors.border;

                              return InkWell(
                                borderRadius: BorderRadius.circular(16),
                                onTap: () => _openZoneFromSidebar(room.firstZoneId, nav, desktop),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: selected
                                        ? AppColors.sidebarAccent
                                        : room.status == 'critical'
                                            ? AppColors.statusCritical.withOpacity(0.05)
                                            : room.status == 'warning'
                                                ? AppColors.statusWarning.withOpacity(0.05)
                                                : AppColors.card,
                                    border: Border.all(
                                      color: selected ? AppColors.primary.withOpacity(0.25) : borderColor,
                                    ),
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 42,
                                        height: 42,
                                        decoration: BoxDecoration(
                                          color: accent.withOpacity(0.12),
                                          borderRadius: BorderRadius.circular(14),
                                          border: Border.all(color: accent.withOpacity(0.2)),
                                        ),
                                        child: Center(
                                          child: Container(
                                            width: 12,
                                            height: 12,
                                            decoration: BoxDecoration(
                                              color: accent,
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              room.room,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(
                                                fontSize: 13,
                                                fontWeight: FontWeight.w700,
                                                color: accent,
                                              ),
                                            ),
                                            Text(
                                              '${room.nodeCount} noeuds${room.roomParts.isNotEmpty ? ' · ${room.roomParts.join(' / ')}' : ''}',
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(fontSize: 11, color: AppColors.mutedFg),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          border: Border.all(color: AppColors.border),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          '${room.zoneCount}',
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.mutedFg,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                    ],
                  ],
                ),
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.only(top: 6, left: 4),
              child: Text(
                'Aucun datacenter connecte',
                style: TextStyle(
                  fontSize: 11,
                  color: AppColors.mutedFg,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFooter(
    AuthProvider auth,
    AppProvider app,
    DatacenterProvider dcP,
    bool expanded,
  ) {
    if (!expanded) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(0, 10, 0, 12),
        child: Column(
          children: [
            CircleAvatar(
              radius: 16,
              backgroundColor: AppColors.muted,
              child: Text(
                auth.user?.initials ?? '?',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.mutedFg,
                ),
              ),
            ),
            const SizedBox(height: 10),
            InkWell(
              onTap: () => _doLogout(auth),
              borderRadius: BorderRadius.circular(16),
              child: const Padding(
                padding: EdgeInsets.all(6),
                child: Icon(
                  Icons.logout,
                  size: 18,
                  color: AppColors.mutedFg,
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 13,
                backgroundColor: AppColors.muted,
                child: Text(
                  auth.user?.initials ?? '?',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.mutedFg,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      auth.user?.email ?? '',
                      style: const TextStyle(
                        fontSize: 10,
                        color: AppColors.sidebarFg,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      auth.isAdmin ? 'Admin' : 'Utilisateur',
                      style: const TextStyle(
                        fontSize: 9,
                        color: AppColors.mutedFg,
                      ),
                    ),
                  ],
                ),
              ),
              InkWell(
                onTap: () => _doLogout(auth),
                borderRadius: BorderRadius.circular(16),
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(
                    Icons.logout,
                    size: 16,
                    color: AppColors.mutedFg,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Text(
                'STATUS',
                style: TextStyle(
                  fontSize: 8,
                  color: AppColors.mutedFg,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(width: 6),
              StatusDot(
                color: app.live
                    ? AppColors.statusNormal
                    : AppColors.mutedFg,
                size: 6,
              ),
              const SizedBox(width: 4),
              Text(
                app.live ? 'LIVE' : 'HORS LIGNE',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: app.live
                      ? AppColors.statusNormal
                      : AppColors.mutedFg,
                ),
              ),
            ],
          ),
          Row(
            children: [
              const Text(
                'Hub',
                style: TextStyle(
                  fontSize: 9,
                  color: AppColors.mutedFg,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  dcP.connectedDC?.name ?? '—',
                  style: const TextStyle(
                    fontSize: 9,
                    color: AppColors.mutedFg,
                  ),
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
          Row(
            children: [
              const Text(
                'Connectivité',
                style: TextStyle(
                  fontSize: 9,
                  color: AppColors.mutedFg,
                ),
              ),
              const Spacer(),
              Text(
                app.live ? '100%' : '—',
                style: const TextStyle(
                  fontSize: 9,
                  color: AppColors.mutedFg,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar(AuthProvider auth, String title, bool desktop) {
    return Container(
      height: 72,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: const BoxDecoration(
        color: AppColors.card,
        border: Border(
          bottom: BorderSide(color: AppColors.border),
        ),
      ),
      child: Row(
        children: [
          if (!desktop)
            InkWell(
              onTap: () => _scaffoldKey.currentState?.openDrawer(),
              borderRadius: BorderRadius.circular(18),
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(
                  Icons.menu,
                  size: 22,
                  color: AppColors.mutedFg,
                ),
              ),
            )
          else
            InkWell(
              onTap: () => setState(() => _exp = !_exp),
              borderRadius: BorderRadius.circular(18),
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(
                  Icons.view_sidebar_outlined,
                  size: 20,
                  color: AppColors.mutedFg,
                ),
              ),
            ),
          const SizedBox(width: 16),
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Row(
                children: [
                  const Text(
                    'Sentinel / ',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.mutedFg,
                    ),
                  ),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.primary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const Spacer(),
          if (desktop) ...[
            const _Clock(),
            const SizedBox(width: 14),
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Center(
                child: Text(
                  auth.user?.initials ?? '?',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              auth.user?.email ?? '',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ] else
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Center(
                child: Text(
                  auth.user?.initials ?? '?',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _doLogout(AuthProvider auth) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.card,
        title: const Text('Déconnexion'),
        content: const Text('Voulez-vous vous déconnecter ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Déconnecter'),
          ),
        ],
      ),
    );

    if (ok == true && mounted) {
      context.read<SocketService>().disconnect();
      await auth.signOut();
    }
  }
}

class _Tile extends StatelessWidget {
  final _NavItem n;
  final bool active;
  final bool expanded;
  final int badge;
  final VoidCallback onTap;

  const _Tile(
    this.n,
    this.active,
    this.expanded,
    this.badge,
    this.onTap,
  );

  @override
  Widget build(BuildContext context) {
    if (!expanded) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Tooltip(
          message: n.label,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(10),
            child: Center(
              child: Container(
                width: 56,
                height: 40,
                decoration: BoxDecoration(
                  color: active ? AppColors.primary : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.center,
                  children: [
                    Icon(
                      active ? n.activeIcon : n.icon,
                      size: 20,
                      color: active ? Colors.white : AppColors.sidebarFg,
                    ),
                    if (badge > 0)
                      Positioned(
                        right: 12,
                        top: 10,
                        child: Container(
                          width: 7,
                          height: 7,
                          decoration: const BoxDecoration(
                            color: AppColors.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return InkWell(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          children: [
            Icon(
              active ? n.activeIcon : n.icon,
              size: 18,
              color: active ? Colors.white : AppColors.sidebarFg,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                n.label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                  color: active ? Colors.white : AppColors.sidebarFg,
                ),
              ),
            ),
            if (badge > 0)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: active ? Colors.white30 : AppColors.primary,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$badge',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Clock extends StatelessWidget {
  const _Clock();

  @override
  Widget build(BuildContext context) {
    final initial = DateTime.now().toUtc();

    return StreamBuilder<DateTime>(
      stream: Stream.periodic(
        const Duration(seconds: 1),
        (_) => DateTime.now().toUtc(),
      ),
      builder: (_, snapshot) {
        final dt = snapshot.data ?? initial;

        const months = [
          'JAN',
          'FÉV',
          'MAR',
          'AVR',
          'MAI',
          'JUN',
          'JUL',
          'AOÛ',
          'SEP',
          'OCT',
          'NOV',
          'DÉC',
        ];

        return Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}:${dt.second.toString().padLeft(2, '0')} UTC',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                fontFamily: 'monospace',
              ),
            ),
            Text(
              '${dt.day.toString().padLeft(2, '0')} ${months[dt.month - 1]} ${dt.year}',
              style: const TextStyle(
                fontSize: 10,
                color: AppColors.mutedFg,
              ),
            ),
          ],
        );
      },
    );
  }
}
