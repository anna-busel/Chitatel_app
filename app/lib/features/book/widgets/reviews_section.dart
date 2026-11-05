import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/network/network_error.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/plural.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/report_sheet.dart';
import '../../auth/providers/auth_provider.dart';
import '../../club/services/block_service.dart';
import '../../profile/providers/profile_provider.dart';
import '../providers/book_provider.dart';
import '../providers/reviews_provider.dart';
import '../services/reviews_service.dart';
import 'review_sheet.dart';

/// Секция «Отзывы» на экране разбора (UPDATES-PLAN C3, 05.11.2026).
///
/// Вставлена в book_screen.dart одним виджетом под списком частей — код
/// покупки не трогаем (в ветке android он отличается, merge должен пройти
/// чисто).
///
/// - средняя оценка и число отзывов;
/// - свой отзыв (если есть) с «Изменить» / «Удалить»;
/// - 3 последних чужих, «Все отзывы» → экран со списком и подгрузкой;
/// - «Оставить отзыв» — только при доступе к разбору (бесплатный или
///   hasAccess) и входе в аккаунт. Без доступа отзывы видны, кнопки нет;
/// - на чужом отзыве меню: «Пожаловаться», «Заблокировать автора», Анне —
///   «Скрыть» (Apple 1.2 / Google UGC).
class ReviewsSection extends ConsumerWidget {
  const ReviewsSection({super.key, required this.book});

  final BookModel book;

  static const int _previewCount = 3;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(reviewsProvider(book.id));
    final isAuthed =
        ref.watch(authProvider).status == AuthStatus.authenticated;
    // Блок-лист — только под аккаунтом: у гостя запрос /users/blocked
    // ушёл бы в 401 → refresh → выход по кругу.
    final blocked =
        isAuthed ? ref.watch(blockedIdsProvider) : const <String>{};
    final canWrite = isAuthed && (book.isFree || book.hasAccess);

    if (!state.isLoaded) {
      if (state.error != null) {
        return _SectionFrame(
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Не удалось загрузить отзывы',
                  style: AppTypography.caption,
                ),
              ),
              TextButton(
                onPressed: () =>
                    ref.read(reviewsProvider(book.id).notifier).refresh(),
                child: Text(
                  'Повторить',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.terracotta,
                  ),
                ),
              ),
            ],
          ),
        );
      }
      return const _SectionFrame(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Center(
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        ),
      );
    }

    final mine = state.myReview;
    final others = state.items
        .where((r) => !r.isMine && !blocked.contains(r.author.id))
        .toList(growable: false);
    final preview = others.take(_previewCount).toList(growable: false);
    final hasMoreToShow = others.length > preview.length || state.hasMore;

    return _SectionFrame(
      trailing: state.reviewCount > 0
          ? _RatingSummary(
              rating: state.rating,
              count: state.reviewCount,
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (canWrite && mine == null) ...[
            AppButton(
              text: 'Оставить отзыв',
              variant: AppButtonVariant.outline,
              onPressed: () => showReviewSheet(context, bookId: book.id),
            ),
            const SizedBox(height: 12),
          ],
          if (mine != null) ...[
            ReviewTile(bookId: book.id, review: mine, highlightMine: true),
            const SizedBox(height: 8),
          ],
          for (final r in preview) ...[
            ReviewTile(bookId: book.id, review: r),
            const SizedBox(height: 8),
          ],
          if (mine == null && preview.isEmpty)
            Text(
              canWrite
                  ? 'Отзывов пока нет. Расскажите, как вам разбор'
                  : 'Отзывов пока нет',
              style: AppTypography.caption,
            ),
          if (hasMoreToShow)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => context.push(Routes.bookReviews(book.id)),
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                child: Text(
                  'Все отзывы (${state.total})',
                  style: AppTypography.bodyMedium.copyWith(
                    color: AppColors.terracotta,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Заголовок «Отзывы» + содержимое.
class _SectionFrame extends StatelessWidget {
  const _SectionFrame({required this.child, this.trailing});

  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Отзывы', style: AppTypography.sectionHeader),
            ),
            if (trailing != null) trailing!,
          ],
        ),
        const SizedBox(height: 12),
        child,
      ],
    );
  }
}

