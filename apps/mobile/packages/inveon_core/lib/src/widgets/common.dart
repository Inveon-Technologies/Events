import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../api_client.dart';
import '../config.dart';
import '../theme.dart';

/// White card on the canvas, level 1 elevation from the design system.
class InveonCard extends StatelessWidget {
  const InveonCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap, this.radius = InveonRadius.xl});

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(radius),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: InveonColors.outline),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Network image from the API (relative /api/uploads paths are resolved),
/// with a gradient placeholder while loading or when there's no image.
class EventImage extends StatelessWidget {
  const EventImage({super.key, required this.url, this.height, this.width, this.radius = 0, this.fit = BoxFit.cover});

  final String? url;
  final double? height;
  final double? width;
  final double radius;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      height: height,
      width: width,
      decoration: const BoxDecoration(gradient: InveonColors.electricGradient),
      child: const Center(child: Icon(Icons.landscape_rounded, color: Colors.white54, size: 40)),
    );
    final src = InveonConfig.absolute(url);
    final image = src.isEmpty
        ? placeholder
        : CachedNetworkImage(
            imageUrl: src,
            height: height,
            width: width,
            fit: fit,
            fadeInDuration: const Duration(milliseconds: 300),
            placeholder: (_, _) => placeholder,
            errorWidget: (_, _, _) => placeholder,
          );
    return radius == 0 ? image : ClipRRect(borderRadius: BorderRadius.circular(radius), child: image);
  }
}

enum PillTone { blue, green, orange, red, grey }

class StatusPill extends StatelessWidget {
  const StatusPill(this.label, {super.key, this.tone = PillTone.blue, this.dot = false});

  final String label;
  final PillTone tone;
  final bool dot;

  static PillTone toneFor(String status) => switch (status) {
    'confirmed' || 'valid' || 'published' || 'active' || 'checked_in' => PillTone.green,
    'pending' || 'draft' || 'partially_cancelled' => PillTone.orange,
    'cancelled' || 'failed' => PillTone.red,
    'completed' => PillTone.grey,
    _ => PillTone.blue,
  };

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      PillTone.blue => (const Color(0xFFE8F0FF), InveonColors.primary),
      PillTone.green => (InveonColors.successBg, InveonColors.success),
      PillTone.orange => (InveonColors.urgencyBg, InveonColors.secondary),
      PillTone.red => (InveonColors.errorBg, InveonColors.error),
      PillTone.grey => (const Color(0xFFEFF1F5), InveonColors.slate),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
            ).animate(onPlay: (c) => c.repeat(reverse: true)).fade(begin: 1, end: 0.3, duration: 700.ms),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 11.5, letterSpacing: 0.2),
          ),
        ],
      ),
    );
  }
}

/// "Book Now" style amber gradient button.
class AmberButton extends StatelessWidget {
  const AmberButton({super.key, required this.label, required this.onPressed, this.icon, this.busy = false});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: enabled ? 1 : 0.6,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: InveonColors.amberGradient,
          borderRadius: BorderRadius.circular(InveonRadius.lg),
          boxShadow: enabled ? InveonShadows.amberGlow : null,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(InveonRadius.lg),
            onTap: enabled ? onPressed : null,
            child: SizedBox(
              height: 52,
              child: Center(
                child: busy
                    ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            label,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16),
                          ),
                          if (icon != null) ...[const SizedBox(width: 8), Icon(icon, color: Colors.white, size: 20)],
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 8, 8),
      child: Row(
        children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
          if (action != null)
            TextButton(
              onPressed: onAction,
              child: Row(mainAxisSize: MainAxisSize.min, children: [Text(action!), const Icon(Icons.chevron_right_rounded, size: 18)]),
            ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.message, this.action, this.onAction});

  final IconData icon;
  final String title;
  final String message;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: const BoxDecoration(color: InveonColors.surfaceTint, shape: BoxShape.circle),
              child: Icon(icon, size: 44, color: InveonColors.primary),
            ).animate().scale(duration: 500.ms, curve: Curves.easeOutBack),
            const SizedBox(height: 20),
            Text(title, style: text.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              message,
              style: text.bodyMedium?.copyWith(color: InveonColors.slate),
              textAlign: TextAlign.center,
            ),
            if (action != null) ...[
              const SizedBox(height: 20),
              SizedBox(
                width: 220,
                child: FilledButton(onPressed: onAction, child: Text(action!)),
              ),
            ],
          ],
        ).animate().fadeIn(duration: 400.ms),
      ),
    );
  }
}

/// Loads [load] and renders [builder]; shimmer skeleton while loading, a
/// retry state on error, pull-to-refresh once loaded.
class AsyncView<T> extends StatefulWidget {
  const AsyncView({super.key, required this.load, required this.builder, this.skeleton});

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() refresh) builder;
  final Widget? skeleton;

  @override
  State<AsyncView<T>> createState() => AsyncViewState<T>();
}

class AsyncViewState<T> extends State<AsyncView<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    setState(() {
      _loading = _data == null;
      _error = null;
    });
    try {
      final data = await widget.load();
      if (mounted) setState(() => _data = data);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return widget.skeleton ?? const SkeletonList();
    if (_error != null && _data == null) {
      return EmptyState(
        icon: Icons.wifi_off_rounded,
        title: "Couldn't load this",
        message: _error is ApiException ? '$_error' : 'Please check your connection and try again.',
        action: 'Try again',
        onAction: refresh,
      );
    }
    return RefreshIndicator(onRefresh: refresh, child: widget.builder(context, _data as T, refresh));
  }
}

class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 4, this.height = 110});

  final int count;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      physics: const NeverScrollableScrollPhysics(),
      itemCount: count,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, _) => Container(
        height: height,
        decoration: BoxDecoration(color: const Color(0xFFE9EDF5), borderRadius: BorderRadius.circular(InveonRadius.xl)),
      ).animate(onPlay: (c) => c.repeat()).shimmer(duration: 1200.ms, color: Colors.white70),
    );
  }
}

/// Fades and slides list items in one after another.
extension StaggeredEntrance on Widget {
  Widget staggered(int index) =>
      animate().fadeIn(delay: (60 * index.clamp(0, 8)).ms, duration: 350.ms).slideY(begin: 0.12, curve: Curves.easeOutCubic);
}

void showMessage(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), backgroundColor: error ? InveonColors.error : InveonColors.midnight));
}
