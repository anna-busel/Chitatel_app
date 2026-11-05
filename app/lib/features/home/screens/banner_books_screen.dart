import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../../catalog/widgets/book_grid_card.dart';

/// Данные для экрана-подборки (передаются в GoRoute через `extra`).
class BannerBooksArgs {
  const BannerBooksArgs({required this.title, required this.books});

  final String title;
  final List<BookModel> books;
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
class BannerBooksScreen extends StatelessWidget {
  const BannerBooksScreen({super.key, this.args});

  final BannerBooksArgs? args;

  @override
  Widget build(BuildContext context) {
    final books = args?.books ?? const <BookModel>[];
    final title = (args?.title ?? '').trim();

    const horizontalPadding = AppSpacing.screenPadding;
    const crossAxisSpacing = 12.0;
    final screenWidth = MediaQuery.of(context).size.width;
    final coverWidth =
        (screenWidth - horizontalPadding * 2 - crossAxisSpacing) / 2;
    // Как в каталоге: обложка 2:3 + подписи (~100).
    final cardHeight = coverWidth * 1.5 + 100;

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
              child: books.isEmpty
                  ? Center(
                      child: Text(
                        'Подборка недоступна',
                        style: AppTypography.caption,
                      ),
                    )
                  : GridView.builder(
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
                      itemCount: books.length,
                      itemBuilder: (context, index) => BookGridCard(
                        book: books[index],
                        coverWidth: coverWidth,
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
