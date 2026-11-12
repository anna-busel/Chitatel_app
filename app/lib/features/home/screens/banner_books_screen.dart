import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/models/package_model.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../../catalog/providers/packages_provider.dart';
import '../../catalog/widgets/book_grid_card.dart';
import '../../catalog/widgets/package_card.dart';

/// Данные для экрана-подборки (передаются в GoRoute через `extra`).
class BannerBooksArgs {
  const BannerBooksArgs({
    required this.title,
    required this.books,
    this.packageIds = const [],
  });

  final String title;
  final List<BookModel> books;

  /// Пакеты подборки (1.0.5) — показываются перед разборами.
  final List<String> packageIds;
}

/// Пакеты подборки по id — из общего списка пакетов (цены, hasAccess), в
/// порядке, заданном в админке. Пока список грузится или не загрузился —
/// пусто: разборы подборки видны всё равно.
List<PackageModel> promoPackages(WidgetRef ref, List<String> ids) {
  if (ids.isEmpty) return const [];
  final all = ref.watch(packagesProvider).valueOrNull ?? const <PackageModel>[];
  final byId = {for (final p in all) p.id: p};
  return ids.map((id) => byId[id]).whereType<PackageModel>().toList(growable: false);
}

/// Сетка подборки: сначала пакеты, потом разборы. Общая для экрана баннера
/// и вкладки-акции в каталоге.
class PromoGrid extends StatelessWidget {
  const PromoGrid({
    super.key,
    required this.packages,
    required this.books,
    this.physics,
  });

  final List<PackageModel> packages;
  final List<BookModel> books;
  final ScrollPhysics? physics;

  @override
  Widget build(BuildContext context) {
    const horizontalPadding = AppSpacing.screenPadding;
    const crossAxisSpacing = 12.0;
    final screenWidth = MediaQuery.of(context).size.width;
    final coverWidth =
        (screenWidth - horizontalPadding * 2 - crossAxisSpacing) / 2;
    // Как в каталоге: обложка 2:3 + подписи (~100).
    final cardHeight = coverWidth * 1.5 + 100;
    final count = packages.length + books.length;

    return GridView.builder(
      physics: physics,
      padding: const EdgeInsets.symmetric(
        horizontal: horizontalPadding,
        vertical: 4,
      ).copyWith(bottom: 32),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: crossAxisSpacing,
        mainAxisSpacing: 20,
        mainAxisExtent: cardHeight,
      ),
      itemCount: count,
      itemBuilder: (context, index) => index < packages.length
          ? PackageCard(package: packages[index], coverWidth: coverWidth)
          : BookGridCard(
              book: books[index - packages.length],
              coverWidth: coverWidth,
            ),
    );
  }
}

/// Подборка разборов из баннера на главной (UPDATES-PLAN T, 05.11.2026).
///
/// Простой список: заголовок подборки + сетка 2×N карточек каталога
/// (BookGridCard). Тап по карточке → экран разбора. Цены — как в каталоге:
/// на Android BookGridCard их не показывает (store_policy.dart).
///
/// Данные приходят вместе с баннером (GET /api/home/banners), отдельного
/// запроса нет. Если `extra` потерялся (восстановление состояния) — пустое
/// состояние с кнопкой «Назад».
class BannerBooksScreen extends ConsumerWidget {
  const BannerBooksScreen({super.key, this.args});

  final BannerBooksArgs? args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final books = args?.books ?? const <BookModel>[];
    final packages = promoPackages(ref, args?.packageIds ?? const []);
    final title = (args?.title ?? '').trim();

    const horizontalPadding = AppSpacing.screenPadding;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppTopBar(
              backLabel: 'Назад',
              onBack: () =>
                  context.canPop() ? context.pop() : context.go(Routes.home),
            ),
            if (title.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  horizontalPadding,
                  8,
                  horizontalPadding,
                  16,
                ),
                child: Text(title, style: AppTypography.serifSectionTitle),
              ),
            Expanded(
              child: books.isEmpty &&
                      packages.isEmpty &&
                      (args?.packageIds ?? const []).isNotEmpty &&
                      ref.watch(packagesProvider).isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : books.isEmpty && packages.isEmpty
                  ? Center(
                      child: Text(
                        'Подборка недоступна',
                        style: AppTypography.caption,
                      ),
                    )
                  : PromoGrid(packages: packages, books: books),
            ),
          ],
        ),
      ),
    );
  }
}
