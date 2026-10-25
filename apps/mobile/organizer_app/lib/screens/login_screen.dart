import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:inveon_core/inveon_core.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services.dart';

/// Organizer sign-in with the same email and password as the web portal
/// (POST /api/auth/login). Gate volunteers sign in here too.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _hidden = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Services.read(context).signIn(_email.text.trim(), _password.text);
      HapticFeedback.mediumImpact();
    } on ApiException catch (e) {
      HapticFeedback.heavyImpact();
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _web(String path) => launchUrl(Uri.parse('${InveonConfig.baseUrl}$path'), mode: LaunchMode.externalApplication);

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final services = Services.of(context);
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFEFF4FF), InveonColors.canvas],
            stops: [0, 0.5],
          ),
        ),
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 48, 20, 24),
            children: [
              const Center(child: InveonWordmark(size: 44, subtitle: 'ORGANIZER'))
                  .animate()
                  .fadeIn(duration: 500.ms)
                  .scale(begin: const Offset(0.85, 0.85)),
              const SizedBox(height: 28),
              Text('Welcome back', style: text.headlineMedium, textAlign: TextAlign.center).animate().fadeIn(delay: 150.ms),
              const SizedBox(height: 6),
              Text(
                'Sign in to your organizer workspace',
                style: text.bodyMedium?.copyWith(color: InveonColors.slate),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              if (services.sessionExpired)
                const Padding(
                  padding: EdgeInsets.only(bottom: 12),
                  child: StatusPill('Your session expired. Please sign in again.', tone: PillTone.orange),
                ),
              InveonCard(
                padding: const EdgeInsets.all(20),
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('EMAIL ADDRESS', style: text.labelSmall?.copyWith(color: InveonColors.slate)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(prefixIcon: Icon(Icons.mail_outline_rounded), hintText: 'name@company.com'),
                      ),
                      const SizedBox(height: 16),
                      Text('PASSWORD', style: text.labelSmall?.copyWith(color: InveonColors.slate)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _password,
                        obscureText: _hidden,
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.lock_outline_rounded),
                          suffixIcon: IconButton(
                            icon: Icon(_hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                            onPressed: () => setState(() => _hidden = !_hidden),
                          ),
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(onPressed: () => _web('/organizer/forgot-password'), child: const Text('Forgot password?')),
                      ),
                      AnimatedSize(
                        duration: const Duration(milliseconds: 250),
                        child: _error == null
                            ? const SizedBox.shrink()
                            : Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: InveonColors.errorBg,
                                  borderRadius: BorderRadius.circular(InveonRadius.md),
                                ),
                                child: Text(
                                  _error!,
                                  style: const TextStyle(color: InveonColors.error, fontWeight: FontWeight.w600),
                                ),
                              ).animate().shakeX(hz: 5, amount: 4),
                      ),
                      FilledButton(
                        onPressed: _busy ? null : _submit,
                        child: _busy
                            ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                            : const Text('Login'),
                      ),
                    ],
                  ),
                ),
              ).animate().fadeIn(delay: 250.ms).slideY(begin: 0.1),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('New organizer?', style: text.bodyMedium?.copyWith(color: InveonColors.slate)),
                  TextButton(onPressed: () => _web('/organizer/signup'), child: const Text('Create an account')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