/// «★ 4.6 · 12 отзывов».
class _RatingSummary extends StatelessWidget {
  const _RatingSummary({required this.rating, required this.count});

  final double rating;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.star_rounded, size: 18, color: AppColors.gold),
        const SizedBox(width: 4),
        Text(
          rating.toStringAsFixed(1),
          style: AppTypography.captionMedium.copyWith(
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          '$count ${plural(count, 'отзыв', 'отзыва', 'отзывов')}',
          style: AppTypography.caption,
        ),
      ],
    );
  }
}

/// Одна карточка отзыва — и в секции, и на экране «Все отзывы».
class ReviewTile extends ConsumerWidget {
  const ReviewTile({
    super.key,
    required this.bookId,
    required this.review,
    this.highlightMine = false,
  });

  final String bookId;
  final Review review;

  /// Свой отзыв наверху секции — с подписью «Ваш отзыв».
  final bool highlightMine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAuthed =
        ref.watch(authProvider).status == AuthStatus.authenticated;
    // Профиль у гостя не грузим (401 → выход по кругу), поэтому isAdmin —
    // только под аккаунтом.
    final isAdmin = isAuthed && ref.watch(isAdminProvider);
    final mine = review.isMine;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 4, 12),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(
          color: highlightMine
              ? AppColors.terracotta.withOpacity(0.35)
              : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Avatar(author: review.author),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      highlightMine ? 'Ваш отзыв' : review.author.displayName,
                      style: AppTypography.bodyMedium.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        _Stars(rating: review.rating),
                        if (_dateLabel != null) ...[
                          const SizedBox(width: 8),
                          Text(_dateLabel!, style: AppTypography.small),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              _ReviewMenu(
                bookId: bookId,
                review: review,
                isMine: mine,
                isAuthed: isAuthed,
                isAdmin: isAdmin,
              ),
            ],
          ),
          if (review.text.isNotEmpty) ...[
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Text(
                review.text,
                style: AppTypography.body.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
          if (mine && review.isHidden) ...[
            const SizedBox(height: 8),
            Text(
              'Скрыт модератором — другие участницы его не видят',
              style: AppTypography.small.copyWith(color: AppColors.error),
            ),
          ],
        ],
      ),
    );
  }

  String? get _dateLabel {
    final d = (review.updatedAt ?? review.createdAt)?.toLocal();
    if (d == null) return null;
    String two(int v) => v.toString().padLeft(2, '0');
    return '${two(d.day)}.${two(d.month)}.${d.year}';
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.author});

  final ReviewAuthor author;

  @override
  Widget build(BuildContext context) {
    final url = author.avatarUrl;
    final name = author.displayName;
    return CircleAvatar(
      radius: 18,
      backgroundColor: AppColors.surfaceMedium,
      backgroundImage: url != null ? NetworkImage(url) : null,
      child: url == null
          ? Text(
              name.isNotEmpty ? name.characters.first.toUpperCase() : '?',
              style: AppTypography.bodyMedium,
            )
          : null,
    );
  }
}

class _Stars extends StatelessWidget {
  const _Stars({required this.rating});

  final int rating;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          Icon(
            i <= rating ? Icons.star_rounded : Icons.star_outline_rounded,
            size: 14,
            color: i <= rating ? AppColors.gold : AppColors.textTertiary,
          ),
      ],
    );
  }
}

enum _ReviewAction { edit, delete, report, block, hide }

/// Меню «⋯» на карточке отзыва.
class _ReviewMenu extends ConsumerWidget {
  const _ReviewMenu({
    required this.bookId,
    required this.review,
    required this.isMine,
    required this.isAuthed,
    required this.isAdmin,
  });

