import 'package:flutter/material.dart';
import '../../../core/theme/app_typography.dart';

/// Плашка акции на обложке (1.0.5, 12.11.2026): «ЧЁРНАЯ ПЯТНИЦА» и т.п.
/// Текст — название подборки из админки (promoBadgesProvider).
class PromoBadge extends StatelessWidget {
  const PromoBadge({super.key, required this.label, required this.maxWidth});

  final String label;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: AppTypography.badge.copyWith(color: Colors.white),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}
