import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/error_view.dart';
import '../../payments/screens/paywall_screen.dart';
import '../../payments/season_window.dart';
import '../models/club_access.dart';
import '../models/club_summary.dart';
import '../providers/club_provider.dart';
import '../services/club_api_service.dart';
import '../widgets/club_about_tab.dart';
import '../widgets/chat_tab.dart';
import '../widgets/club_switcher_sheet.dart';
import '../widgets/qa_tab.dart';

/// Главный экран клуба месяца. Источник: MASTER.md секция 4.21.
///
/// Структура (сверху вниз):
/// 1. Шапка-переключатель «Клуб <месяца>» + название книги + chevron.
/// 2. Плашка сезона (анонс/окно покупки) — для действующих подписчиц (11.07).
///    12.07: НЕ показывается тем, у кого сезон уже оформлен (plan=='season').
/// 3. Баннер «Архив» если это архивный клуб.
/// 4. TabBar — 3 таба: Разборы / Чат / Q&A.
///
/// PAYWALL (модель доступа 08.07.2026): если сервер вернул 403
/// SUBSCRIPTION_REQUIRED — показываем PaywallScreen вместо ошибки.
///
/// ⚠️ 1.0.2 (01.09.2026) — ТРИ ПРАВКИ ОДНОГО СЦЕНАРИЯ «ПОДПИСЧИЦА ПРОШЛОГО
/// МЕСЯЦА И НОВЫЙ КЛУБ»:
/// 1. Петля: тап по новому месяцу в переключателе возвращал в архив. Ручной
///    выбор сбрасывал пометку «архив уже подставляли», приходил 403, и M1
///    подставлял архив второй раз. Теперь ручной выбор текущего клуба
///    (переключатель / карточка на главной) помечается clubManualCurrentProvider,
///    и при 403 архив не подставляется — показывается пейвол.
/// 2. Пейвол во вкладке рисуется ПОД шапкой-переключателем клуба, чтобы из него
///    одним тапом вернуться в свой оплаченный архив (без этого подписчица с
///    августом застревала бы на пейволе).
/// 3. Баннер над архивом стал явным: «Это архив августа. Клуб сентября
///    «…» — оформить подписку», вместо серой строчки «Подписка истекла».
/// Состояние подстановки архива переехало из State в провайдеры
/// (clubArchiveFallbackProvider): ShellRoute пересоздаёт экран при каждом входе
/// во вкладку, и локальные поля терялись.
class ClubScreen extends ConsumerStatefulWidget {
  const ClubScreen({super.key});

  @override
  ConsumerState<ClubScreen> createState() => _ClubScreenState();
}

