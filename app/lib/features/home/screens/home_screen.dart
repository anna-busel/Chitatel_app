import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/shimmer_loading.dart';
import '../../../shared/widgets/error_view.dart';
import '../providers/home_provider.dart';
import '../widgets/home_header.dart';
import '../widgets/club_month_card.dart';
import '../widgets/daily_quote_card.dart';
import '../widgets/free_books_section.dart';
import '../widgets/popular_books_section.dart';
import '../widgets/progress_card.dart';
import '../widgets/referral_banner.dart';

/// Главная страница. MASTER 4.9.
///
/// Структура (сверху вниз):
///   Шапка → Клуб месяца → Мысль дня → Бесплатные разборы →
///   Мой прогресс → Популярные → Реферал
///
/// Обновление: pull-to-refresh (invalidate homeProvider).
/// Ошибка: ErrorView с кнопкой «Попробовать снова».
///
/// Используем CustomScrollView вместо Column+Expanded+ListView, чтобы шапка
/// (HomeHeader) была частью скроллируемого контента, а не отдельным sliver'ом
/// с фиксированной высотой. Это решает проблему сломанного вертикального
/// и горизонтального скролла из-за неопределённых constraints.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final homeAsync = ref.watch(homeProvider);

    return homeAsync.when(
      data: (data) => RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(homeProvider);
          await ref.read(homeProvider.future);
        },
        color: AppColors.terracotta,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            const HomeHeader(),
            ClubMonthCard(
              book: data.clubBook,
              monthLabel: data.clubMonthLabel,
            ),
            const SizedBox(height: 20),
            if (data.dailyQuote != null) ...[
              DailyQuoteCard(quote: data.dailyQuote!),
              const SizedBox(height: 24),
            ],
            FreeBooksSection(books: data.freeBooks),
            if (data.freeBooks.isNotEmpty) const SizedBox(height: 24),
            const ProgressCard(),
            const SizedBox(height: 24),
            PopularBooksSection(books: data.popularBooks),
            if (data.popularBooks.isNotEmpty) const SizedBox(height: 24),
            const ReferralBanner(),
          ],
        ),
      ),
      loading: () => Column(
        children: const [
          HomeHeader(),
          Expanded(child: HomeShimmer()),
        ],
      ),
      error: (err, _) => Column(
        children: [
          const HomeHeader(),
          Expanded(
            child: ErrorView(
              message: 'Не удалось загрузить главную',
              onRetry: () => ref.invalidate(homeProvider),
            ),
          ),
        ],
      ),
    );
  }
}
