import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/app_state.dart';
import '../../utils/theme.dart';
import '../../widgets/shared.dart';

enum _AuthMode { login, signup, forgot, reset }

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  _AuthMode _mode = _AuthMode.login;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final isMobile = constraints.maxWidth < 900;
          final hero = _AuthHero(mode: _mode, mobile: isMobile);
          final authPane = _AuthPane(
            mode: _mode,
            mobile: isMobile,
            onModeChanged: (m) => setState(() => _mode = m),
          );

          if (isMobile) {
            return SafeArea(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    hero,
                    authPane,
                  ],
                ),
              ),
            );
          }

          return Row(
            children: [
              Expanded(child: hero),
              Expanded(child: authPane),
            ],
          );
        },
      ),
    );
  }
}

class _AuthHero extends StatelessWidget {
  final _AuthMode mode;
  final bool mobile;

  const _AuthHero({required this.mode, required this.mobile});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.primary,
      constraints: BoxConstraints(minHeight: mobile ? 260 : double.infinity),
      child: SafeArea(
        bottom: false,
        child: Center(
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: mobile ? 28 : 48,
              vertical: mobile ? 28 : 32,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: mobile ? 64 : 72,
                  height: mobile ? 64 : 72,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.18),
                    borderRadius: BorderRadius.circular(mobile ? 16 : 18),
                  ),
                  child: Center(
                    child: CustomPaint(
                      size: Size(mobile ? 40 : 44, mobile ? 28 : 32),
                      painter: _EkgPainter(),
                    ),
                  ),
                ),
                SizedBox(height: mobile ? 20 : 28),
                Text(
                  'Ooredoo\nDatacenter',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: mobile ? 24 : 30,
                    fontWeight: FontWeight.w800,
                    height: 1.12,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  mode == _AuthMode.forgot || mode == _AuthMode.reset
                      ? 'Réinitialisation sécurisée'
                      : 'IoT Monitoring Dashboard',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.78),
                    fontSize: mobile ? 13 : 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 10),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Text(
                    mode == _AuthMode.forgot || mode == _AuthMode.reset
                        ? 'Demandez un lien de réinitialisation ou définissez un nouveau mot de passe.'
                        : 'Surveillance en temps réel des métriques environnementales de vos datacenters',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.58),
                      fontSize: mobile ? 12 : 13,
                      height: 1.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AuthPane extends StatelessWidget {
  final _AuthMode mode;
  final bool mobile;
  final ValueChanged<_AuthMode> onModeChanged;

  const _AuthPane({
    required this.mode,
    required this.mobile,
    required this.onModeChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFF2F2F2),
      child: Center(
        child: SingleChildScrollView(
          padding: EdgeInsets.symmetric(
            horizontal: mobile ? 16 : 48,
            vertical: mobile ? 16 : 40,
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: mobile ? 680 : 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8E8E8),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.border),
                  ),
                  padding: const EdgeInsets.all(3),
                  child: Row(
                    children: [
                      if (mode == _AuthMode.login || mode == _AuthMode.signup) ...[
                        _Tab(
                          'Connexion',
                          mode == _AuthMode.login,
                          () => onModeChanged(_AuthMode.login),
                        ),
                        _Tab(
                          'Inscription',
                          mode == _AuthMode.signup,
                          () => onModeChanged(_AuthMode.signup),
                        ),
                      ] else ...[
                        _Tab(
                          'Demander',
                          mode == _AuthMode.forgot,
                          () => onModeChanged(_AuthMode.forgot),
                        ),
                        _Tab(
                          'Réinitialiser',
                          mode == _AuthMode.reset,
                          () => onModeChanged(_AuthMode.reset),
                        ),
                      ]
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                switch (mode) {
                  _AuthMode.login => _LoginForm(
                      onForgotPassword: () => onModeChanged(_AuthMode.forgot),
                    ),
                  _AuthMode.signup => const _RegisterForm(),
                  _AuthMode.forgot => _ForgotPasswordForm(
                      onGoReset: () => onModeChanged(_AuthMode.reset),
                      onBackToLogin: () => onModeChanged(_AuthMode.login),
                    ),
                  _AuthMode.reset => _ResetPasswordForm(
                      onBackToLogin: () => onModeChanged(_AuthMode.login),
                      onBackToRequest: () => onModeChanged(_AuthMode.forgot),
                    ),
                },
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EkgPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final path = Path();
    final w = size.width;
    final h = size.height;
    path.moveTo(0, h * 0.5);
    path.lineTo(w * 0.2, h * 0.5);
    path.lineTo(w * 0.3, h * 0.15);
    path.lineTo(w * 0.4, h * 0.85);
    path.lineTo(w * 0.5, h * 0.5);
    path.lineTo(w * 0.6, h * 0.5);
    path.lineTo(w * 0.7, h * 0.3);
    path.lineTo(w * 0.8, h * 0.5);
    path.lineTo(w, h * 0.5);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_) => false;
}

class _Tab extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Tab(this.label, this.active, this.onTap);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            boxShadow: active
                ? [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.06),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    )
                  ]
                : null,
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              fontWeight: active ? FontWeight.w600 : FontWeight.w400,
              color: active ? AppColors.foreground : AppColors.mutedFg,
            ),
          ),
        ),
      ),
    );
  }
}

