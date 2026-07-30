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
import '../providers/packages_provider.dart';
import '../widgets/package_card.dart';

/// Экран пакета разборов (MASTER 3.9).
///
/// Показывает обложку, название, описание, цену, кнопку «Купить пакет»
/// (плейсхолдер — реальная StoreKit-покупка в задаче 3.2, как у разборов) и
/// список входящих разборов (тап → экран книги).
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
        title: Text('Пакет', style: AppTypography.serifSectionTitle),
      ),
      body: async.when(
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

class _PackageBody extends StatelessWidget {
  const _PackageBody({required this.package});

  final PackageModel package;

  @override
  Widget build(BuildContext context) {
    final price = package.displayPriceUsd;
    final buyText = price != null ? 'Купить пакет за $price' : 'Купить пакет';

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
        Text(package.title, style: AppTypography.serifSectionTitle),
        const SizedBox(height: 4),
        Text(
          '${package.bookCount} ${razborWord(package.bookCount)}',
          style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
        ),
        const SizedBox(height: 16),
        AppButton(text: buyText, onPressed: () => _onBuyPressed(context)),
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
        Text('Входит в пакет', style: AppTypography.bodyBold),
        const SizedBox(height: 8),
        ...package.books.map((b) => _PackageBookRow(book: b)),
      ],
    );
  }

  // TODO задача 3.2: покупка пакета через StoreKit (после создания IAP-продуктов в ASC).
  void _onBuyPressed(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Покупка через Apple появится в Фазе 3'),
        duration: Duration(seconds: 2),
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
