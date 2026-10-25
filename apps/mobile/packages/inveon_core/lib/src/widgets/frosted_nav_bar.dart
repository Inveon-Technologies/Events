import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme.dart';

/// Frosted floating bottom navigation with a sliding indicator
/// (design system "Level 3").
class FrostedNavBar extends StatelessWidget {
  const FrostedNavBar({super.key, required this.items, required this.index, required this.onSelect});

  final List<(IconData, IconData, String)> items;
  final int index;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).padding.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, bottom > 0 ? bottom : 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            height: 68,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.88),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: Colors.white.withValues(alpha: 0.4)),
              boxShadow: const [BoxShadow(color: Color(0x140B132B), blurRadius: 32, offset: Offset(0, -8))],
            ),
            child: LayoutBuilder(
              builder: (context, box) {
                final w = box.maxWidth / items.length;
                return Stack(
                  children: [
                    AnimatedPositioned(
                      duration: const Duration(milliseconds: 350),
                      curve: Curves.easeOutBack,
                      left: w * index + w / 2 - 22,
                      top: 8,
                      child: Container(
                        width: 44,
                        height: 30,
                        decoration: BoxDecoration(color: const Color(0x1A0066FF), borderRadius: BorderRadius.circular(15)),
                      ),
                    ),
                    Row(
                      children: [
                        for (final (i, (icon, active, label)) in items.indexed)
                          Expanded(
                            child: InkResponse(
                              onTap: () => onSelect(i),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  AnimatedScale(
                                    scale: i == index ? 1.12 : 1,
                                    duration: const Duration(milliseconds: 250),
                                    child: Icon(i == index ? active : icon, color: i == index ? InveonColors.primary : InveonColors.slate),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    label,
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: i == index ? FontWeight.w700 : FontWeight.w500,
                                      color: i == index ? InveonColors.primary : InveonColors.slate,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}