class _ClubScreenState extends ConsumerState<ClubScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  /// Идёт попытка подобрать архивный клуб — вместо paywall показываем лоадер.
  bool _resolvingArchive = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // 403 обрабатываем в слушателе, а не в build: нужно сходить за /club/list
    // и, возможно, поменять выбранный клуб (в build менять провайдеры нельзя).
    ref.listen<AsyncValue<CurrentClubResult>>(currentClubProvider, (_, next) {
      next.whenOrNull(error: (err, __) => _handleClubError(err));
    });

    final clubAsync = ref.watch(currentClubProvider);

    return clubAsync.when(
      data: (result) => _buildContent(result),
      loading: () => const _LoadingView(),
      error: (err, _) {
        // Нет подписки (SUBSCRIPTION_REQUIRED) → показываем paywall, а не ошибку.
        if (_isSubscriptionRequired(err)) {
          // Пока подбираем архив — лоадер, чтобы paywall не мигал зря.
          if (_resolvingArchive) return const _LoadingView();
          return _buildPaywall();
        }
        return ErrorView(
          message: 'Не удалось загрузить клуб',
          onRetry: () => ref.invalidate(currentClubProvider),
        );
      },
    );
  }

  /// Пейвол внутри вкладки — под шапкой-переключателем (1.0.2).
  ///
  /// Шапка называет клуб, к которому нет доступа (текущий из /club/list), и
  /// открывает переключатель — оттуда подписчица прошлого месяца возвращается
  /// в свой архив. showClose: false — пейвол встроен в таб, маршрута нет,
  /// крестик снимать нечего (см. PaywallScreen.showClose); showAppBar: false —
  /// вторая шапка под первой не нужна.
  Widget _buildPaywall() {
    final current = _currentSummary();
    return Column(
      children: [
        _ClubHeaderSwitcher(
          monthLabel: current != null ? clubMonthLabel(current.month) : 'Клуб месяца',
          title: current?.title ?? 'Подписка на клуб',
          onTap: _openSwitcher,
        ),
        const Expanded(
          child: PaywallScreen(showClose: false, showAppBar: false),
        ),
      ],
    );
  }

  /// Текущий (активный сейчас) клуб из /club/list — для шапки над пейволом и
  /// текста баннера архива. Список кешируется провайдером; пока не загружен —
  /// null, виджеты рисуют нейтральный текст.
  ClubSummary? _currentSummary() {
    final list = ref.watch(clubListProvider).valueOrNull;
    if (list == null || list.current.isEmpty) return null;
    return list.current.first;
  }

  bool _isSubscriptionRequired(Object err) {
    if (err is DioException) {
      final code = ClubApiService.errorCodeFromException(err);
      return code == 'SUBSCRIPTION_REQUIRED';
    }
    return false;
  }

  /// Реакция на 403 SUBSCRIPTION_REQUIRED.
  ///
  /// M2: если 403 пришёл на клуб, выбранный в переключателе — сбрасываем выбор
  /// на текущий (null), иначе paywall «залипает» до перезапуска приложения.
  /// M1: если 403 пришёл на /club/current — подписчица прошлого месяца всё ещё
  /// имеет право на свой оплаченный архив: берём его из /club/list и открываем
  /// с баннером. Если архива нет — остаётся paywall, как раньше.
  Future<void> _handleClubError(Object err) async {
    if (!_isSubscriptionRequired(err)) return;
    if (_resolvingArchive) return;

    final selectedId = ref.read(selectedClubIdProvider);
    final fallbackId = ref.read(clubArchiveFallbackProvider);

    if (selectedId != null) {
      // Архив, который мы сами подставили, тоже закрыт — дальше только paywall.
      if (selectedId == fallbackId) return;
      // M2: выбранный вручную клуб закрыт → возвращаемся к текущему.
      ref.read(clubArchiveFallbackProvider.notifier).state = null;
      ref.read(selectedClubIdProvider.notifier).state = null;
      return;
    }

    // 1.0.2: текущий клуб выбран РУКАМИ (переключатель / главная) — архив не
    // подставляем, остаётся пейвол с шапкой. Иначе тап по новому месяцу
    // возвращал бы в архив (петля).
    if (ref.read(clubManualCurrentProvider)) return;

    // Архив уже пробовали — второй раз не ходим.
    if (fallbackId != null) return;

    if (mounted) setState(() => _resolvingArchive = true);
    try {
      final list = await ref.read(clubListProvider.future);
      final archive = list.archive;
      if (archive.isEmpty) return;
      ref.read(clubArchiveFallbackProvider.notifier).state = archive.first.id;
      ref.read(selectedClubIdProvider.notifier).state = archive.first.id;
    } catch (_) {
      // Список не загрузился — остаётся paywall.
    } finally {
      if (mounted) setState(() => _resolvingArchive = false);
    }
  }

  Widget _buildContent(CurrentClubResult result) {
    final club = result.club;
    final access = result.access;

    // Плашка сезона для тех, кто УЖЕ в клубе (подписчицы месяца):
    // анонс и окно покупки сезона — тап ведёт на paywall. Не показываем:
    // админу и тем, у кого сезон уже оформлен (plan=='season', 12.07) —
    // предлагать сезон сезоннице бессмысленно, её продление автоматическое.
    final seasonText = SeasonWindow.clubBannerText();
    final showSeasonBanner = seasonText != null &&
        access.kind != ClubAccessKind.admin &&
        !access.hasSeasonPlan;

    // M1: открыт архив, который мы подставили сами после 403 на текущий клуб.
    final selectedId = ref.watch(selectedClubIdProvider);
    final fallbackId = ref.watch(clubArchiveFallbackProvider);
    final isExpiredFallback = selectedId != null && selectedId == fallbackId;

    return Column(
      children: [
        _ClubHeaderSwitcher(
          monthLabel: clubMonthLabel(club.month),
          title: club.title,
          onTap: _openSwitcher,
        ),

        if (showSeasonBanner)
          _SeasonClubBanner(
            text: seasonText,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PaywallScreen()),
              );
            },
          ),

        // M1: сюда попали после 403 на текущий клуб — объясняем, что это архив,
        // называем новый клуб и ведём к нему (= ручной выбор текущего → пейвол
        // с шапкой, как из переключателя).
        if (isExpiredFallback)
          _ExpiredArchiveBanner(
            archiveMonth: club.month,
            current: _currentSummary(),
            onTap: _selectCurrentManually,
          )
        else if (access.kind == ClubAccessKind.archive)
          _ArchiveBanner(archiveUntil: club.archiveUntilDate),

        Container(
          color: AppColors.background,
          child: TabBar(
            controller: _tabController,
            indicatorColor: AppColors.terracotta,
            indicatorWeight: 2.5,
            labelColor: AppColors.textPrimary,
            unselectedLabelColor: AppColors.textSecondary,
            labelStyle: AppTypography.bodyMedium,
            unselectedLabelStyle: AppTypography.body,
            tabs: const [
              Tab(text: 'Разборы'),
              Tab(text: 'Чат'),
              Tab(text: 'Q&A'),
            ],
          ),
        ),

        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              ClubAboutTab(club: club, bookJson: result.bookJson),
              ChatTab(club: club, access: access),
              QATab(club: club, access: access),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _openSwitcher() async {
    final selectedId = await showModalBottomSheet<String?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => const ClubSwitcherSheet(),
    );

    if (selectedId == null) return;
    if (!mounted) return;

    if (selectedId == '__current__') {
      _selectCurrentManually();
    } else {
      // Конкретный клуб выбран руками: это уже не наша подстановка архива,
      // баннер «это архив, сентябрь по подписке» не нужен.
      ref.read(clubManualCurrentProvider.notifier).state = false;
      ref.read(clubArchiveFallbackProvider.notifier).state = null;
      ref.read(selectedClubIdProvider.notifier).state = selectedId;
    }
  }

  /// Пользователь сам выбрал текущий клуб (переключатель или баннер архива).
  /// При 403 на него архив не подставляем — пейвол с шапкой (см. класс).
  void _selectCurrentManually() {
    ref.read(clubManualCurrentProvider.notifier).state = true;
    ref.read(clubArchiveFallbackProvider.notifier).state = null;
    ref.read(selectedClubIdProvider.notifier).state = null;
  }
}

