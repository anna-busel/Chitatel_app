import 'package:flutter/material.dart';
import '../../core/constants/app_spacing.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

/// Замочек на карточках каталога и главной вместо цены (только Android, см.
/// store_policy.dart). 17.10.2026: без надписи — «Для участниц» путало:
/// разборы продаются отдельно от клуба.
class MembersOnlyLabel extends StatelessWidget {
  const MembersOnlyLabel({super.key});

  @override
  Widget build(BuildContext context) {
    return const Icon(
      Icons.lock_outline,
      size: 16,
      color: AppColors.textSecondary,
      semanticLabel: 'Закрыто',
    );
  }
}

/// Плашка на экранах разбора / пакета / шторке плеера вместо кнопки покупки.
/// Только Android (см. store_policy.dart). Ни цены, ни магазина, ни ссылок.
class MembersOnlyNote extends StatelessWidget {
  const MembersOnlyNote({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.terracotta.withOpacity(0.08),
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.terracotta.withOpacity(0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.lock_outline, size: 20, color: AppColors.terracotta),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: AppTypography.caption.copyWith(color: AppColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

/// Общий текст: как открыть доступ, если он уже есть.
const String kMembersAccessHint =
    'Если вы уже участница — войдите в тот же аккаунт, с которым вступали '
    'в клуб, и доступ откроется сам.';