class _LoginForm extends StatefulWidget {
  final VoidCallback onForgotPassword;
  const _LoginForm({required this.onForgotPassword});

  @override
  State<_LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<_LoginForm> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscure = true, _loading = false;
  String? _error;

  Future<void> _submit() async {
    if (_emailCtrl.text.isEmpty || _passCtrl.text.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final res = await auth.signIn(_emailCtrl.text.trim(), _passCtrl.text);
      if (res['error'] != null) {
        setState(() => _error = res['error'].toString());
      } else if (mounted) {
        context.read<AppProvider>().initSocket(auth.token);
        context.read<AppProvider>().loadDatacenters();
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 420;
    return _FormCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Connexion', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text(
            'Connectez-vous à votre tableau de bord',
            style: TextStyle(fontSize: 13, color: AppColors.mutedFg),
          ),
          const SizedBox(height: 24),
          if (_error != null) _ErrorBox(title: 'Erreur de connexion', message: _error!),
          const Text('Email', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 7),
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(hintText: 'vous@ooredoo.tn'),
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 16),
          narrow
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Mot de passe', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    GestureDetector(
                      onTap: widget.onForgotPassword,
                      child: const Text(
                        'Mot de passe oublié ?',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppColors.mutedFg,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                )
              : Row(
                  children: [
                    const Text('Mot de passe', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    const Spacer(),
                    GestureDetector(
                      onTap: widget.onForgotPassword,
                      child: const Text(
                        'Mot de passe oublié ?',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppColors.mutedFg,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ),
          const SizedBox(height: 7),
          TextField(
            controller: _passCtrl,
            obscureText: _obscure,
            decoration: InputDecoration(
              suffixIcon: IconButton(
                icon: Icon(
                  _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                  size: 18,
                  color: AppColors.mutedFg,
                ),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 22),
          PrimaryBtn('Se connecter', onTap: _submit, loading: _loading),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }
}

class _RegisterForm extends StatefulWidget {
  const _RegisterForm();

  @override
  State<_RegisterForm> createState() => _RegisterFormState();
}

class _RegisterFormState extends State<_RegisterForm> {
  final _firstCtrl = TextEditingController();
  final _lastCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscure = true, _loading = false;
  String? _error, _success;

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });
    try {
      final res = await context.read<AuthProvider>().signUp({
            'firstName': _firstCtrl.text.trim(),
            'lastName': _lastCtrl.text.trim(),
            'email': _emailCtrl.text.trim(),
            'phone': _phoneCtrl.text.trim(),
            'password': _passCtrl.text,
          });
      if (res['error'] != null) {
        setState(() => _error = res['error'].toString());
      } else {
        setState(() => _success = 'Compte créé. Vérifiez votre email pour confirmer votre inscription.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 460;
    return _FormCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Inscription', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text('Créer un nouveau compte', style: TextStyle(fontSize: 13, color: AppColors.mutedFg)),
          const SizedBox(height: 24),
          if (_error != null) _InlineMessage(message: _error!, color: AppColors.primary),
          if (_success != null) _InlineMessage(message: _success!, color: AppColors.statusNormal),
          narrow
              ? Column(
                  children: [
                    _FieldCol('Prénom', _firstCtrl, 'Votre prénom'),
                    const SizedBox(height: 12),
                    _FieldCol('Nom', _lastCtrl, 'Votre nom'),
                  ],
                )
              : Row(
                  children: [
                    Expanded(child: _FieldCol('Prénom', _firstCtrl, 'Votre prénom')),
                    const SizedBox(width: 12),
                    Expanded(child: _FieldCol('Nom', _lastCtrl, 'Votre nom')),
                  ],
                ),
          const SizedBox(height: 12),
          _FieldCol('Email', _emailCtrl, 'vous@ooredoo.tn', keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 12),
          _FieldCol('Téléphone', _phoneCtrl, '+216 XX XXX XXX', keyboardType: TextInputType.phone),
          const SizedBox(height: 12),
          const Text('Mot de passe', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(
            controller: _passCtrl,
            obscureText: _obscure,
            decoration: InputDecoration(
              hintText: 'Min. 6 caractères',
              suffixIcon: IconButton(
                icon: Icon(
                  _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                  size: 18,
                  color: AppColors.mutedFg,
                ),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
          ),
          const SizedBox(height: 20),
          PrimaryBtn("S'inscrire", onTap: _submit, loading: _loading),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _firstCtrl.dispose();
    _lastCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }
}

class _ForgotPasswordForm extends StatefulWidget {
  final VoidCallback onGoReset;
  final VoidCallback onBackToLogin;
  const _ForgotPasswordForm({required this.onGoReset, required this.onBackToLogin});

  @override
  State<_ForgotPasswordForm> createState() => _ForgotPasswordFormState();
}

class _ForgotPasswordFormState extends State<_ForgotPasswordForm> {
  final _emailCtrl = TextEditingController();
  bool _loading = false;
  String? _error, _success;

  Future<void> _submit() async {
    if (_emailCtrl.text.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });
    try {
      final res = await context.read<AuthProvider>().requestPasswordReset(_emailCtrl.text.trim());
      if (res['error'] != null) {
        setState(() => _error = res['error'].toString());
      } else {
        setState(() => _success = (res['message'] ?? 'Un lien de réinitialisation a été envoyé.').toString());
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 420;
    return _FormCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Mot de passe oublié', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text(
            'Entrez votre email pour recevoir un lien de réinitialisation.',
            style: TextStyle(fontSize: 13, color: AppColors.mutedFg),
          ),
          const SizedBox(height: 24),
          if (_error != null) _ErrorBox(title: 'Erreur', message: _error!),
          if (_success != null) _InlineMessage(message: _success!, color: AppColors.statusNormal),
          _FieldCol('Email', _emailCtrl, 'vous@ooredoo.tn', keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 20),
          PrimaryBtn('Envoyer le lien', onTap: _submit, loading: _loading),
          const SizedBox(height: 14),
          narrow
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    GestureDetector(
                      onTap: widget.onBackToLogin,
                      child: const Text(
                        'Retour à la connexion',
                        style: TextStyle(fontSize: 11, color: AppColors.mutedFg, decoration: TextDecoration.underline),
                      ),
                    ),
                    const SizedBox(height: 8),
                    GestureDetector(
                      onTap: widget.onGoReset,
                      child: const Text(
                        'J’ai déjà un code',
                        style: TextStyle(fontSize: 11, color: AppColors.mutedFg, decoration: TextDecoration.underline),
                      ),
                    ),
                  ],
                )
              : Row(
                  children: [
                    GestureDetector(
                      onTap: widget.onBackToLogin,
                      child: const Text(
                        'Retour à la connexion',
                        style: TextStyle(fontSize: 11, color: AppColors.mutedFg, decoration: TextDecoration.underline),
                      ),
                    ),
                    const Spacer(),
                    GestureDetector(
                      onTap: widget.onGoReset,
                      child: const Text(
                        'J’ai déjà un code',
                        style: TextStyle(fontSize: 11, color: AppColors.mutedFg, decoration: TextDecoration.underline),
                      ),
                    ),
                  ],
                ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }
}

class _ResetPasswordForm extends StatefulWidget {
  final VoidCallback onBackToLogin;
  final VoidCallback onBackToRequest;
  const _ResetPasswordForm({required this.onBackToLogin, required this.onBackToRequest});

  @override
  State<_ResetPasswordForm> createState() => _ResetPasswordFormState();
}

class _ResetPasswordFormState extends State<_ResetPasswordForm> {
  final _emailCtrl = TextEditingController();
  final _tokenCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscure1 = true, _obscure2 = true, _loading = false;
  String? _error, _success;

  Future<void> _submit() async {
    if (_emailCtrl.text.trim().isEmpty ||
        _tokenCtrl.text.trim().isEmpty ||
        _passwordCtrl.text.isEmpty ||
        _confirmCtrl.text.isEmpty) {
      return;
    }
    if (_passwordCtrl.text.length < 6) {
      setState(() => _error = 'Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (_passwordCtrl.text != _confirmCtrl.text) {
      setState(() => _error = 'Les mots de passe ne correspondent pas.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });
    try {
      final res = await context.read<AuthProvider>().resetPassword(
            email: _emailCtrl.text.trim(),
            token: _tokenCtrl.text.trim(),
            newPassword: _passwordCtrl.text,
          );
      if (res['error'] != null) {
        setState(() => _error = res['error'].toString());
      } else {
        setState(() => _success = (res['message'] ?? 'Mot de passe réinitialisé avec succès.').toString());
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 420;
    return _FormCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Nouveau mot de passe', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text(
            'Collez le token reçu par email et définissez un nouveau mot de passe.',
            style: TextStyle(fontSize: 13, color: AppColors.mutedFg),
          ),
          const SizedBox(height: 24),
          if (_error != null) _ErrorBox(title: 'Échec de réinitialisation', message: _error!),
          if (_success != null) _InlineMessage(message: _success!, color: AppColors.statusNormal),
          _FieldCol('Email', _emailCtrl, 'vous@ooredoo.tn', keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 12),
          _FieldCol('Code / token', _tokenCtrl, 'Collez le token reçu par email'),
          const SizedBox(height: 12),
          const Text('Nouveau mot de passe', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(
            controller: _passwordCtrl,
            obscureText: _obscure1,
            decoration: InputDecoration(
              hintText: 'Min. 6 caractères',
              suffixIcon: IconButton(
                icon: Icon(_obscure1 ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18, color: AppColors.mutedFg),
                onPressed: () => setState(() => _obscure1 = !_obscure1),
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Text('Confirmer le mot de passe', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(
            controller: _confirmCtrl,
            obscureText: _obscure2,
            decoration: InputDecoration(
              hintText: 'Répétez le nouveau mot de passe',
              suffixIcon: IconButton(
                icon: Icon(_obscure2 ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18, color: AppColors.mutedFg),
                onPressed: () => setState(() => _obscure2 = !_obscure2),
              ),
            ),
          ),
          const SizedBox(height: 20),
          PrimaryBtn('Mettre à jour le mot de passe', onTap: _submit, loading: _loading),
          const SizedBox(height: 14),
          narrow
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    GestureDetector(
                      onTap: widget.onBackToLogin,
                      child: const Text(
                        'Retour à la connexion',
                        style: TextStyle(fontSize: 11, color: AppColors.mutedFg, decoration: TextDecoration.underline),
                      ),
                    ),
                    const SizedBox(height: 8),
                    GestureDetector(
                      onTap: widget.onBackToRequest,
                      child: const Text(
                        'Redemander un lien',
                        style: TextStyle(fontSize: 11, color: AppColors.mutedFg, decoration: TextDecoration.underline),
                      ),
                    ),
                  ],
                )
              : Row(
                  children: [
                    GestureDetector(
                      onTap: widget.onBackToLogin,
                      child: const Text(
                        'Retour à la connexion',
                        style: TextStyle(fontSize: 11, color: AppColors.mutedFg, decoration: TextDecoration.underline),
                      ),
                    ),
                    const Spacer(),
                    GestureDetector(
                      onTap: widget.onBackToRequest,
                      child: const Text(
                        'Redemander un lien',
                        style: TextStyle(fontSize: 11, color: AppColors.mutedFg, decoration: TextDecoration.underline),
                      ),
                    ),
                  ],
                ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _tokenCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }
}

class _ErrorBox extends StatelessWidget {
  final String title;
  final String message;
  const _ErrorBox({required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white, fontSize: 13)),
          Text(message, style: const TextStyle(color: Colors.white, fontSize: 12)),
        ],
      ),
    );
  }
}

class _InlineMessage extends StatelessWidget {
  final String message;
  final Color color;
  const _InlineMessage({required this.message, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: color.withOpacity(0.08), borderRadius: BorderRadius.circular(6)),
      child: Text(message, style: TextStyle(fontSize: 12, color: color)),
    );
  }
}

class _FieldCol extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String hint;
  final TextInputType? keyboardType;
  const _FieldCol(this.label, this.controller, this.hint, {this.keyboardType});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        TextField(controller: controller, keyboardType: keyboardType, decoration: InputDecoration(hintText: hint)),
      ],
    );
  }
}

class _FormCard extends StatelessWidget {
  final Widget child;
  const _FormCard({required this.child});

  @override
  Widget build(BuildContext context) {
    final mobile = MediaQuery.sizeOf(context).width < 600;
    return Container(
      padding: EdgeInsets.all(mobile ? 18 : 28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}
