import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../player/providers/player_provider.dart';

/// Список частей разбора для экрана книги (MASTER 4.12–4.14).
///
/// Поведение зависит от состояния:
/// - **Бесплатная** (`isFree=true`): все части открыты, иконка play.
/// - **Платная** (`isPurchased=false`): первая часть (или `freeChapterIndex`)
///   с пометкой «Превью», остальные с замком и opacity 40%.
/// - **Купленная** (`isPurchased=true`): прослушанные с галочкой, остальные с play.
///
/// Подсветка активной части (задача 2.7):
/// - Если плеер сейчас играет часть из этой же книги — у активной строки
///   иконка слева заменяется на `Icons.graphic_eq` (статичный equalizer).
/// - Стандарт Apple Music / Apple Books / Audible.
/// - Состояние слушается через playerUiStateProvider — реактивно.
///
/// onTap вызывается с номером части. Заблокированные части — не нажимаются.
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

    // Определяем номер активной части (если плеер играет ЭТУ книгу).
    // ref.watch — реактивно обновляется когда меняется часть в плеере.
    final playerState = ref.watch(playerUiStateProvider).valueOrNull;
    final int? activePartNumber =
        (playerState != null && playerState.book?.id == book.id)
            ? playerState.partNumber
            : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Содержание', style: AppTypography.sectionHeader),
        const SizedBox(height: 12),
        ...book.parts.map(
          (part) => _buildPartRow(part, isActive: part.number == activePartNumber),
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
    final bool isPreview = !isPurchased && !book.isFree && part.isPreviewAvailable;

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
                        if (isPreview) ...[
                          const SizedBox(width: 8),
                          _previewBadge(),
                        ],
                        if (isActive) ...[
                          const SizedBox(width: 8),
                          _playingBadge(),
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
    // Активная часть имеет приоритет над isListened (если та же часть играет
    // повторно — показываем что играет, а не что прослушана).
    if (isLocked) {
      return Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppColors.surfaceMedium,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.lock_outline,
            size: 18, color: AppColors.textTertiary),
      );
    }

    if (isActive) {
      // Equalizer-индикатор: стандарт Apple Music / Apple Books / Audible.
      // Терракотовый фон — тот же что у play (визуальная связь).
      return Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(
          color: AppColors.terracotta,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.graphic_eq, size: 22, color: Colors.white),
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

  /// Бейдж «СЕЙЧАС» рядом с активной частью. Помогает юзеру быстро
  /// идентифицировать активную часть даже если equalizer-иконка не считалась.
  Widget _playingBadge() {
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
}
