import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/error_view.dart';
import '../providers/profile_provider.dart';
import '../services/profile_service.dart';

/// «Мои покупки» (экран 4.44, задача 6.2).
///
/// Показываем подписки и разовые покупки, новые сверху. Цену НЕ показываем:
/// она живёт в App Store и зависит от страны покупателя (правило проекта —
/// цена только из StoreKit, никогда из нашей базы).
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
            if (purchases.isEmpty) return const _Empty();
            return RefreshIndicator(
              color: AppColors.terracotta,
              onRefresh: () async => ref.invalidate(purchaseHistoryProvider),
              child: ListView.builder(
                padding: const EdgeInsets.all(AppSpacing.screenPadding),
                itemCount: purchases.length,
                itemBuilder: (_, i) => _PurchaseCard(item: purchases[i]),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _PurchaseCard extends StatelessWidget {
  const _PurchaseCard({required this.item});
  final PurchaseItem item;

  String get _title {
    // Сервер отдаёт конкретное название разбора/пакета — показываем его.
    final t = item.title;
    if (t != null && t.isNotEmpty) return t;
    switch (item.itemType) {
      case 'subscription':
        return item.appleProductId.endsWith('season')
            ? 'Сезонная подписка на клуб'
            : 'Месячная подписка на клуб';
      case 'book':
        return 'Аудиоразбор';
      case 'package':
        return 'Пакет разборов';
      case 'archive':
        return 'Доступ к архиву';
      default:
        return 'Покупка';
    }
  }

  String get _statusLabel {
    switch (item.status) {
      case 'active':
        return 'Активна';
      case 'expired':
        return 'Истекла';
      case 'refunded':
        return 'Возврат';
      case 'cancelled':
        return 'Отменена';
      default:
        return item.status;
    }
  }

  Color get _statusColor {
    switch (item.status) {
      case 'active':
        return AppColors.success;
      case 'refunded':
      case 'cancelled':
        return AppColors.error;
      default:
        return AppColors.textTertiary;
    }
  }

  String _fmt(DateTime? dt) {
    if (dt == null) return '—';
    final l = dt.toLocal();
    final dd = l.day.toString().padLeft(2, '0');
    final mm = l.month.toString().padLeft(2, '0');
    return '$dd.$mm.${l.year}';
  }

  /// Маршрут на экран разбора/пакета, если покупка кликабельна.
  /// У подписок/архива targetId == null — карточка не кликабельна.
  String? get _route {
    final id = item.targetId;
    if (id == null) return null;
    if (item.itemType == 'book') return Routes.book(id);
    if (item.itemType == 'package') return Routes.package(id);
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final route = _route;

    final inner = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(_title, style: AppTypography.bodyMedium),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.surfaceMedium,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _statusLabel,
                  style: AppTypography.micro.copyWith(
                    color: _statusColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (route != null) ...[
                const SizedBox(width: 4),
                const Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: AppColors.textTertiary,
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Оформлено: ${_fmt(item.purchasedAt)}'
            '${item.expiresAt != null ? ' · действует до ${_fmt(item.expiresAt)}' : ''}',
            style: AppTypography.caption,
          ),
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
