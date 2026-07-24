import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/shimmer_loading.dart';
import '../../../shared/widgets/error_view.dart';
import '../../diary/widgets/quote_sheet.dart';
import '../../payments/screens/paywall_screen.dart';
import '../../payments/season_window.dart';
import '../../player/providers/player_provider.dart';
import '../providers/home_provider.dart';
import '../widgets/home_header.dart';
import '../widgets/club_month_card.dart';
import '../widgets/continue_listening_card.dart';
import '../widgets/daily_quote_card.dart';
import '../widgets/free_books_section.dart';
import '../widgets/popular_books_section.dart';

/// Главная страница. MASTER 4.9.
///
/// Структура (сверху вниз):
///   Шапка → Клуб месяца → [Полоска сезона] → Мысль дня → Бесплатные разборы →
///   [Продолжить слушать] → Популярные
///
/// ⚠️ 13.07.2026 — «МОЙ ПРОГРЕСС» ЗАМЕНЁН НА «ПРОДОЛЖИТЬ СЛУШАТЬ».
/// Старая карточка (ProgressCard, Фаза 2) была МЁРТВОЙ: всегда писала «Начните
/// слушать первый разбор» — данных у неё не было вовсе — и вела в каталог.
/// Теперь на её месте компактная строка: обложка последнего начатого разбора,
/// часть, сколько осталось, полоска прогресса и кнопка ▶ — тап продолжает с
/// сохранённой секунды. Ничего не начато → блок не показывается вовсе.
///
/// ⚠️ 21.07.2026 — СИНХРОНИЗАЦИЯ КАРТОЧКИ С ПЛЕЕРОМ. Данные главной
/// (homeProvider) кэшируются один раз, а при смене части в плеере не
/// перезапрашивались — карточка «Продолжить» висела на 1й части, когда плеер
/// уже на 2й. Теперь главная слушает плеер и обновляет данные при смене
/// книги/части (по позиции — нет, чтобы не дёргать сеть каждую секунду).
///
/// ⚠️ 12.07.2026 (Фаза 6): баннер «Пригласите подругу» УБРАН — реферальной
/// механики нет ни на сервере, ни в профиле, а баннер обещал «месяц клуба в
/// подарок» и вёл на пустой экран.
///
/// Полоска сезона (11.07.2026): статичная, под карточкой клуба, только в фазы
/// анонса и окна покупки. Тексты — season_window.dart. Тап → paywall.
///
/// FAB-карандаш (задача 5.3): открывает шторку «Новая цитата» (4.17). Иконка —
/// `Icons.edit_outlined` (карандаш, как в дневнике). Живёт только на главной
/// и в дневнике — там, где есть текст, который может зацепить.
///
/// Обновление: pull-to-refresh (invalidate homeProvider).
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final homeAsync = ref.watch(homeProvider);
    final seasonText = SeasonWindow.clubBannerText();

    // Синхронизация с плеером: когда в плеере меняется книга или часть —
    // обновляем данные главной, чтобы карточка «Продолжить слушать» не отставала.
    ref.listen<AsyncValue<PlayerUiState>>(playerUiStateProvider, (prev, next) {
      final n = next.valueOrNull;
      if (n == null || !n.hasContent) return;
      final p = prev?.valueOrNull;
      final changed = p == null ||
          p.book?.id != n.book?.id ||
          p.partNumber != n.partNumber;
      if (changed) {
        ref.invalidate(homeProvider);
      }
    });

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
                      // Нижний отступ увеличен под FAB — чтобы карандаш не
                      // перекрывал последний блок ленты.
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
                        // Показывается только если есть начатый разбор.
                        if (data.continueListening != null) ...[
                          ContinueListeningCard(item: data.continueListening),
                          const SizedBox(height: 24),
                        ],
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

          // FAB «Новая цитата» (карандаш). Показывается только когда главная
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

/// Плавающая кнопка «Новая цитата» (карандаш, как в дневнике).
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
              size: 24,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}

/// Статичная полоска сезона на главной (фазы анонса и окна покупки).
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
