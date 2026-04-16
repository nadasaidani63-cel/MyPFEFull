// lib/utils/theme.dart
// Exact translation of lumen-eye-main/src/index.css CSS variables
import 'package:flutter/material.dart';

class AppColors {
  static const Color primary = Color(0xFFD60000);
  static const Color primaryFg = Colors.white;

  static const Color background = Color(0xFFF7F7F7);
  static const Color card = Color(0xFFFFFFFF);
  static const Color cardFg = Color(0xFF1F1F1F);

  static const Color foreground = Color(0xFF1F1F1F);
  static const Color mutedFg = Color(0xFF737373);
  static const Color muted = Color(0xFFF0F0F0);

  static const Color border = Color(0xFFE0E0E0);
  static const Color input = Color(0xFFE0E0E0);

  static const Color statusNormal = Color(0xFF22B357);
  static const Color statusWarning = Color(0xFFF59E0B);
  static const Color statusCritical = Color(0xFFEB3232);

  static const Color sidebarBg = Color(0xFFFFFFFF);
  static const Color sidebarFg = Color(0xFF474747);
  static const Color sidebarBorder = Color(0xFFE8E8E8);
  static const Color sidebarAccent = Color(0xFFF2F2F2);

  static const Color chartRed = Color(0xFFEB3232);
  static const Color chartAmber = Color(0xFFF59E0B);
  static const Color chartBlue = Color(0xFF3B82F6);
  static const Color chartGreen = Color(0xFF22B357);
  static const Color chartOrange = Color(0xFFF97316);

  static Color status(String? s) {
    switch ((s ?? '').toLowerCase()) {
      case 'warning':
        return statusWarning;
      case 'alert':
      case 'critical':
        return statusCritical;
      default:
        return statusNormal;
    }
  }

  static Color statusBg(String? s) => status(s).withOpacity(0.1);
  static Color statusBorder(String? s) => status(s).withOpacity(0.3);
}

class AppTheme {
  static ThemeData get light => ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        scaffoldBackgroundColor: AppColors.background,
        colorScheme: const ColorScheme.light(
          primary: AppColors.primary,
          onPrimary: Colors.white,
          surface: AppColors.card,
          onSurface: AppColors.foreground,
          outline: AppColors.border,
        ),
        fontFamily: 'Inter',
        textTheme: const TextTheme(
          displayLarge: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w800,
            color: AppColors.foreground,
          ),
          headlineLarge: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w700,
            color: AppColors.foreground,
          ),
          headlineMedium: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppColors.foreground,
          ),
          titleLarge: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: AppColors.foreground,
          ),
          titleMedium: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.foreground,
          ),
          bodyLarge: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w400,
            color: AppColors.foreground,
          ),
          bodyMedium: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w400,
            color: AppColors.foreground,
          ),
          bodySmall: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w400,
            color: AppColors.mutedFg,
          ),
          labelSmall: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: AppColors.mutedFg,
            letterSpacing: 0.5,
          ),
        ),
        cardTheme: CardThemeData(
          color: AppColors.card,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: const BorderSide(color: AppColors.border),
          ),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.card,
          foregroundColor: AppColors.foreground,
          elevation: 0,
          surfaceTintColor: Colors.transparent,
          shadowColor: Colors.transparent,
          titleTextStyle: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppColors.foreground,
          ),
          iconTheme: IconThemeData(color: AppColors.mutedFg, size: 20),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.card,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: AppColors.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: AppColors.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
          ),
          hintStyle: const TextStyle(color: AppColors.mutedFg, fontSize: 13),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
            textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.primary,
            side: BorderSide(color: AppColors.primary.withOpacity(0.4)),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
            textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ),
        dividerTheme: const DividerThemeData(
          color: AppColors.border,
          thickness: 1,
          space: 1,
        ),
      );
}

class MetricMeta {
  static const List<String> orderedKeys = [
    'temperature',
    'humidity',
    'pressure',
    'vibration',
    'gasLevel',
  ];

  static const Map<String, String> label = {
    'temperature': 'Temperature',
    'humidity': 'Humidite',
    'pressure': 'Gaz CO2',
    'vibration': 'Vibration',
    'gasLevel': 'Fumee',
    'gas_level': 'Fumee',
  };

  static const Map<String, String> shortLabel = {
    'temperature': 'T',
    'humidity': 'H',
    'pressure': 'CO2',
    'vibration': 'V',
    'gasLevel': 'Fumee',
    'gas_level': 'Fumee',
  };

  static const Map<String, String> unit = {
    'temperature': '°C',
    'humidity': '%',
    'pressure': 'ppm',
    'vibration': 'mm/s',
    'gasLevel': 'ppm',
    'gas_level': 'ppm',
  };

  static Color chartColor(String metric) {
    switch (metric) {
      case 'temperature':
        return AppColors.chartRed;
      case 'humidity':
        return AppColors.chartAmber;
      case 'pressure':
        return AppColors.chartBlue;
      case 'gasLevel':
      case 'gas_level':
        return AppColors.chartGreen;
      default:
        return AppColors.chartOrange;
    }
  }

  static Map<String, double> get warnMin => {
        'temperature': 18,
        'humidity': 40,
        'pressure': 450,
        'vibration': 0,
        'gasLevel': 0,
        'gas_level': 0,
      };

  static Map<String, double> get warnMax => {
        'temperature': 27,
        'humidity': 60,
        'pressure': 900,
        'vibration': 1.2,
        'gasLevel': 90,
        'gas_level': 90,
      };

  static Map<String, double> get alertMin => {
        'temperature': 15,
        'humidity': 30,
        'pressure': 350,
        'vibration': 0,
        'gasLevel': 0,
        'gas_level': 0,
      };

  static Map<String, double> get alertMax => {
        'temperature': 30,
        'humidity': 70,
        'pressure': 1100,
        'vibration': 1.5,
        'gasLevel': 130,
        'gas_level': 130,
      };

  static int fractionDigits(String metric) {
    switch (metric) {
      case 'pressure':
      case 'gasLevel':
      case 'gas_level':
        return 0;
      case 'vibration':
        return 2;
      default:
        return 1;
    }
  }

  static String formatValue(String metric, double? value) {
    if (value == null) return '—';
    return value.toStringAsFixed(fractionDigits(metric));
  }

  static String thresholdLabel(String metric) {
    final unitLabel = unit[metric] ?? '';
    return 'Warning ${_fmt(metric, warnMin[metric])}-${_fmt(metric, warnMax[metric])} $unitLabel · Alert ${_fmt(metric, alertMin[metric])}-${_fmt(metric, alertMax[metric])} $unitLabel';
  }

  static String _fmt(String metric, double? value) {
    if (value == null) return '—';
    return value.toStringAsFixed(fractionDigits(metric));
  }

  static String valueStatus(String metric, double? value) {
    if (value == null) return 'unknown';
    final aMin = alertMin[metric] ?? 0;
    final aMax = alertMax[metric] ?? double.infinity;
    final wMin = warnMin[metric] ?? 0;
    final wMax = warnMax[metric] ?? double.infinity;
    if (value < aMin || value > aMax) return 'alert';
    if (value < wMin || value > wMax) return 'warning';
    return 'normal';
  }
}
