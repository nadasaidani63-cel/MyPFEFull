// lib/widgets/shared.dart
import 'package:flutter/material.dart';
import '../utils/theme.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final bool small;
  const StatusBadge(this.status, {super.key, this.small = false});
  String get label {
    switch (status.toLowerCase()) {
      case 'normal':
        return 'NORMAL';
      case 'warning':
        return 'AVERT.';
      case 'alert':
      case 'critical':
        return 'CRITIQUE';
      default:
        return status.toUpperCase();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.status(status);
    return Container(
        padding: EdgeInsets.symmetric(
            horizontal: small ? 5 : 7, vertical: small ? 2 : 3),
        decoration: BoxDecoration(
            border: Border.all(color: c.withOpacity(0.6)),
            borderRadius: BorderRadius.circular(4)),
        child: Text(label,
            style: TextStyle(
                fontSize: small ? 9 : 10,
                fontWeight: FontWeight.w700,
                color: c,
                letterSpacing: 0.4)));
  }
}

class SeverityBadge extends StatelessWidget {
  final String severity;
  const SeverityBadge(this.severity, {super.key});
  @override
  Widget build(BuildContext context) {
    final c = AppColors.status(severity);
    final labels = {
      'critical': 'Critique',
      'warning': 'Avertissement',
      'info': 'Info'
    };
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(
            color: c.withOpacity(0.1),
            border: Border.all(color: c.withOpacity(0.5)),
            borderRadius: BorderRadius.circular(4)),
        child: Text(labels[severity] ?? severity,
            style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w700, color: c)));
  }
}

class StatusDot extends StatefulWidget {
  final Color color;
  final double size;
  const StatusDot({super.key, required this.color, this.size = 8});
  @override
  State<StatusDot> createState() => _StatusDotState();
}

class _StatusDotState extends State<StatusDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _c;
  late Animation<double> _a;
  @override
  void initState() {
    super.initState();
    _c = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat(reverse: true);
    _a = Tween(begin: 0.4, end: 1.0)
        .animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: _a,
      builder: (_, __) => Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(
              color: widget.color.withOpacity(_a.value),
              shape: BoxShape.circle)));
}

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final Color? borderColor;
  const AppCard(
      {super.key, required this.child, this.padding, this.borderColor});
  @override
  Widget build(BuildContext context) => Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: borderColor ?? AppColors.border)),
      child: child);
}

class SkeletonBox extends StatefulWidget {
  final double height;
  final double? width;
  const SkeletonBox({super.key, required this.height, this.width});
  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late AnimationController _c;
  late Animation<double> _a;
  @override
  void initState() {
    super.initState();
    _c = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1000))
      ..repeat(reverse: true);
    _a = Tween(begin: 0.3, end: 0.7).animate(_c);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: _a,
      builder: (_, __) => Container(
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(
              color: AppColors.muted.withOpacity(_a.value),
              borderRadius: BorderRadius.circular(6))));
}

class EmptyState extends StatelessWidget {
  final String message;
  final String? sub;
  final IconData? icon;
  const EmptyState(this.message, {super.key, this.sub, this.icon});
  @override
  Widget build(BuildContext context) => Center(
      child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null)
              Icon(icon, size: 40, color: AppColors.mutedFg.withOpacity(0.35)),
            if (icon != null) const SizedBox(height: 12),
            Text(message,
                style: const TextStyle(fontSize: 13, color: AppColors.mutedFg),
                textAlign: TextAlign.center),
            if (sub != null) ...[
              const SizedBox(height: 6),
              Text(sub!,
                  style:
                      const TextStyle(fontSize: 11, color: AppColors.mutedFg),
                  textAlign: TextAlign.center)
            ],
          ])));
}

class LiveBadge extends StatelessWidget {
  const LiveBadge({super.key});
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
          color: AppColors.primary, borderRadius: BorderRadius.circular(4)),
      child: const Text('EN DIRECT',
          style: TextStyle(
              color: Colors.white,
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5)));
}

