// lib/screens/settings/settings_screen.dart — mirrors UserSettings.tsx
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state.dart';
import '../../services/api.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Paramètres',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const Text(
              'Gérer votre profil, vos notifications et vos préférences.',
              style: TextStyle(fontSize: 12, color: AppColors.mutedFg)),
          const SizedBox(height: 16),
          // Tab row
          Row(children: [
            _SettingsTab('Profil', Icons.person_outline, _tab == 0,
                () => setState(() => _tab = 0)),
            _SettingsTab('Security', Icons.shield_outlined, _tab == 1,
                () => setState(() => _tab = 1)),
            _SettingsTab('Notifications', Icons.notifications_outlined,
                _tab == 2, () => setState(() => _tab = 2)),
            _SettingsTab('Preferences', Icons.settings_outlined, _tab == 3,
                () => setState(() => _tab = 3)),
          ]),
          const SizedBox(height: 16),
          // Tab content
          AppCard(
              child: [
            _ProfileTab(user: auth.user),
            _SecurityTab(user: auth.user),
            const _NotifTab(),
            _PrefsTab(),
          ][_tab]),
        ]));
  }
}

class _SettingsTab extends StatelessWidget {
  final String l;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;
  const _SettingsTab(this.l, this.icon, this.active, this.onTap);
  @override
  Widget build(BuildContext c) => GestureDetector(
      onTap: onTap,
      child: Container(
          margin: const EdgeInsets.only(right: 4),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
              color: active ? AppColors.card : Colors.transparent,
              border: Border.all(
                  color: active ? AppColors.border : Colors.transparent),
              borderRadius: BorderRadius.circular(6)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon,
                size: 14,
                color: active ? AppColors.foreground : AppColors.mutedFg),
            const SizedBox(width: 5),
            Text(l,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                    color: active ? AppColors.foreground : AppColors.mutedFg))
          ])));
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
class _ProfileTab extends StatefulWidget {
  final dynamic user;
  const _ProfileTab({required this.user});
  @override
  State<_ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<_ProfileTab> {
  late final TextEditingController _fn, _ln, _email, _phone;
  bool _saving = false, _saved = false;
  @override
  void initState() {
    super.initState();
    _fn = TextEditingController(text: widget.user?.firstName ?? '');
    _ln = TextEditingController(text: widget.user?.lastName ?? '');
    _email = TextEditingController(text: widget.user?.email ?? '');
    _phone = TextEditingController(text: widget.user?.phone ?? '');
  }

  @override
  void dispose() {
    _fn.dispose();
    _ln.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _saved = false;
    });
    try {
      await context.read<ApiService>().updateProfile({
        'firstName': _fn.text.trim(),
        'lastName': _ln.text.trim(),
        'phone': _phone.text.trim()
      });
      await context.read<AuthProvider>().refreshMe();
      setState(() => _saved = true);
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) setState(() => _saved = false);
      });
    } catch (e) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext c) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Informations du Profil',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        Row(children: [
          CircleAvatar(
              radius: 24,
              backgroundColor: AppColors.muted,
              child: Text(widget.user?.initials ?? '?',
                  style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.mutedFg))),
          const SizedBox(width: 12),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(widget.user?.fullName ?? '',
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            Container(
                margin: const EdgeInsets.only(top: 4),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                    color: AppColors.muted,
                    borderRadius: BorderRadius.circular(4)),
                child: Text(
                    widget.user?.isAdmin == true ? 'Admin' : 'Utilisateur',
                    style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.mutedFg))),
          ]),
        ]),
        const SizedBox(height: 20),
        Row(children: [
          Expanded(child: _F('First name', _fn, 'Votre prénom')),
          const SizedBox(width: 14),
          Expanded(child: _F('Last name', _ln, 'Votre nom'))
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: _F('Email', _email, '', enabled: false)),
          const SizedBox(width: 14),
          Expanded(child: _F('Phone', _phone, '+216 XX XXX XXX'))
        ]),
        const SizedBox(height: 20),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          ElevatedButton.icon(
              icon: const Icon(Icons.save_outlined, size: 14),
              label: const Text('Save'),
              onPressed: _saving ? null : _save)
        ]),
        if (_saved) ...[
          const SizedBox(height: 12),
          Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                  color: AppColors.statusNormal.withOpacity(0.1),
                  border: Border.all(
                      color: AppColors.statusNormal.withOpacity(0.3)),
                  borderRadius: BorderRadius.circular(8)),
              child: const Row(children: [
                Icon(Icons.check_circle_outline,
                    color: AppColors.statusNormal, size: 16),
                SizedBox(width: 8),
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Paramètres sauvegardés',
                      style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppColors.statusNormal,
                          fontSize: 13)),
                  Text('Vos préférences ont été mises à jour.',
                      style: TextStyle(
                          fontSize: 11, color: AppColors.statusNormal))
                ])
              ]))
        ],
      ]);
}

