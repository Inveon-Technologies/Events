import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:url_launcher/url_launcher.dart';

class PaymentOutcome {
  PaymentOutcome.success() : ok = true, message = null;
  PaymentOutcome.failed(this.message) : ok = false;

  final bool ok;
  final String? message;
}

/// Opens Cashfree's hosted checkout for an order the API created (POST
/// /events/:id/bookings returns paymentSessionId) in a browser tab, through
/// the website's /pay page (apps/web/src/pages/PaymentHandoffPage).
///
/// The native Cashfree SDK refuses to take payments in apps that weren't
/// installed from the Play Store ("… is not a trusted source"), so sideloaded
/// and test builds couldn't pay. A browser checkout works for any install.
///
/// "Success" here only means the customer came back to the app: the booking
/// is confirmed by Cashfree's webhook, so the caller still polls its status.
Future<PaymentOutcome> payWithCashfree({required String paymentSessionId, required String mode}) async {
  final url = Uri.parse('${InveonConfig.baseUrl}/pay').replace(queryParameters: {'session': paymentSessionId, 'mode': mode});
  final back = Completer<void>();
  final listener = AppLifecycleListener(
    onResume: () {
      if (!back.isCompleted) back.complete();
    },
  );
  try {
    var opened = await launchUrl(url, mode: LaunchMode.inAppBrowserView);
    if (!opened) opened = await launchUrl(url, mode: LaunchMode.externalApplication);
    if (!opened) return PaymentOutcome.failed('Could not open the payment page');
    await back.future;
    return PaymentOutcome.success();
  } catch (_) {
    return PaymentOutcome.failed('Could not open the payment page');
  } finally {
    listener.dispose();
  }
}
