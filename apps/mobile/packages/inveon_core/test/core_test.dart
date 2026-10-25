import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:inveon_core/inveon_core.dart';

void main() {
  group('format', () {
    test('rupees drops paise only when there are none', () {
      expect(rupees(129900), '₹1,299');
      expect(rupees(129950), '₹1,299.50');
      expect(rupees(null), '—');
    });

    test('event times are shown in IST', () {
      expect(eventTime('2026-12-12T00:00:00.000Z'), '5:30 AM IST');
    });

    test('initials', () {
      expect(initials('Pranav Sutar'), 'PS');
      expect(initials('asha'), 'A');
    });
  });

  group('update prompt', () {
    AppRelease release({bool required = false}) => AppRelease.fromJson({
      'latestVersion': '1.2.0',
      'updateAvailable': true,
      'updateRequired': required,
      'storeUrl': 'https://play.google.com/store/apps/details?id=x',
      'releaseNotes': ['Faster check-in', 'Dark tickets'],
    });

    Future<void> pump(WidgetTester tester, Widget child) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: SingleChildScrollView(child: child)),
        ),
      );
      await tester.pump(const Duration(seconds: 2));
    }

    testWidgets("lists what's new and can be postponed", (tester) async {
      var later = false;
      await pump(tester, UpdateSheet(release: release(), currentVersion: '1.0.0', onUpdate: () {}, onLater: () => later = true));
      expect(find.text('New version available'), findsOneWidget);
      expect(find.text('Faster check-in'), findsOneWidget);
      await tester.tap(find.text('Later'));
      expect(later, isTrue);
    });

    testWidgets('a required update cannot be postponed', (tester) async {
      await pump(tester, UpdateSheet(release: release(required: true), currentVersion: '0.9.0', onUpdate: () {}));
      expect(find.text('Update required'), findsOneWidget);
      expect(find.text('Later'), findsNothing);
    });
  });

  testWidgets('onboarding walks through the slides and finishes', (tester) async {
    var finished = false;
    await tester.pumpWidget(
      MaterialApp(
        home: InveonOnboarding(
          onFinish: () => finished = true,
          slides: const [
            OnboardingSlide(title: 'One', body: 'First', visual: SizedBox()),
            OnboardingSlide(title: 'Two', body: 'Second', visual: SizedBox()),
          ],
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('One'), findsOneWidget);
    await tester.tap(find.text('Next'));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.text('Two'), findsOneWidget);
    await tester.tap(find.text('Get Started'));
    expect(finished, isTrue);
  });
}
