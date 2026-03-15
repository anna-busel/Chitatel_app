import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/constants/app_spacing.dart';
import '../../core/constants/app_sizes.dart';

/// Текстовое поле приложения ЧИТАТЕЛЬ.
/// Источник: MASTER.md секция 5.4 (Input)
///
/// Фон: #F0EDE8, скругление: 12px, padding: 12px 16px, minHeight: 48px.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    this.controller,
    this.placeholder,
    this.obscureText = false,
    this.keyboardType,
    this.maxLines = 1,
    this.onChanged,
    this.autofocus = false,
    this.readOnly = false,
    this.suffix,
  });

  final TextEditingController? controller;
  final String? placeholder;
  final bool obscureText;
  final TextInputType? keyboardType;
  final int? maxLines;
  final ValueChanged<String>? onChanged;
  final bool autofocus;
  final bool readOnly;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: AppSizes.inputMinHeight),
      decoration: BoxDecoration(
        color: AppColors.surfaceMedium,
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
      ),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        maxLines: maxLines,
        onChanged: onChanged,
        autofocus: autofocus,
        readOnly: readOnly,
        style: AppTypography.inputText,
        decoration: InputDecoration(
          hintText: placeholder,
          hintStyle: AppTypography.inputPlaceholder,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: AppSizes.inputPaddingH,
            vertical: AppSizes.inputPaddingV,
          ),
          suffixIcon: suffix,
        ),
      ),
    );
  }
}
