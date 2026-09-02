import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/utils/part_labels.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../../../shared/widgets/error_view.dart';
import '../../player/providers/player_provider.dart';
import '../providers/profile_provider.dart';
import '../services/profile_service.dart';

/// «Мой прогресс» (экран 4.45, задача 6.2).
///
/// Статистика ЗА ВСЁ ВРЕМЯ (решение 12.07.2026): минуты прослушивания, начатые
/// и дослушанные разборы, число цитат. Недельной динамики нет осознанно — база
/// хранит только суммарное время по книге, посуточной истории не существует,
/// а рисовать график из воздуха честнее не показывать вовсе.
///
/// ⚠️ 24.07.2026 — ЦИФРЫ КЛИКАБЕЛЬНЫ. Тап по «разборов начато» раскрывает под
/// блоками список начатых разборов, тап по «дослушано» — список дослушанных
/// (GET /api/progress/list). Повторный тап сворачивает.
///
/// ⚠️ 24.07.2026 — СВЕЖЕСТЬ + ЖИВОЙ ТЕКУЩИЙ РАЗБОР. Провайдеры статистики и
/// списка стали autoDispose — данные перезапрашиваются при каждом открытии
/// экрана (раньше кэш висел до перезапуска приложения). А карточка того
/// разбора, который сейчас играет, берёт часть/позицию ЖИВЫМИ из плеера — как
/// «Продолжить слушать» на главной, чтобы список совпадал с плеером мгновенно.
class MyProgressScreen extends ConsumerWidget {
  const MyProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(progressStatsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('Мой прогресс', style: AppTypography.screenTitle),
      ),
      body: SafeArea(
        child: statsAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(
              color: AppColors.terracotta,
              strokeWidth: 2.5,
            ),
          ),
          error: (_, __) => ErrorView(
            message: 'Не удалось загрузить статистику',
            onRetry: () => ref.invalidate(progressStatsProvider),
          ),
          data: (stats) => _Body(stats: stats),
        ),
      ),
    );
  }
}

/// Какой список разборов раскрыт под цифрами.
enum _Expanded { none, started, completed }

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.stats});
  final ProgressStats stats;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  _Expanded _expanded = _Expanded.none;

  void _toggle(_Expanded which) {
    setState(() => _expanded = _expanded == which ? _Expanded.none : which);
  }

  String get _timeLabel {
    final total = widget.stats.totalMinutes;
    if (total < 60) return '$total мин';
    final hours = total ~/ 60;
    final minutes = total % 60;
    if (minutes == 0) return '$hours ч';
    return '$hours ч $minutes мин';
  }

  String get _lastLabel {
    final last = widget.stats.lastListenedAt;
    if (last == null) return 'Вы ещё не начали слушать';
    final l = last.toLocal();
    final dd = l.day.toString().padLeft(2, '0');
    final mm = l.month.toString().padLeft(2, '0');
    return 'Последний раз слушали $dd.$mm.${l.year}';
  }

  @override
  Widget build(BuildContext context) {
    final stats = widget.stats;
    final empty = stats.totalMinutes == 0 &&
        stats.booksStarted == 0 &&
        stats.quotesCount == 0;

    if (empty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.insights_outlined,
                size: 48,
                color: AppColors.textTertiary,
              ),
              const SizedBox(height: 12),
              Text(
                'Пока пусто',
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Включите первый разбор — и здесь появится ваша статистика',
                style: AppTypography.caption,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenPadding),
      children: [
        _BigStat(value: _timeLabel, label: 'всего прослушано'),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _SmallStat(
                value: '${stats.booksStarted}',
                label: 'разборов начато',
                icon: Icons.play_circle_outline,
                // Тап показывает начатые разборы (если они есть).
                onTap: stats.booksStarted > 0
                    ? () => _toggle(_Expanded.started)
                    : null,
                expanded: _expanded == _Expanded.started,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SmallStat(
                value: '${stats.booksCompleted}',
                label: 'дослушано',
                icon: Icons.check_circle_outline,
                // Тап показывает дослушанные разборы (если они есть).
                onTap: stats.booksCompleted > 0
                    ? () => _toggle(_Expanded.completed)
                    : null,
                expanded: _expanded == _Expanded.completed,
              ),
            ),
          ],
        ),

        // Раскрывающийся список разборов под цифрами.
        _ExpandedList(mode: _expanded),

        const SizedBox(height: 12),
        _SmallStat(
          value: '${stats.quotesCount}',
          label: 'цитат в дневнике',
          icon: Icons.format_quote,
        ),
        const SizedBox(height: 20),
        Text(
          _lastLabel,
          style: AppTypography.caption,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

/// Список разборов, раскрытый под цифрами: started — все начатые, completed —
/// только дослушанные. Грузится отдельным провайдером (GET /api/progress/list).
class _ExpandedList extends ConsumerWidget {
  const _ExpandedList({required this.mode});
  final _Expanded mode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (mode == _Expanded.none) return const SizedBox.shrink();

    final listAsync = ref.watch(progressListProvider);

    return listAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.only(top: 14),
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.terracotta,
            ),
          ),
        ),
      ),
      error: (_, __) => const SizedBox.shrink(),
      data: (items) {
        // started — все начатые (совпадает с числом «разборов начато»);
        // completed — только дослушанные.
        final filtered = mode == _Expanded.completed
            ? items.where((i) => i.isCompleted).toList(growable: false)
            : items;

        if (filtered.isEmpty) {
          return Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Text(
              mode == _Expanded.completed
                  ? 'Пока ничего не дослушано целиком'
                  : 'Пока нет начатых разборов',
              style: AppTypography.caption,
              textAlign: TextAlign.center,
            ),
          );
        }

        return Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Column(
            children: [
              for (final item in filtered) _ProgressMiniCard(item: item),
            ],
          ),
        );
      },
    );
  }
}

