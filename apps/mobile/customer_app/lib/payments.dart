import 'dart:async';

import 'package:flutter_cashfree_pg_sdk/api/cferrorresponse/cferrorresponse.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpayment/cfwebcheckoutpayment.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpaymentgateway/cfpaymentgatewayservice.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfsession/cfsession.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfenums.dart';

class PaymentOutcome {
  PaymentOutcome.success() : ok = true, message = null;
  PaymentOutcome.failed(this.message) : ok = false;

  final bool ok;
  final String? message;
}

/// Opens Cashfree's checkout for an order the API created (POST
/// /events/:id/bookings returns paymentSessionId; the Cashfree order id
/// is the booking reference — see apps/api/src/services/cashfreeOrders.ts).
///
/// "Success" here only means the customer finished the checkout: the
/// booking is confirmed by Cashfree's webhook, so the caller still polls
/// the booking status.
Future<PaymentOutcome> payWithCashfree({required String orderId, required String paymentSessionId, required String mode}) {
  final completer = Completer<PaymentOutcome>();
  final service = CFPaymentGatewayService();
  service.setCallback(
    (_) {
      if (!completer.isCompleted) completer.complete(PaymentOutcome.success());
    },
    (CFErrorResponse error, _) {
      if (!completer.isCompleted) completer.complete(PaymentOutcome.failed(error.getMessage() ?? 'Payment was not completed'));
    },
  );
  try {
    final session = CFSessionBuilder()
        .setEnvironment(mode == 'production' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX)
        .setOrderId(orderId)
        .setPaymentSessionId(paymentSessionId)
        .build();
    service.doPayment(CFWebCheckoutPaymentBuilder().setSession(session).build());
  } catch (e) {
    if (!completer.isCompleted) completer.complete(PaymentOutcome.failed('Could not open the payment page'));
  }
  return completer.future;
}
