import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/app_button.dart';
import '../../payments/providers/product_purchase_provider.dart';

/// Шторка покупки в плеере — поднимается, когда закончился 5-мин отрывок-превью
/// (или юзер упёрся в платную часть). «Купить» запускает StoreKit-покупку прямо
/// тут; после оплаты плеер продолжает с места, где кончился отрывок. «Позже»
/// закрывает плеер и возвращает на экран разбора.
///
/// Виджет НЕ закрывает себя сам — коллбеки приходят из player_screen, там же
/// pop шторки + действия с плеером (продолжить / закрыть / открыть пакет).
class PaywallSheet extends ConsumerWidget {
  const PaywallSheet({
    super.key,
    required this.book,
    required this.onPurchased,
    required this.onLater,
    this.onOpenPackage,
  });

  final BookModel book;

  /// Успешно куплено — продолжить воспроизведение (player_screen).
  final VoidCallback onPurchased;

  /// «Позже» — закрыть плеер, вернуться на разбор (player_screen).
  final VoidCallback onLater;

  /// Открыть экран пакета (если разбор входит в пакет). null — кнопку не
  /// показываем.
  final VoidCallback? onOpenPackage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productId = book.appleProductId;
    final price = book.displayPriceUsd;
    final pkg = book.package;

    // Реакция на результат покупки ИМЕННО этого разбора.
    ref.listen<ProductPurchaseState>(productPurchaseProvider, (prev, next) {
      if (productId == null || next.productId != productId) return;
      if (next.status == ProductPurchaseStatus.success) {
        ref.read(productPurchaseProvider.notifier).reset();
        onPurchased();
      } else if (next.status == ProductPurchaseStatus.error) {
        final message = next.errorMessage ?? 'Покупка не завершена';
        ref.read(productPurchaseProvider.notifier).reset();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            duration: const Duration(seconds: 3),
          ),
        );
      }
    });

    final purchase = ref.watch(productPurchaseProvider);
    final isBuying = productId != null &&
        purchase.productId == productId &&
        (purchase.status == ProductPurchaseStatus.purchasing ||
            purchase.status == ProductPurchaseStatus.verifying);

    final buyText = price != null ? 'Купить за $price' : 'Купить разбор';

    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 38,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.beigeDeep,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: AppColors.terracotta.withOpacity(0.10),
                borderRadius: BorderRadius.circular(23),
              ),
              child: const Icon(
                Icons.lock_outline,
                color: AppColors.terracotta,
                size: 22,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Это был бесплатный отрывок',
              style: AppTypography.serifSectionTitle
                  .copyWith(color: AppColors.textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              'Дальше — полный разбор «${book.title}»',
              style: AppTypography.caption.copyWith(
                color: AppColors.textSecondary,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 18),
            AppButton(
              text: buyText,
              onPressed: (productId == null || isBuying)
                  ? null
                  : () => ref.read(productPurchaseProvider.notifier).buy(productId),
              isLoading: isBuying,
            ),
            if (pkg != null && onOpenPackage != null) ...[
              const SizedBox(height: 10),
              AppButton(
                text: 'Взять весь пакет',
                onPressed: onOpenPackage,
                variant: AppButtonVariant.outline,
              ),
            ],
            const SizedBox(height: 4),
            TextButton(
              onPressed: onLater,
              child: Text(
                'Позже',
                style: AppTypography.button.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
