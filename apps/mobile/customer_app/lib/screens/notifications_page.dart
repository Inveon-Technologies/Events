import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import '../services.dart';
import 'login_screen.dart';
import 'shell.dart';

/// The in-app inbox. Signed-out customers are asked to sign in first,
/// since notifications are about their own bookings.
void openNotificationsPage(BuildContext context) {
  final services = Services.read(context);
  final shell = HomeShell.of(context);
  if (!services.signedIn) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const LoginScreen()));
    return;
  }
  Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (ctx) => NotificationsScreen(
        center: services.notifications,
        onOpen: (data) {
          Navigator.of(ctx).pop();
          shell?.openNotification(data);
        },
      ),
    ),
  );
}