// ── Security Tab ──────────────────────────────────────────────────────────────
class _SecurityTab extends StatefulWidget {
  final dynamic user;
  const _SecurityTab({required this.user});
  @override
  State<_SecurityTab> createState() => _SecurityTabState();
}

class _SecurityTabState extends State<_SecurityTab> {
  final _curr = TextEditingController(),
      _new = TextEditingController(),
      _conf = TextEditingController();
  bool _saving = false;
  bool _requestingSent = false;

  Future<void> _requestRole() async {
    final api = context.read<ApiService>();
    setState(() => _requestingSent = true);
    try {
      await api.createRoleRequest(
          'Je souhaite participer à l\'administration de la plateforme.');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Demande envoyée. Un administrateur examinera votre requête.')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _requestingSent = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  void dispose() {
    _curr.dispose();
    _new.dispose();
    _conf.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    if (_curr.text.isEmpty || _new.text.isEmpty || _conf.text.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Renseigne tous les champs.')));
      return;
    }
    if (_new.text.trim() != _conf.text.trim()) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Les mots de passe ne correspondent pas.')));
      return;
    }
    setState(() => _saving = true);
    try {
      await context
          .read<ApiService>()
          .changePassword(_curr.text.trim(), _new.text.trim());
      _curr.clear();
      _new.clear();
      _conf.clear();
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Mot de passe mis a jour.')));
    } catch (e) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext c) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Changer le mot de passe',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        _F('Mot de passe actuel', _curr, '', obs: true),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: _F('Nouveau mot de passe', _new, '', obs: true)),
          const SizedBox(width: 14),
          Expanded(child: _F('Confirmer le mot de passe', _conf, '', obs: true))
        ]),
        const SizedBox(height: 20),
        const Text('Role & Permissions',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: 10),
        Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
                color: AppColors.background,
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(8)),
            child: Column(children: [
              Row(children: [
                const Expanded(
                    child: Text('Role actuel',
                        style:
                            TextStyle(fontSize: 12, color: AppColors.mutedFg))),
                Text(
                    widget.user?.isAdmin == true
                        ? 'Administrateur'
                        : 'Utilisateur',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700))
              ]),
              const Divider(height: 16),
              Row(children: [
                const Expanded(
                    child: Text('Acces',
                        style:
                            TextStyle(fontSize: 12, color: AppColors.mutedFg))),
                Text(widget.user?.isAdmin == true ? 'Complet' : 'Lecture seule',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700))
              ]),
              if (widget.user?.isAdmin != true) ...[
                const Divider(height: 20),
                Row(children: [
                  const Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text('Demander élévation de rôle',
                            style: TextStyle(
                                fontSize: 12, fontWeight: FontWeight.w600)),
                        Text('Envoyer une demande à l\'administrateur',
                            style: TextStyle(
                                fontSize: 11, color: AppColors.mutedFg)),
                      ])),
                  OutlinedButton.icon(
                      icon: const Icon(Icons.arrow_upward, size: 14),
                      label: Text(_requestingSent ? 'Envoyée' : 'Demander',
                          style: const TextStyle(fontSize: 12)),
                      onPressed: _requestingSent ? null : _requestRole),
                ]),
              ],
            ])),
        const SizedBox(height: 20),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          ElevatedButton(
              onPressed: _saving ? null : _changePassword,
              child: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Mettre à jour'))
        ]),
      ]);
}

class _NotifTab extends StatefulWidget {
  const _NotifTab();
  @override
  State<_NotifTab> createState() => _NotifTabState();
}

