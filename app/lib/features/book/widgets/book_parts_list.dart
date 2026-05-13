import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../player/providers/player_provider.dart';

/// Список частей разбора для экрана книги (MASTER 4.12–4.14).
///
/// Состояния иконки слева (приоритет сверху вниз):
/// - 🔒 **lock** — заблокирована (платная не куплена, нет превью)
/// - 🎵 **graphic_eq** — СЕЙЧАС ИГРАЕТ (Apple Music/Books/Audible стандарт)
/// - ✅ **check** — прослушана (есть в listenedPartNumbers)
/// - ▶ **play** — обычная (терракота)
///
/// Активная часть определяется через playerUiStateProvider:
/// book.id == state.book.id && part.number == state.partNumber.
///
/// При этом в строке с заголовком "Часть N" рядом появляется бейдж "СЕЙЧАС"
/// чтобы юзер заметил даже если иконка не в фокусе.
class BookPartsList extends ConsumerWidget {
  const BookPartsList({
    super.key,
    required this.book,
    required this.isPurchased,
    this.listenedPartNumbers = const {},
    required this.onPartTap,
  });

  final BookModel book;
  final bool isPurchased;
  final Set<int> listenedPartNumbers;
  final ValueChanged<BookPart> onPartTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (book.parts.isEmpty) {
      return _emptyState();
    }

    // Определяем номер сейчас играющей части (если она от этой же книги).
    // null если плеер пуст, играет другую книгу, или ещё не loaded.
    final playingPartNumber = ref.watch(playerUiStateProvider).maybeWhen(
          data: (state) {
            if (!state.hasContent) return null;
            if (state.book?.id != book.id) return null;
            return state.partNumber;
          },
          orElse: () => null,
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Содержание', style: AppTypography.sectionHeader),
        const SizedBox(height: 12),
        ...book.parts.map(
          (part) => _buildPartRow(
            part,
            isActive: part.number == playingPartNumber,
          ),
        ),
      ],
    );
  }

  Widget _emptyState() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Содержание', style: AppTypography.sectionHeader),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surfaceLight,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          ),
          child: Text(
            'Аудио загружается. Скоро здесь появятся части разбора.',
            style: AppTypography.caption,
          ),
        ),
      ],
    );
  }

  Widget _buildPartRow(BookPart part, {required bool isActive}) {
    final bool isLocked = _isPartLocked(part);
    final bool isListened = listenedPartNumbers.contains(part.number);
    final bool isPreview =
        !isPurchased && !book.isFree && part.isPreviewAvailable;

    return Opacity(
      opacity: isLocked ? 0.4 : 1.0,
      child: InkWell(
        onTap: isLocked ? null : () => onPartTap(part),
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            boxShadow: AppColors.cardShadow,
          ),
          child: Row(
            children: [
              _buildLeadingIcon(
                isLocked: isLocked,
                isListened: isListened,
                isActive: isActive,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'Часть ${part.number}',
                          style: AppTypography.microBold.copyWith(
                            color: AppColors.terracotta,
                            letterSpacing: 0.5,
                          ),
                        ),
                        if (isActive) ...[
                          const SizedBox(width: 8),
                          _nowPlayingBadge(),
                        ],
                        if (isPreview && !isActive) ...[
                          const SizedBox(width: 8),
                          _previewBadge(),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      part.title,
                      style: AppTypography.bodyMedium,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                part.displayDuration,
                style: AppTypography.caption,
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Часть заблокирована для платной книги если она не куплена
  /// И эта часть не доступна для превью.
  bool _isPartLocked(BookPart part) {
    if (book.isFree) return false;
    if (isPurchased) return false;
    return !part.isPreviewAvailable;
  }

  Widget _buildLeadingIcon({
    required bool isLocked,
    required bool isListened,
    required bool isActive,
  }) {
    if (isLocked) {
      return Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(
          color: AppColors.surfaceMedium,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.lock_outline,
            size: 18, color: AppColors.textTertiary),
      );
    }

    // Apple Music / Books / Audible стандарт: эквалайзер на терракотовом фоне
    // для активной (сейчас играющей) части.
    if (isActive) {
      return Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(
          color: AppColors.terracotta,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.graphic_eq, size: 20, color: Colors.white),
      );
    }

    if (isListened) {
      return Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(
          color: AppColors.success,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.check, size: 20, color: Colors.white),
      );
    }

    return Container(
      width: 40,
      height: 40,
      decoration: const BoxDecoration(
        color: AppColors.terracotta,
        shape: BoxShape.circle,
      ),
      child: const Icon(Icons.play_arrow, size: 22, color: Colors.white),
    );
  }

  Widget _nowPlayingBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.terracotta,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        'СЕЙЧАС',
        style: AppTypography.badge.copyWith(fontSize: 9),
      ),
    );
  }

  Widget _previewBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.successLight,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        'ПРЕВЬЮ',
        style: AppTypography.badge.copyWith(fontSize: 9),
      ),
    );
  }
}
