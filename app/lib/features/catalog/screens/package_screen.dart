import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/models/package_model.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../../../shared/widgets/error_view.dart';
import '../../auth/providers/auth_provider.dart';
import '../../book/providers/book_provider.dart';
import '../../payments/providers/product_purchase_provider.dart';
import '../../profile/providers/profile_provider.dart';
import '../providers/catalog_provider.dart';
import '../providers/packages_provider.dart';
import '../widgets/package_card.dart';

/// Экран пакета разборов (MASTER 3.9).
///
/// Показывает обложку, название, описание, цену, кнопку «Купить пакет»
/// (StoreKit 2 покупка через productPurchaseProvider, как у разборов) и
/// список входящих разборов (тап → экран книги). После покупки пакет
/// открывает входящие разборы (сервер: purchasedPackages → userHasBookAccess),
/// а кнопка «Купить пакет» заменяется подписью «У вас есть доступ» (сервер
/// отдаёт package.hasAccess в GET /packages/:id).
class PackageScreen extends ConsumerWidget {
  const PackageScreen({super.key, required this.packageId});

  final String packageId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(packageDetailProvider(packageId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        foregroundColor: AppColors.textPrimary,
      ),
      body: async.when(
        skipLoadingOnReload: true,
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.terracotta),
        ),
        error: (_, __) => ErrorView(
          message: 'Не удалось загрузить пакет',
          onRetry: () => ref.invalidate(packageDetailProvider(packageId)),
        ),
        data: (pkg) => _PackageBody(package: pkg),
      ),
    );
  }
}

class _PackageBody extends ConsumerWidget {
  const _PackageBody({required this.package});

  final PackageModel package;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final price = package.displayPriceUsd;
    final buyText = price != null ? 'Купить пакет за $price' : 'Купить пакет';
    final productId = package.appleProductId;

    // Реакция на результат покупки ИМЕННО этого пакета (провайдер общий на все
    // товары, поэтому сверяем productId).
    ref.listen<ProductPurchaseState>(productPurchaseProvider, (prev, next) {
      if (productId == null || next.productId != productId) return;
      if (next.status == ProductPurchaseStatus.success ||
          next.status == ProductPurchaseStatus.restored) {
        // restored — пакет уже был куплен (Sandbox повторная покупка / restore).
        // Доступ у сервера уже есть; обновляем UI так же, как после покупки.
        final restored = next.status == ProductPurchaseStatus.restored;
        ref.read(productPurchaseProvider.notifier).reset();
        // Пакет открывает входящие разборы (сервер: purchasedPackages →
        // userHasBookAccess). Обновляем детали пакета (package.hasAccess → true,
        // кнопка сменится подписью), историю покупок и провайдеры входящих
        // разборов, чтобы доступ подхватился сразу.
        ref.invalidate(packageDetailProvider(package.id));
        ref.invalidate(purchaseHistoryProvider);
        for (final book in package.books) {
          ref.invalidate(bookProvider(book.id));
        }
        // Каталог держит книги/пакеты отдельно и сам не перезагружается —
        // просим перечитать: карточки входящих разборов и самого пакета
        // сменятся на «Куплено» сразу после возврата в каталог.
        ref.read(catalogProvider.notifier).load();
        ref.invalidate(packagesProvider);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              restored ? 'Покупка восстановлена' : 'Пакет открыт — разборы доступны',
            ),
            duration: const Duration(seconds: 2),
          ),
        );
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

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenPadding),
      children: [
        Center(
          child: BookCoverImage(
            imageUrl: package.coverImageUrl,
            gradientColors: package.coverGradientColors,
            label: package.coverLabel,
            width: 160,
            height: 240,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          package.typeLabel,
          style: AppTypography.badge.copyWith(
            color: AppColors.terracotta,
            fontSize: 10,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 6),
        Text(package.title, style: AppTypography.serifSectionTitle),
        const SizedBox(height: 4),
        Text(
          '${package.bookCount} ${razborWord(package.bookCount)}',
          style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
        ),
        const SizedBox(height: 16),
        // Куплен → тёмно-зелёная «кнопка» «Куплено» на месте «Купить пакет»
        // (не нажимается — разборы слушаются со своих экранов, они уже
        // разблокированы). Иначе — кнопка покупки.
        if (package.hasAccess)
          const _BoughtButton()
        else
          AppButton(
            text: buyText,
            onPressed: productId != null
                ? () {
                    if (ref.read(authProvider).status !=
                        AuthStatus.authenticated) {
                      context.push(Routes.login);
                      return;
                    }
                    ref.read(productPurchaseProvider.notifier).buy(productId);
                  }
                : null,
            isLoading: isBuying,
          ),
        const SizedBox(height: 20),
        if (package.description.isNotEmpty) ...[
          Text(
            package.description,
            style: AppTypography.bodyMedium.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 20),
        ],
        Text('Входит в набор', style: AppTypography.bodyBold),
        const SizedBox(height: 8),
        ...package.books.map((b) => _PackageBookRow(book: b)),
      ],
    );
  }
}

/// Тёмно-зелёная «кнопка» статуса «Куплено» — той же формы/размера, что
/// AppButton, но не интерактивная. Показывается на месте «Купить пакет» сразу
/// после покупки (package.hasAccess).
class _BoughtButton extends StatelessWidget {
  const _BoughtButton();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.freeBadge,
          borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_rounded, color: Colors.white, size: 20),
            const SizedBox(width: 8),
            Text(
              'Куплено',
              style: AppTypography.button.copyWith(color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }
}

class _PackageBookRow extends StatelessWidget {
  const _PackageBookRow({required this.book});

  final BookModel book;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.push(Routes.book(book.id)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            BookCoverImage(
              imageUrl: book.coverImageUrl,
              gradientColors: book.coverGradientColors,
              label: book.coverLabel,
              width: 44,
              height: 66,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    book.title,
                    style: AppTypography.bodyMedium,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  // Автор скрыт, если пустой (у биографий автора нет).
                  if (book.author.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      book.author,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.textSecondary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right,
              color: AppColors.textTertiary,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}