class _NotifTabState extends State<_NotifTab> {
  bool _email = true, _critOnly = false, _ai = true;
  bool _saving = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final user = context.read<AuthProvider>().user;
    if (user != null) {
      final prefs = user.notificationPreferences;
      _email = prefs['emailOnAlert'] as bool? ?? true;
      _critOnly = prefs['criticalOnly'] as bool? ?? false;
      _ai = prefs['aiNotifications'] as bool? ?? true;
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final api = context.read<ApiService>();
    final auth = context.read<AuthProvider>();
    try {
      await api.updateProfile({
        'notificationPreferences': {
          'emailOnAlert': _email,
          'criticalOnly': _critOnly,
          'aiNotifications': _ai,
        }
      });
      await auth.refreshMe();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Préférences sauvegardées')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext c) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Préférences de Notifications',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 20),
        _SwitchRow('Alertes par email', 'Recevoir les alertes par email',
            _email, (v) => setState(() => _email = v)),
        const Divider(height: 20),
        _SwitchRow(
            'Critiques uniquement',
            'Ne recevoir que les alertes critiques',
            _critOnly,
            (v) => setState(() => _critOnly = v)),
        const Divider(height: 20),
        _SwitchRow(
            'Notifications IA',
            'Prédictions et recommandations de l\'IA',
            _ai,
            (v) => setState(() => _ai = v)),
        const SizedBox(height: 20),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          ElevatedButton.icon(
              icon: const Icon(Icons.save_outlined, size: 14),
              label: const Text('Sauvegarder'),
              onPressed: _saving ? null : _save)
        ]),
      ]);
}

// ── Preferences Tab ───────────────────────────────────────────────────────────
class _PrefsTab extends StatefulWidget {
  @override
  State<_PrefsTab> createState() => _PrefsTabState();
}

class _PrefsTabState extends State<_PrefsTab> {
  bool _dark = false;
  String _lang = 'Français', _view = 'Tableau de bord';
  @override
  Widget build(BuildContext c) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Préférences Système',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 20),
        Row(children: [
          const Icon(Icons.wb_sunny_outlined,
              size: 18, color: AppColors.mutedFg),
          const SizedBox(width: 8),
          const Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('Thème',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                Text('Mode clair',
                    style: TextStyle(fontSize: 11, color: AppColors.mutedFg))
              ])),
          Switch(
              value: _dark,
              onChanged: (v) => setState(() => _dark = v),
              activeColor: AppColors.primary)
        ]),
        const Divider(height: 20),
        Row(children: [
          const Icon(Icons.language_outlined,
              size: 18, color: AppColors.mutedFg),
          const SizedBox(width: 8),
          const Expanded(
              child: Text('Langue',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
          DropdownButton<String>(
              value: _lang,
              items: ['Français', 'English', 'العربية']
                  .map((l) => DropdownMenuItem(
                      value: l,
                      child: Text(l, style: const TextStyle(fontSize: 12))))
                  .toList(),
              onChanged: (v) => setState(() => _lang = v!),
              underline: const SizedBox(),
              style: const TextStyle(fontSize: 12, color: AppColors.foreground))
        ]),
        const Divider(height: 20),
        Row(children: [
          const Icon(Icons.view_quilt_outlined,
              size: 18, color: AppColors.mutedFg),
          const SizedBox(width: 8),
          const Expanded(
              child: Text('Vue par défaut',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
          DropdownButton<String>(
              value: _view,
              items: ['Tableau de bord', 'Datacenters', 'Surveillance']
                  .map((l) => DropdownMenuItem(
                      value: l,
                      child: Text(l, style: const TextStyle(fontSize: 12))))
                  .toList(),
              onChanged: (v) => setState(() => _view = v!),
              underline: const SizedBox(),
              style: const TextStyle(fontSize: 12, color: AppColors.foreground))
        ]),
        const SizedBox(height: 20),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          ElevatedButton.icon(
              icon: const Icon(Icons.save_outlined, size: 14),
              label: const Text('Sauvegarder'),
              onPressed: () => ScaffoldMessenger.of(c).showSnackBar(
                  const SnackBar(
                      content: Text('Pr\u00e9f\u00e9rences mises \u00e0 jour pour cette session'))))
        ]),
      ]);
}

// Shared widgets
class _F extends StatelessWidget {
  final String l;
  final TextEditingController c;
  final String h;
  final bool enabled, obs;
  const _F(this.l, this.c, this.h, {this.enabled = true, this.obs = false});
  @override
  Widget build(BuildContext ctx) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        TextField(
            controller: c,
            enabled: enabled,
            obscureText: obs,
            decoration: InputDecoration(
                hintText: h,
                filled: true,
                fillColor: enabled
                    ? AppColors.card
                    : AppColors.muted.withOpacity(0.3)))
      ]);
}

class _SwitchRow extends StatelessWidget {
  final String l, sub;
  final bool v;
  final ValueChanged<bool> onChange;
  const _SwitchRow(this.l, this.sub, this.v, this.onChange);
  @override
  Widget build(BuildContext c) => Row(children: [
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l,
              style:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          Text(sub,
              style: const TextStyle(fontSize: 11, color: AppColors.mutedFg))
        ])),
        Switch(value: v, onChanged: onChange, activeColor: AppColors.primary)
      ]);
}
