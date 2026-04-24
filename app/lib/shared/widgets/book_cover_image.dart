import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/constants/app_spacing.dart';

/// Универсальный виджет обложки книги.
///
/// Обрабатывает 3 случая:
/// 1. `coverImageUrl` начинается с `asset://` → Image.asset (Flutter-ассет)
/// 2. `coverImageUrl` начинается с `http://` или `https://` → Image.network
/// 3. `coverImageUrl` пустой или файл не загрузился → fallback
///    (градиент из gradientColors + буквы из label).
///
/// См. AI-CONTEXT → РАСХОЖДЕНИЯ С MASTER.md (префикс asset://).
class BookCoverImage extends StatelessWidget {
  const BookCoverImage({
    super.key,
    required this.imageUrl,
    required this.gradientColors,
    this.label = '',
    this.width,
    this.height,
    this.borderRadius = AppSpacing.radiusCard,
    this.fit = BoxFit.cover,
  });

  final String imageUrl;
  final List<String> gradientColors;
  final String label;
  final double? width;
  final double? height;
  final double borderRadius;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: SizedBox(
        width: width,
        height: height,
        child: _buildContent(),
      ),
    );
  }

  Widget _buildContent() {
    if (imageUrl.startsWith('asset://')) {
      final assetPath = 'assets/${imageUrl.substring('asset://'.length)}';
      return Image.asset(
        assetPath,
        fit: fit,
        errorBuilder: (_, __, ___) => _fallback(),
      );
    }

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return Image.network(
        imageUrl,
        fit: fit,
        loadingBuilder: (context, child, loadingProgress) {
          if (loadingProgress == null) return child;
          return Container(color: AppColors.surfaceLight);
        },
        errorBuilder: (_, __, ___) => _fallback(),
      );
    }

    return _fallback();
  }

  Widget _fallback() {
    final colors = gradientColors.map(_hexToColor).toList();
    if (colors.length < 2) {
      colors.addAll([AppColors.darkCoffee, AppColors.lightCoffee]);
    }

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colors.take(2).toList(),
        ),
      ),
      alignment: Alignment.center,
      child: label.isEmpty
          ? null
          : Text(
              label.toUpperCase(),
              style: AppTypography.serifHeadline.copyWith(
                color: Colors.white,
                fontSize: _labelFontSize(),
              ),
            ),
    );
  }

  double _labelFontSize() {
    final w = width ?? height ?? 160;
    return (w / 4).clamp(16.0, 48.0);
  }

  Color _hexToColor(String hex) {
    var cleaned = hex.replaceFirst('#', '');
    if (cleaned.length == 6) cleaned = 'FF$cleaned';
    final value = int.tryParse(cleaned, radix: 16);
    return value == null ? AppColors.darkCoffee : Color(value);
  }
}