  final String bookId;
  final Review review;
  final bool isMine;
  final bool isAuthed;
  final bool isAdmin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = <PopupMenuEntry<_ReviewAction>>[
      if (isMine) ...[
        const PopupMenuItem<_ReviewAction>(
          value: _ReviewAction.edit,
          child: Text('Изменить'),
        ),
        const PopupMenuItem<_ReviewAction>(
          value: _ReviewAction.delete,
          child: Text('Удалить'),
        ),
      ] else ...[
        const PopupMenuItem<_ReviewAction>(
          value: _ReviewAction.report,
          child: Text('Пожаловаться'),
        ),
        if (review.author.id.isNotEmpty)
          const PopupMenuItem<_ReviewAction>(
            value: _ReviewAction.block,
            child: Text('Заблокировать автора'),
          ),
        if (isAdmin)
          const PopupMenuItem<_ReviewAction>(
            value: _ReviewAction.hide,
            child: Text('Скрыть'),
          ),
      ],
    ];

    return PopupMenuButton<_ReviewAction>(
      icon: const Icon(
        Icons.more_horiz,
        size: 20,
        color: AppColors.textSecondary,
      ),
      tooltip: 'Действия',
      itemBuilder: (_) => entries,
      onSelected: (action) => _onAction(context, ref, action),
    );
  }

  Future<void> _onAction(
    BuildContext context,
    WidgetRef ref,
    _ReviewAction action,
  ) async {
    // Жалоба и блокировка — от имени аккаунта: гостя ведём на вход.
    if (!isAuthed) {
      context.push(Routes.login);
      return;
    }
    final notifier = ref.read(reviewsProvider(bookId).notifier);
    // Мессенджер берём заранее: после удаления/скрытия карточка исчезает
    // из списка вместе со своим context.
    final messenger = ScaffoldMessenger.of(context);
    // По той же причине — контейнер вместо ref после await.
    final container = ProviderScope.containerOf(context, listen: false);

    switch (action) {
      case _ReviewAction.edit:
        await showReviewSheet(context, bookId: bookId, existing: review);
      case _ReviewAction.delete:
        final ok = await _confirm(
          context,
          title: 'Удалить отзыв?',
          message: 'Отзыв и оценка исчезнут у всех.',
          action: 'Удалить',
        );
        if (!ok) return;
        try {
          await notifier.deleteMine();
          container.invalidate(bookProvider(bookId));
          _snack(messenger, 'Отзыв удалён');
        } catch (e) {
          _snack(
            messenger,
            userMessageFor(e, fallback: 'Не удалось удалить отзыв'),
            error: true,
          );
        }
      case _ReviewAction.report:
        await showReportSheet(
          context,
          ref,
          targetType: 'review',
          targetId: review.id,
          authorId: review.author.id.isNotEmpty ? review.author.id : null,
          authorName: review.author.name,
          onBlocked: () => notifier.removeAuthor(review.author.id),
        );
      case _ReviewAction.block:
        await confirmAndBlockAuthor(
          context,
          ref,
          userId: review.author.id,
          name: review.author.name,
          onBlocked: () => notifier.removeAuthor(review.author.id),
        );
      case _ReviewAction.hide:
        final ok = await _confirm(
          context,
          title: 'Скрыть отзыв?',
          message: 'Его перестанут видеть все, кроме автора. '
              'Оценка не будет учитываться в рейтинге.',
          action: 'Скрыть',
        );
        if (!ok) return;
        try {
          await notifier.hide(review.id);
          container.invalidate(bookProvider(bookId));
          _snack(messenger, 'Отзыв скрыт');
        } catch (e) {
          _snack(
            messenger,
            userMessageFor(e, fallback: 'Не удалось скрыть отзыв'),
            error: true,
          );
        }
    }
  }

  Future<bool> _confirm(
    BuildContext context, {
    required String title,
    required String message,
    required String action,
  }) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(action, style: const TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    return ok == true;
  }

  void _snack(
    ScaffoldMessengerState messenger,
    String text, {
    bool error = false,
  }) {
    messenger.showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: error ? AppColors.error : AppColors.textPrimary,
    ));
  }
}
