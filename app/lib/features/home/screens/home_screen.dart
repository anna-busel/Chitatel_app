import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/shimmer_loading.dart';
import '../../../shared/widgets/error_view.dart';
import '../../diary/widgets/quote_sheet.dart';
import '../../payments/screens/paywall_screen.dart';
import '../../payments/season_window.dart';
import '../providers/home_provider.dart';
import '../widgets/home_header.dart';
import '../widgets/club_month_card.dart';
import '../widgets/daily_quote_card.dart';
import '../widgets/free_books_section.dart';
import '../widgets/popular_books_section.dart';
import '../widgets/progress_card.dart';

/// Главная страница. MASTER 4.9.
///
/// Структура (сверху вниз):
///   Шапка → Клуб месяца → [Полоска сезона] → Мысль дня → Бесплатные разборы →
///   Мой прогресс → Популярные
///
/// ⚠️ 12.07.2026 (Фаза 6): баннер «Пригласите подругу» УБРАН. Реферальной
/// программы нет ни на сервере (кода начисления бонусов не существует), ни в
/// профиле — баннер обещал «месяц клуба в подарок» и вёл на пустой экран.
/// Обещать то, чего нет, нельзя ни перед пользователем, ни перед ревью Apple.
/// Виджет referral_banner.dart остался в репозитории, но больше не используется;
/// вернём вместе с реальной реферальной механикой.
///
/// Полоска сезона (11.07.2026): статичная, под карточкой клуба, только в фазы
/// анонса (15-е — конец месяца перед сезоном) и окна покупки (первый месяц
/// сезона). Тексты — season_window.dart. Тап → paywall. Вне окон отсутствует.
/// НЕ карусель и НЕ авторотация (осознанное решение — баннерная слепота).
///
/// FAB-перо (задача 5.3): открывает шторку «Новая цитата» (4.17).
/// Живёт только на главной и в дневнике — там, где есть текст, который может
/// зацепить. В каталоге/клубе/профиле его нет (в чате перекрывал бы ленту).
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
      child: Stack(
        children: [
          Column(
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
                      // Нижний отступ увеличен под FAB — чтобы перо не
                      // перекрывало последний блок ленты.
                      padding: const EdgeInsets.only(top: 8, bottom: 96),
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

          // FAB «Новая цитата» (перо). Показывается только когда главная
          // загрузилась — на шиммере и экране ошибки он бессмыслен.
          if (homeAsync.hasValue)
            Positioned(
              right: 20,
              bottom: 20,
              child: _QuoteFab(onTap: () => showQuoteSheet(context)),
            ),
        ],
      ),
    );
  }
}

/// Плавающая кнопка «Новая цитата» (перо) — прототип v4.2.
class _QuoteFab extends StatelessWidget {
  const _QuoteFab({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Новая цитата',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(26),
          child: Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: AppColors.terracotta,
              borderRadius: BorderRadius.circular(26),
              boxShadow: AppColors.buttonShadow,
            ),
            child: const Icon(
              Icons.edit_outlined,
              size: 22,
              color: Colors.white,
            ),
          ),
        ),
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
