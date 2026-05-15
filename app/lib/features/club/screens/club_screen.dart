import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/error_view.dart';
import '../models/club_access.dart';
import '../models/club_month.dart';
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
/// 1. Шапка-переключатель «Клуб <месяца>» + название книги + chevron
///    (тап открывает bottom sheet со списком клубов).
/// 2. TabBar — 3 таба: Разборы / Чат / Q&A.
/// 3. TabBarView — содержимое выбранного таба.
///
/// Подгружает currentClubProvider (зависит от selectedClubIdProvider) один
/// раз для всех табов. Когда юзер выбирает другой клуб — провайдер
/// перезагружает контент через GET /api/club/:id.
class ClubScreen extends ConsumerStatefulWidget {
  const ClubScreen({super.key});

  @override
  ConsumerState<ClubScreen> createState() => _ClubScreenState();
}

class _ClubScreenState extends ConsumerState<ClubScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

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
    final clubAsync = ref.watch(currentClubProvider);

    return clubAsync.when(
      data: (result) => _buildContent(result),
      loading: () => const _LoadingView(),
      error: (err, _) => ErrorView(
        message: 'Не удалось загрузить клуб',
        onRetry: () => ref.invalidate(currentClubProvider),
      ),
    );
  }

  Widget _buildContent(CurrentClubResult result) {
    final club = result.club;
    final access = result.access;

    return Column(
      children: [
        // — Шапка-переключатель: «Клуб <месяца>» + название книги + chevron —
        _ClubHeaderSwitcher(club: club, onTap: _openSwitcher),

        // — Баннер «Архив» если доступ только read-only —
        if (access.kind == ClubAccessKind.archive)
          _ArchiveBanner(archiveUntil: club.archiveUntilDate),

        // — TabBar —
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

        // — Содержимое —
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

  /// Открыть bottom sheet с переключателем клубов.
  /// При выборе клуба — обновить selectedClubIdProvider, что вызовет
  /// перезагрузку currentClubProvider.
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

    // null — закрыл sheet без выбора (тап вне sheet / drag-down).
    // Передаваемые значения из листа: либо ClubSummary.id, либо
    // спец-значение '__current__' = «выбрать текущий клуб».
    if (selectedId == null) return;
    if (!mounted) return;

    if (selectedId == '__current__') {
      ref.read(selectedClubIdProvider.notifier).state = null;
    } else {
      ref.read(selectedClubIdProvider.notifier).state = selectedId;
    }
  }
}

/// Шапка-переключатель. Тап → открыть bottom sheet.
class _ClubHeaderSwitcher extends StatelessWidget {
  const _ClubHeaderSwitcher({required this.club, required this.onTap});
  final ClubMonth club;
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
                      _formatClubMonthLabel(club).toUpperCase(),
                      style: AppTypography.microBold.copyWith(
                        letterSpacing: 1.2,
                        color: AppColors.terracotta,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      club.title,
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

  /// «Клуб мая», «Клуб июня» и т.д. с месяцем в родительном падеже.
  String _formatClubMonthLabel(ClubMonth club) {
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
    final monthName = months[club.month] ?? 'месяца';
    return 'Клуб $monthName';
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

/// Баннер «Архивный доступ — чтение до DD.MM».
/// Показывается под шапкой когда access.kind == archive.
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
              'Архивный доступ — чтение до $dd.$mm. Продлите подписку, чтобы писать.',
              style: AppTypography.caption,
            ),
          ),
        ],
      ),
    );
  }
}
