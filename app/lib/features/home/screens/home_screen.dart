import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/shimmer_loading.dart';
import '../../../shared/widgets/error_view.dart';
import '../../payments/screens/paywall_screen.dart';
import '../../payments/season_window.dart';
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
///   Шапка → Клуб месяца → [Полоска сезона] → Мысль дня → Бесплатные разборы →
///   Мой прогресс → Популярные → Реферал
///
/// Полоска сезона (11.07.2026): статичная, под карточкой клуба, только в фазы
/// анонса (15-е — конец месяца перед сезоном) и окна покупки (первый месяц
/// сезона). Тексты — season_window.dart. Тап → paywall. Вне окон отсутствует.
/// НЕ карусель и НЕ авторотация (осознанное решение — баннерная слепота).
///
/// Обновление: pull-to-refresh (invalidate homeProvider).
/// Ошибка: ErrorView с кнопкой «Попробовать снова».
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final homeAsync = ref.watch(homeProvider);
    final seasonText = SeasonWindow.clubBannerText();

    return Container(
      color: AppColors.background,
      child: Column(
        children: [
          const HomeHeader(),
          Expanded(
            child: homeAsync.when(
              data: (data) => RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(homeProvider);
                  await ref.read(homeProvider.future);
                },
                color: AppColors.terracotta,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(top: 8, bottom: 32),
                  children: [
                    ClubMonthCard(
                      book: data.clubBook,
                      monthLabel: data.clubMonthLabel,
                    ),
                    if (seasonText != null) ...[
                      const SizedBox(height: 10),
                      _SeasonHomeBanner(
                        text: seasonText,
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => const PaywallScreen(),
                            ),
                          );
                        },
                      ),
                    ],
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
              loading: () => const HomeShimmer(),
              error: (err, _) => ErrorView(
                message: 'Не удалось загрузить главную',
                onRetry: () => ref.invalidate(homeProvider),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Статичная полоска сезона на главной (фазы анонса и окна покупки).
/// Тот же визуальный стиль, что плашка сезона в клубе — консистентность.
class _SeasonHomeBanner extends StatelessWidget {
  const _SeasonHomeBanner({required this.text, required this.onTap});

  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          margin: const EdgeInsets.symmetric(horizontal: 20),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.terracotta.withOpacity(0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.terracotta.withOpacity(0.35)),
          ),
          child: Row(
            children: [
              const Icon(Icons.auto_awesome,
                  size: 18, color: AppColors.terracotta),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  text,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              const Icon(Icons.chevron_right,
                  size: 18, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}