/// Тапабельная мини-карточка одного разбора: обложка, название, статус
/// (дослушано / часть N из M). Тап продолжает с сохранённой секунды.
///
/// Если ИМЕННО этот разбор сейчас играет — часть/позиция берутся ЖИВЫМИ из
/// плеера (как карточка «Продолжить слушать» на главной), чтобы список
/// совпадал с плеером без перезагрузки. Иначе — данные с сервера.
class _ProgressMiniCard extends ConsumerWidget {
  const _ProgressMiniCard({required this.item});
  final ProgressItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final book = item.book;

    final player = ref.watch(playerUiStateProvider).valueOrNull;
    final bool live =
        player != null && player.hasContent && player.book?.id == book.id;

    final int partNumber = live ? player.partNumber : item.currentPartNumber;
    final int positionSeconds =
        live ? player.position.inSeconds : item.positionSeconds;

    // «Дослушано» показываем только по серверным данным; если книга играет
    // прямо сейчас — показываем живую часть.
    final bool showCompleted = item.isCompleted && !live;
    // 1.0.2: подпись части через общий хелпер — на приветствии клубного
    // разбора здесь стояло «Часть 1 из 1», хотя это приветствие, а не разбор.
    // Приветствие в счёт частей разбора не идёт.
    final parts = book.parts
        .map((p) => (number: p.number, title: p.title))
        .toList(growable: false);
    final String partText = parts.isEmpty
        ? 'Часть $partNumber из ${item.totalParts}'
        : () {
            final label = partLabelInBook(number: partNumber, parts: parts);
            if (label == 'Приветствие') return label;
            final total = partsCountForDisplay(
              totalParts: item.totalParts,
              parts: parts,
            );
            return '$label из $total';
          }();
    final String subtitle = showCompleted ? 'Дослушано' : partText;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: InkWell(
          onTap: () {
            context.push(
              Routes.player(book.id),
              extra: {
                'startPart': partNumber,
                'startPosition': positionSeconds,
              },
            );
          },
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: BookCoverImage(
                    imageUrl: book.coverImageUrl,
                    gradientColors: book.coverGradientColors,
                    label: book.coverLabel,
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                  ),
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
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Icon(
                            showCompleted
                                ? Icons.check_circle
                                : Icons.play_circle_outline,
                            size: 14,
                            color: showCompleted
                                ? AppColors.terracotta
                                : AppColors.textSecondary,
                          ),
                          const SizedBox(width: 4),
                          Text(subtitle, style: AppTypography.caption),
                        ],
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: AppColors.textSecondary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BigStat extends StatelessWidget {
  const _BigStat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 28),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: AppTypography.serifSectionTitle.copyWith(
              color: AppColors.terracotta,
              fontSize: 32,
            ),
          ),
          const SizedBox(height: 4),
          Text(label, style: AppTypography.caption),
        ],
      ),
    );
  }
}

/// Карточка-цифра. Если задан [onTap] — кликабельна и показывает шеврон,
/// который разворачивается вниз, когда список раскрыт ([expanded]).
class _SmallStat extends StatelessWidget {
  const _SmallStat({
    required this.value,
    required this.label,
    required this.icon,
    this.onTap,
    this.expanded = false,
  });
  final String value;
  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(
          color: expanded ? AppColors.terracotta : AppColors.border,
        ),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.terracotta),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: AppTypography.sectionHeader),
                Text(label, style: AppTypography.caption),
              ],
            ),
          ),
          if (onTap != null)
            Icon(
              expanded ? Icons.expand_less : Icons.expand_more,
              size: 18,
              color: AppColors.terracotta,
            ),
        ],
      ),
    );

    if (onTap == null) return card;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: card,
    );
  }
}
