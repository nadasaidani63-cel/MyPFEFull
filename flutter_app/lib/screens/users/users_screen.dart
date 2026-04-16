import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/app_state.dart';
import '../../services/api.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  List<AppUser> _users = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final users = await context.read<ApiService>().getUsers();
      if (mounted) setState(() => _users = users);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _updateRole(AppUser user, String role) async {
    setState(() => _saving = true);
    try {
      await context.read<ApiService>().updateUserRole(user.id, role);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Rôle de ${user.fullName} mis à jour.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (!auth.isAdmin) {
      return const Center(child: EmptyState('Réservé aux administrateurs', icon: Icons.admin_panel_settings_outlined));
    }
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_error != null) {
      return Center(child: EmptyState(_error!, icon: Icons.error_outline));
    }

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Utilisateurs', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('${_users.length} compte${_users.length > 1 ? 's' : ''}', style: const TextStyle(fontSize: 12, color: AppColors.mutedFg)),
          const SizedBox(height: 16),
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
                  child: const Row(
                    children: [
                      Expanded(flex: 3, child: Text('Utilisateur', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.mutedFg))),
                      Expanded(flex: 2, child: Text('Téléphone', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.mutedFg))),
                      Expanded(flex: 2, child: Text('Rôle', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.mutedFg))),
                    ],
                  ),
                ),
                for (final user in _users)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
                    child: Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 18,
                                backgroundColor: AppColors.primary.withOpacity(0.1),
                                child: Text(user.initials, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.primary)),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(user.fullName.isNotEmpty ? user.fullName : user.email, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                                    Text(user.email, style: const TextStyle(fontSize: 11, color: AppColors.mutedFg), overflow: TextOverflow.ellipsis),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(flex: 2, child: Text(user.phone?.isNotEmpty == true ? user.phone! : '—', style: const TextStyle(fontSize: 12))),
                        Expanded(
                          flex: 2,
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                              decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
                              child: DropdownButtonHideUnderline(
                                child: DropdownButton<String>(
                                  value: user.role,
                                  isDense: true,
                                  items: const [
                                    DropdownMenuItem(value: 'admin', child: Text('admin')),
                                    DropdownMenuItem(value: 'utilisateur', child: Text('utilisateur')),
                                  ],
                                  onChanged: _saving || user.id == auth.user?.id
                                      ? null
                                      : (value) {
                                          if (value != null && value != user.role) {
                                            _updateRole(user, value);
                                          }
                                        },
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
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