/// «Клуб сентября» — подпись месяца клуба (шапка, баннеры).
String clubMonthLabel(int month) => 'Клуб ${clubMonthGenitive(month)}';

/// Месяц в родительном падеже: 9 → «сентября».
String clubMonthGenitive(int month) {
  const months = <int, String>{
    1: 'января',
    2: 'февраля',
    3: 'марта',
    4: 'апреля',
    5: 'мая',
    6: 'июня',
    7: 'июля',
    8: 'августа',
    9: 'сентября',
    10: 'октября',
    11: 'ноября',
    12: 'декабря',
  };
  return months[month] ?? 'месяца';
}

/// Плашка сезона внутри клуба (анонс или окно покупки).
/// Спокойно-информативная, без таймеров. Тап → paywall.
class _SeasonClubBanner extends StatelessWidget {
  const _SeasonClubBanner({required this.text, required this.onTap});

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
          margin: const EdgeInsets.fromLTRB(20, 4, 20, 4),
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

/// Шапка-переключатель. Тап → открыть bottom sheet.
class _ClubHeaderSwitcher extends StatelessWidget {
  const _ClubHeaderSwitcher({
    required this.monthLabel,
    required this.title,
    required this.onTap,
  });
  final String monthLabel;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.background,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      monthLabel.toUpperCase(),
                      style: AppTypography.microBold.copyWith(
                        letterSpacing: 1.2,
                        color: AppColors.terracotta,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      title,
                      style: AppTypography.serifSectionTitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.expand_more,
                size: 22,
                color: AppColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Лоадер на весь экран клуба (один раз при первом открытии).
class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.background,
      child: const Center(
        child: CircularProgressIndicator(
          color: AppColors.terracotta,
          strokeWidth: 2.5,
        ),
      ),
    );
  }
}

/// M1: баннер для истёкшей подписки, когда вместо paywall открыт оплаченный
/// архив. 1.0.2: явный текст — какой месяц открыт и какой клуб по подписке;
/// терракотовый, как плашка сезона. Тап → текущий клуб (пейвол с шапкой).
class _ExpiredArchiveBanner extends StatelessWidget {
  const _ExpiredArchiveBanner({
    required this.archiveMonth,
    required this.current,
    required this.onTap,
  });
  final int archiveMonth;
  final ClubSummary? current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final archiveText = 'Это архив ${clubMonthGenitive(archiveMonth)}. ';
    final currentText = current != null
        ? '${clubMonthLabel(current!.month)} «${current!.title}» — оформить подписку'
        : 'Новый клуб месяца — оформить подписку';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          margin: const EdgeInsets.fromLTRB(20, 4, 20, 12),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.terracotta.withOpacity(0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.terracotta.withOpacity(0.35)),
          ),
          child: Row(
            children: [
              const Icon(Icons.history, size: 18, color: AppColors.terracotta),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  archiveText + currentText,
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

/// Баннер архивного клуба (прошлый месяц).
/// В архиве МОЖНО писать (модель 08.07) — баннер лишь информирует.
class _ArchiveBanner extends StatelessWidget {
  const _ArchiveBanner({required this.archiveUntil});
  final DateTime archiveUntil;

  @override
  Widget build(BuildContext context) {
    final dd = archiveUntil.day.toString().padLeft(2, '0');
    final mm = archiveUntil.month.toString().padLeft(2, '0');

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(20, 4, 20, 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Icon(Icons.archive_outlined, size: 18, color: AppColors.textTertiary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Прошлый клуб — обсуждение открыто до $dd.$mm.',
              style: AppTypography.caption,
            ),
          ),
        ],
      ),
    );
  }
}
