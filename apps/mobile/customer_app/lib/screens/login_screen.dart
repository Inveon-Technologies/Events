import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:inveon_core/inveon_core.dart';

import '../services.dart';

/// Sign in the way the website does: a Booking ID, mobile number or email,
/// then the 6-digit code sent by email and WhatsApp (POST
/// /api/bookings/login/initiate + /verify). No passwords.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.initialIdentifier});

  final String? initialIdentifier;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final _identifier = TextEditingController(text: widget.initialIdentifier);
  final _code = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _sentTo;
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _identifier.dispose();
    _code.dispose();
    _timer?.cancel();
    super.dispose();
  }

  void _countdown(int seconds) {
    _timer?.cancel();
    setState(() => _resendIn = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn = (_resendIn - 1).clamp(0, 999));
      if (_resendIn == 0) t.cancel();
    });
  }

  Future<void> _send() async {
    final id = _identifier.text.trim();
    if (id.isEmpty) return showMessage(context, 'Enter your Booking ID, mobile number or email', error: true);
    setState(() => _busy = true);
    try {
      final sent = await Services.read(context).api.sendLoginCode(id);
      final where = [if (sent.sentTo.isNotEmpty) sent.sentTo, ?sent.sentToWhatsapp].join(' and WhatsApp ');
      setState(() {
        _codeSent = true;
        _sentTo = where;
      });
      _countdown(sent.resendAfterSeconds);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
      if (e.status == 429) _countdown(int.tryParse('${e.body?['retryAfterSeconds']}') ?? 60);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (_code.text.trim().length != 6) return;
    setState(() => _busy = true);
    final services = Services.read(context);
    try {
      final (token, email) = await services.api.verifyLoginCode(_identifier.text.trim(), _code.text.trim());
      await services.signIn(token, email);
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
      _code.clear();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        children: [
          const SizedBox(height: 12),
          const Center(child: InveonWordmark(size: 40)).animate().fadeIn().scale(begin: const Offset(0.8, 0.8)),
          const SizedBox(height: 24),
          Text(_codeSent ? 'Enter your code' : 'Welcome back', style: text.headlineMedium, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(
            _codeSent ? 'We sent a 6-digit code to $_sentTo.' : 'Sign in to see your tickets and get booking updates.',
            style: text.bodyMedium?.copyWith(color: InveonColors.slate),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 28),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 350),
            transitionBuilder: (c, a) => FadeTransition(
              opacity: a,
              child: SlideTransition(
                position: Tween(begin: const Offset(0.15, 0), end: Offset.zero).animate(a),
                child: c,
              ),
            ),
            child: _codeSent
                ? Column(
                    key: const ValueKey('code'),
                    children: [
                      TextField(
                        controller: _code,
                        autofocus: true,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        textAlign: TextAlign.center,
                        autofillHints: const [AutofillHints.oneTimeCode],
                        style: text.headlineMedium?.copyWith(letterSpacing: 14),
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        decoration: const InputDecoration(counterText: '', hintText: '••••••'),
                        onChanged: (v) {
                          if (v.length == 6) _verify();
                        },
                      ),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _busy ? null : _verify, child: _busy ? const _Spinner() : const Text('Verify & sign in')),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          TextButton(onPressed: () => setState(() => _codeSent = false), child: const Text('Change')),
                          TextButton(
                            onPressed: _resendIn > 0 || _busy ? null : _send,
                            child: Text(_resendIn > 0 ? 'Resend in ${_resendIn}s' : 'Resend code'),
                          ),
                        ],
                      ),
                    ],
                  )
                : Column(
                    key: const ValueKey('id'),
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('BOOKING ID, MOBILE OR EMAIL', style: text.labelSmall?.copyWith(color: InveonColors.slate)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _identifier,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _send(),
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.badge_outlined),
                          hintText: 'e.g. INV-2026-AB12CD or 98765 43210',
                        ),
                      ),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _busy ? null : _send, child: _busy ? const _Spinner() : const Text('Send login code')),
                      const SizedBox(height: 16),
                      Text(
                        'Use the details from any booking. You will see every booking made with that email.',
                        style: text.bodySmall?.copyWith(color: InveonColors.muted),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();

  @override
  Widget build(BuildContext context) =>
      const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white));
}