class SparkLine extends StatelessWidget {
  final List<double> data;
  final Color color;
  const SparkLine({super.key, required this.data, required this.color});
  @override
  Widget build(BuildContext context) {
    if (data.length < 2) return const SizedBox(height: 36);
    return SizedBox(
        height: 36,
        child: CustomPaint(
            painter: _SparkPainter(data, color), size: Size.infinite));
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> data;
  final Color color;
  _SparkPainter(this.data, this.color);
  @override
  void paint(Canvas c, Size s) {
    if (data.length < 2) return;
    final mn = data.reduce((a, b) => a < b ? a : b);
    final mx = data.reduce((a, b) => a > b ? a : b);
    final range = mx - mn == 0 ? 1.0 : mx - mn;
    final linePaint = Paint()
      ..color = color
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;
    final path = Path();
    for (int i = 0; i < data.length; i++) {
      final x = s.width * i / (data.length - 1);
      final y =
          s.height - (s.height * (data[i] - mn) / range * 0.8 + s.height * 0.1);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    c.drawPath(path, linePaint);
    final fillPath = Path.from(path)
      ..lineTo(s.width, s.height)
      ..lineTo(0, s.height)
      ..close();
    c.drawPath(
        fillPath,
        Paint()
          ..color = color.withOpacity(0.08)
          ..style = PaintingStyle.fill);
  }

  @override
  bool shouldRepaint(_SparkPainter o) => false;
}

class ConnectedChip extends StatelessWidget {
  final String dcName;
  final VoidCallback? onDisconnect;
  const ConnectedChip({super.key, required this.dcName, this.onDisconnect});
  @override
  Widget build(BuildContext context) => Container(
      margin: const EdgeInsets.fromLTRB(8, 0, 8, 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
          color: AppColors.statusNormal.withOpacity(0.08),
          border: Border.all(color: AppColors.statusNormal.withOpacity(0.3)),
          borderRadius: BorderRadius.circular(6)),
      child: Row(children: [
        const StatusDot(color: AppColors.statusNormal, size: 7),
        const SizedBox(width: 6),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('CONNECTÉ',
              style: TextStyle(
                  fontSize: 8,
                  fontWeight: FontWeight.w700,
                  color: AppColors.statusNormal,
                  letterSpacing: 0.8)),
          Text(dcName,
              style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.foreground),
              overflow: TextOverflow.ellipsis),
        ])),
        if (onDisconnect != null)
          GestureDetector(
              onTap: onDisconnect,
              child: const Icon(Icons.wifi_off,
                  size: 13, color: AppColors.mutedFg)),
      ]));
}

class ConnectingOverlay extends StatelessWidget {
  final String hubName;
  final int step;
  const ConnectingOverlay(
      {super.key, required this.hubName, required this.step});
  @override
  Widget build(BuildContext context) => Container(
      color: Colors.black45,
      child: Center(
          child: AppCard(
              padding: const EdgeInsets.all(28),
              child: SizedBox(
                  width: 280,
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                            color: AppColors.primary.withOpacity(0.1),
                            shape: BoxShape.circle),
                        child: const Icon(Icons.dns_outlined,
                            color: AppColors.primary, size: 24)),
                    const SizedBox(height: 16),
                    Text('Connexion à $hubName',
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 20),
                    for (int i = 0; i < 3; i++) ...[
                      Row(children: [
                        SizedBox(
                            width: 20,
                            height: 20,
                            child: i + 1 < step
                                ? const Icon(Icons.check_circle,
                                    color: AppColors.statusNormal, size: 20)
                                : i + 1 == step
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                            color: AppColors.primary,
                                            strokeWidth: 2))
                                    : Container(
                                        width: 16,
                                        height: 16,
                                        decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            border: Border.all(
                                                color: AppColors.border)))),
                        const SizedBox(width: 10),
                        Text(
                            [
                              'Établissement de la connexion…',
                              'Authentification…',
                              'Synchronisation des données…'
                            ][i],
                            style: TextStyle(
                                fontSize: 12,
                                color: i + 1 <= step
                                    ? AppColors.foreground
                                    : AppColors.mutedFg)),
                      ]),
                      if (i < 2) const SizedBox(height: 10),
                    ],
                  ])))));
}

class PrimaryBtn extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  final Widget? icon;
  final bool loading;
  const PrimaryBtn(this.label,
      {super.key, this.onTap, this.icon, this.loading = false});
  @override
  Widget build(BuildContext context) => SizedBox(
      height: 44,
      width: double.infinity,
      child: ElevatedButton(
          onPressed: loading ? null : onTap,
          child: loading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      color: Colors.white, strokeWidth: 2))
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                      if (icon != null) ...[icon!, const SizedBox(width: 8)],
                      Text(label)
                    ])));
}

class FilterSelect<T> extends StatelessWidget {
  final T value;
  final List<T> values;
  final List<String> labels;
  final Function(T?) onChanged;
  const FilterSelect(
      {super.key,
      required this.value,
      required this.values,
      required this.labels,
      required this.onChanged});
  @override
  Widget build(BuildContext context) => DropdownButton<T>(
        value: value,
        items: List.generate(values.length,
            (i) => DropdownMenuItem(value: values[i], child: Text(labels[i]))),
        onChanged: onChanged,
        underline: const SizedBox(),
        style: const TextStyle(fontSize: 12, color: AppColors.foreground),
        dropdownColor: AppColors.card,
      );
}
