import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/shimmer_loading.dart';
import '../../catalog/widgets/book_grid_card.dart';
import '../providers/search_provider.dart';

/// Экран поиска книг. MASTER 4.11.
///
/// Поведение:
/// - Шапка: «← Назад» + поле ввода с автофокусом.
/// - Debounce 300ms перед отправкой запроса (STEP-BY-STEP задача 2.5).
/// - Тело меняется в зависимости от состояния (`SearchPhase`).
///
/// Карточки результатов — те же `BookGridCard` что в каталоге.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _focusNode = FocusNode();
    // Автофокус на поле — клавиатура открывается сразу при входе на экран.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(searchProvider);
    final notifier = ref.read(searchProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SearchHeader(
              controller: _controller,
              focusNode: _focusNode,
              onChanged: notifier.updateQuery,
              onClear: () {
                _controller.clear();
                notifier.clear();
              },
              hasText: state.query.isNotEmpty,
            ),
            const SizedBox(height: 4),
            Expanded(child: _buildBody(state, notifier)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(SearchState state, SearchNotifier notifier) {
    switch (state.phase) {
      case SearchPhase.idle:
        return const _IdleHint();
      case SearchPhase.typing:
      case SearchPhase.loading:
        return const _SearchShimmer();
      case SearchPhase.error:
        return ErrorView(
          message: state.errorMessage ?? 'Не удалось выполнить поиск',
          onRetry: notifier.retry,
        );
      case SearchPhase.success:
        if (state.books.isEmpty) {
          return _NoResults(query: state.query);
        }
        return _SearchResults(books: state.books);
    }
  }
}

// ─────────────────────────── HEADER ───────────────────────────

class _SearchHeader extends StatelessWidget {
  const _SearchHeader({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    required this.onClear,
    required this.hasText,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  final bool hasText;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 8,
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () {
              if (context.canPop()) {
                context.pop();
              } else {
                context.go('/catalog');
              }
            },
            icon: const Icon(
              Icons.arrow_back_ios_new,
              size: 20,
              color: AppColors.terracotta,
            ),
            tooltip: 'Назад',
            constraints: const BoxConstraints(
              minWidth: AppSpacing.minTapTarget,
              minHeight: AppSpacing.minTapTarget,
            ),
          ),
          Expanded(
            child: Container(
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
              ),
              child: Row(
                children: [
                  const SizedBox(width: 12),
                  const Icon(
                    Icons.search,
                    size: 20,
                    color: AppColors.textTertiary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: controller,
                      focusNode: focusNode,
                      onChanged: onChanged,
                      textInputAction: TextInputAction.search,
                      style: AppTypography.body.copyWith(
                        color: AppColors.textPrimary,
                      ),
                      decoration: InputDecoration(
                        isCollapsed: true,
                        border: InputBorder.none,
                        hintText: 'Название, автор, тема',
                        hintStyle: AppTypography.body.copyWith(
                          color: AppColors.textTertiary,
                        ),
                      ),
                    ),
                  ),
                  if (hasText)
                    IconButton(
                      onPressed: onClear,
                      icon: const Icon(
                        Icons.close,
                        size: 18,
                        color: AppColors.textTertiary,
                      ),
                      tooltip: 'Очистить',
                      constraints: const BoxConstraints(
                        minWidth: 36,
                        minHeight: 36,
                      ),
                      padding: EdgeInsets.zero,
                    )
                  else
                    const SizedBox(width: 12),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
    );
  }
}

// ─────────────────────────── STATES ───────────────────────────

/// Пустой ввод — подсказка.
class _IdleHint extends StatelessWidget {
  const _IdleHint();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.search,
              size: 48,
              color: AppColors.textTertiary,
            ),
            const SizedBox(height: 12),
            Text(
              'Найдите разбор',
              style: AppTypography.sectionHeader,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              'По названию, автору или теме',
              style: AppTypography.body.copyWith(
                color: AppColors.textTertiary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// «Ничего не найдено по запросу X».
class _NoResults extends StatelessWidget {
  const _NoResults({required this.query});
  final String query;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.search_off,
              size: 48,
              color: AppColors.textTertiary,
            ),
            const SizedBox(height: 12),
            Text(
              'Ничего не нашли',
              style: AppTypography.sectionHeader,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              'По запросу «$query» нет разборов.\nПопробуйте другие слова.',
              style: AppTypography.body.copyWith(
                color: AppColors.textTertiary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// Сетка результатов поиска 2×N (те же карточки что в каталоге).
class _SearchResults extends StatelessWidget {
  const _SearchResults({required this.books});
  final List<BookModel> books;

  @override
  Widget build(BuildContext context) {
    const horizontalPadding = AppSpacing.screenPadding;
    const crossAxisSpacing = 12.0;
    const mainAxisSpacing = 20.0;
    final screenWidth = MediaQuery.of(context).size.width;
    final coverWidth =
        (screenWidth - horizontalPadding * 2 - crossAxisSpacing) / 2;
    final coverHeight = coverWidth * 1.5;
    // Высота карточки = обложка + 100 (см. catalog_screen.dart).
    final cardHeight = coverHeight + 100;

    return GridView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(
        horizontal: horizontalPadding,
        vertical: 8,
      ).copyWith(bottom: 32),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: crossAxisSpacing,
        mainAxisSpacing: mainAxisSpacing,
        mainAxisExtent: cardHeight,
      ),
      itemCount: books.length,
      itemBuilder: (context, index) => BookGridCard(
        book: books[index],
        coverWidth: coverWidth,
      ),
    );
  }
}

/// Скелетон загрузки — те же 6 заглушек что в каталоге.
class _SearchShimmer extends StatelessWidget {
  const _SearchShimmer();

  @override
  Widget build(BuildContext context) {
    return ShimmerLoading(
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenPadding,
          vertical: 8,
        ),
        child: GridView.builder(
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 20,
            childAspectRatio: 2 / 3.5,
          ),
          itemCount: 6,
          itemBuilder: (_, __) => const ShimmerBlock(
            width: double.infinity,
            height: double.infinity,
          ),
        ),
      ),
    );
  }
}
