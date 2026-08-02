import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../../../shared/widgets/error_view.dart';
import '../../catalog/widgets/package_card.dart' show razborWord;
import '../providers/profile_provider.dart';
import '../services/profile_service.dart';

/// «Мои покупки» (экран 4.44, задача 6.2).
///
/// Две секции: «Подписка» (клуб) и «Разборы и пакеты» (разовые покупки).
/// У разовых покупок — обложка (реальная, из каталога), название и подпись
/// (автор / число разборов + дата). Цену НЕ показываем: она живёт в App Store
/// и зависит от страны (правило проекта — цена только из StoreKit).
class MyPurchasesScreen extends ConsumerWidget {
  const MyPurchasesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final purchasesAsync = ref.watch(purchaseHistoryProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('Мои покупки', style: AppTypography.screenTitle),
      ),
      body: SafeArea(
        child: purchasesAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(
              color: AppColors.terracotta,
              strokeWidth: 2.5,
            ),
          ),
          error: (_, __) => ErrorView(
            message: 'Не удалось загрузить покупки',
            onRetry: () => ref.invalidate(purchaseHistoryProvider),
          ),
          data: (purchases) {
            final subs = purchases
                .where((p) => p.itemType == 'subscription')
                .toList(growable: false);
            final items = purchases
                .where((p) => p.itemType != 'subscription')
                .toList(growable: false);

            if (subs.isEmpty && items.isEmpty) return const _Empty();

            return RefreshIndicator(
              color: AppColors.terracotta,
              onRefresh: () async => ref.invalidate(purchaseHistoryProvider),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenPadding,
                  4,
                  AppSpacing.screenPadding,
                  24,
                ),
                children: [
                  if (subs.isNotEmpty) ...[
                    const _SectionLabel('Подписка'),
                    ...subs.map((s) => _SubscriptionCard(item: s)),
                  ],
                  if (items.isNotEmpty) ...[
                    if (subs.isNotEmpty) const SizedBox(height: 8),
                    const _SectionLabel('Разборы и пакеты'),
                    ...items.map((i) => _ItemCard(item: i)),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

// ─────────────────────────── SECTION LABEL ───────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 16, 4, 10),
      child: Text(
        text.toUpperCase(),
        style: AppTypography.caption.copyWith(
          color: AppColors.textSecondary,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

// ─────────────────────────── SUBSCRIPTION CARD ───────────────────────────

class _SubscriptionCard extends StatelessWidget {
  const _SubscriptionCard({required this.item});
  final PurchaseItem item;

  String get _title => item.appleProductId.endsWith('season')
      ? 'Сезонная подписка на клуб'
      : 'Месячная подписка на клуб';

  @override
  Widget build(BuildContext context) {
    final expires = item.expiresAt;
    final meta = expires != null
        ? 'Действует до ${_fmtDate(expires)}'
        : 'Оформлено ${_fmtDate(item.purchasedAt)}';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.beigeDeep),
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: AppColors.terracotta,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.workspace_premium_outlined,
              color: Colors.white,
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _title,
                  style: AppTypography.bodyMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Text(meta, style: AppTypography.caption),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _StatusTag(status: item.status),
        ],
      ),
    );
  }
}

// ─────────────────────────── ITEM CARD (book / package) ───────────────────────────

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item});
  final PurchaseItem item;

  String? get _route {
    final id = item.targetId;
    if (id == null) return null;
    if (item.itemType == 'book') return Routes.book(id);
    if (item.itemType == 'package') return Routes.package(id);
    return null;
  }

  String get _meta {
    final date = _fmtDate(item.purchasedAt);
    if (item.itemType == 'package') {
      final n = item.bookCount ?? 0;
      return n > 0 ? '$n ${razborWord(n)} · оформлено $date' : 'оформлено $date';
    }
    // book
    final author = item.author;
    return author != null
        ? '$author · оформлено $date'
        : 'оформлено $date';
  }

  @override
  Widget build(BuildContext context) {
    final route = _route;
    final showTag = item.status != 'active';

    final inner = Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.beigeDeep),
      ),
      child: Row(
        children: [
          _CoverThumb(cover: item.cover),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  item.title ?? 'Покупка',
                  style: AppTypography.bodyMedium,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Text(
                  _meta,
                  style: AppTypography.caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          if (showTag) ...[
            const SizedBox(width: 8),
            _StatusTag(status: item.status),
          ],
          if (route != null) ...[
            const SizedBox(width: 4),
            const Icon(
              Icons.chevron_right,
              size: 20,
              color: AppColors.textTertiary,
            ),
          ],
        ],
      ),
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: route == null
          ? inner
          : Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
              child: InkWell(
                onTap: () => context.push(route),
                borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                child: inner,
              ),
            ),
    );
  }
}

/// Обложка покупки 48×68. Реальный ассет/сеть через BookCoverImage, иначе
/// градиент + label (тот же фоллбек, что в каталоге). Нет обложки (подписка не
/// сюда попадает, но на всякий) — нейтральная плашка с иконкой.
class _CoverThumb extends StatelessWidget {
  const _CoverThumb({required this.cover});
  final PurchaseCover? cover;

  @override
  Widget build(BuildContext context) {
    final c = cover;
    if (c == null) {
      return Container(
        width: 48,
        height: 68,
        decoration: BoxDecoration(
          color: AppColors.surfaceMedium,
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Icon(
          Icons.receipt_long_outlined,
          color: AppColors.textTertiary,
          size: 22,
        ),
      );
    }
    return BookCoverImage(
      imageUrl: c.coverImageUrl,
      gradientColors: c.coverGradientColors,
      label: c.coverLabel,
      width: 48,
      height: 68,
      borderRadius: 8,
    );
  }
}

// ─────────────────────────── STATUS TAG ───────────────────────────

class _StatusTag extends StatelessWidget {
  const _StatusTag({required this.status});
  final String status;

  String get _label {
    switch (status) {
      case 'active':
        return 'Активна';
      case 'expired':
        return 'Истекла';
      case 'refunded':
        return 'Возврат';
      case 'cancelled':
        return 'Отменена';
      default:
        return status;
    }
  }

  Color get _color {
    switch (status) {
      case 'active':
        return AppColors.success;
      case 'refunded':
      case 'cancelled':
        return AppColors.error;
      default:
        return AppColors.textTertiary;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.surfaceMedium,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        _label,
        style: AppTypography.micro.copyWith(
          color: _color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// ─────────────────────────── EMPTY ───────────────────────────

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.receipt_long_outlined,
              size: 48,
              color: AppColors.textTertiary,
            ),
            const SizedBox(height: 12),
            Text(
              'Покупок пока нет',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Здесь появятся ваши подписки и разборы',
              style: AppTypography.caption,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// Дата для UI — «дд.мм.гггг» в локальном времени.
String _fmtDate(DateTime? dt) {
  if (dt == null) return '—';
  final l = dt.toLocal();
  final dd = l.day.toString().padLeft(2, '0');
  final mm = l.month.toString().padLeft(2, '0');
  return '$dd.$mm.${l.year}';
}
