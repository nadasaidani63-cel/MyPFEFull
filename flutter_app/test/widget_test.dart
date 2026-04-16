// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sentinel_iot/main.dart';

void main() {
  testWidgets('App renders shell without crashing', (WidgetTester tester) async {
    await tester.pumpWidget(const SentinelApp());
    await tester.pumpAndSettle();

    // Basic smoke checks: app is a MaterialApp and shows at least one Scaffold.
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.byType(Scaffold), findsWidgets);
  });
}
