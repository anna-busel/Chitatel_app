import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/utils/part_labels.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../models/club_month.dart';

/// Таб «Разборы» на экране клуба. Источник: MASTER.md секция 4.21.
///
/// Содержит:
/// - Обложка книги
/// - Название + автор
/// - Кнопка запуска → плеер (продолжает с сохранённого места)
/// - Список аудио-частей: тап по строке → плеер с этой части
/// - Описание книги (если есть в bookJson)
/// - Расписание открытия частей (если задано в клубе)
///
/// ⚠️ 1.0.2 (01.09.2026) — ЧАСТИ ПЕРЕЕХАЛИ СЮДА. Раньше кнопка «Слушать
/// разбор» вела на карточку разбора (BookScreen), и получались два почти
/// одинаковых экрана: обложка + описание в клубе, обложка + описание +
/// (ниже сгиба) части — на карточке. Плюс, пока загружено только приветствие,
/// кнопка «Слушать разбор» включала приветствие, и об этом нигде не
/// говорилось. Теперь состав разбора виден прямо в клубе, кнопка называется
/// по факту («Слушать приветствие», пока частей нет) и ведёт сразу в плеер.
/// Карточка разбора клубной книге не нужна: она не продаётся, апселла и
/// превью у неё нет (см. _ClubOnlyActions в book_screen для прямых заходов).
///
/// `bookJson` — сырой JSON книги от сервера. Парсим только нужные поля
/// (coverImageUrl, coverGradient, description) без полноценного Book.fromJson —
/// чтобы не тянуть зависимость от features/book/. ID книги нужен для перехода
/// в плеер.
class ClubAboutTab extends StatelessWidget {
  const ClubAboutTab({
    super.key,
    required this.club,
    required this.bookJson,
  });

  final ClubMonth club;
  final Map<String, dynamic>? bookJson;

  @override
  Widget build(BuildContext context) {
    final coverImageUrl = bookJson?['coverImageUrl']?.toString() ?? '';
    final description = bookJson?['description']?.toString() ?? '';
    final bookId = bookJson?['_id']?.toString() ?? club.bookId;

    // Аудио-части разбора. Приходят в bookJson (GET /api/club/current отдаёт
    // документ книги целиком). Парсим минимум — номер, название, длительность.
    final parts = _parseParts(bookJson?['parts']);
    final hasGreeting = hasGreetingPart(
      parts.map((p) => (number: p.number, title: p.title)),
    );
    // Пока загружено только приветствие — так и пишем на кнопке, чтобы никто
    // не ждал разбор книги.
    final onlyGreeting = parts.length == 1 && hasGreeting;
    final buttonText = onlyGreeting ? 'Слушать приветствие' : 'Слушать разбор';

    // coverGradient в Book — массив строк hex. Если null/пусто — пустой массив,
    // BookCoverImage сам подставит дефолтный градиент.
    final gradientRaw = bookJson?['coverGradient'];
    final gradientColors = gradientRaw is List
        ? gradientRaw.map((e) => e.toString()).toList(growable: false)
        : const <String>[];

    // Есть ли ещё не открытые части — от этого зависит строка про понедельники.
    final now = DateTime.now();
    final hasUpcomingParts = now.isBefore(club.endsAt) &&
        club.partSchedule.any((p) => p.opensAt.isAfter(now));

    return Container(
      color: AppColors.background,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenPadding,
          16,
          AppSpacing.screenPadding,
          32,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // — Обложка + название + автор —
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                BookCoverImage(
                  imageUrl: coverImageUrl,
                  gradientColors: gradientColors,
                  label: club.title,
                  width: 100,
                  height: 150,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        club.title,
                        style: AppTypography.serifPlayerTitle,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        club.author,
                        style: AppTypography.caption,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 12),
                      _PeriodChip(
                        startsAt: club.startsAt,
                        endsAt: club.endsAt,
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // — Кнопка запуска: плеер сам продолжит с сохранённого места
            //   (audio_service тянет прогресс по книге). Если аудио ещё нет —
            //   кнопка неактивна, ниже строка про ожидание.
            AppButton(
              text: buttonText,
              onPressed: parts.isEmpty
                  ? null
                  : () => context.push(Routes.player(bookId)),
            ),

            // — Список частей: тап → плеер с этой части (как в каталоге) —
            if (parts.isNotEmpty) ...[
              const SizedBox(height: 16),
              ...parts.map(
                (part) => _ClubPartRow(
                  label: partLabel(
                    number: part.number,
                    title: part.title,
                    hasGreeting: hasGreeting,
                  ),
                  subtitle: partSubtitle(
                    number: part.number,
                    title: part.title,
                    label: partLabel(
                      number: part.number,
                      title: part.title,
                      hasGreeting: hasGreeting,
                    ),
                  ),
                  duration: part.duration,
                  onTap: () => context.push(
                    Routes.player(bookId),
                    extra: {'startPart': part.number, 'startPosition': 0},
                  ),
                ),
              ),
            ] else ...[
              const SizedBox(height: 12),
              Text(
                'Аудио загружается. Скоро здесь появятся части разбора.',
                style: AppTypography.caption.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ],

            // — Ритм выхода частей —
            // Спокойная строка о том, что разбор пополняется каждую неделю. Без
            // конкретных дат: части появляются по факту загрузки, а не по
            // расписанию. Показываем только пока есть неоткрытые части — если
            // все части месяца уже вышли (или это архив), обещать новые нельзя.
            if (hasUpcomingParts) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(
                    Icons.event_repeat,
                    size: 15,
                    color: AppColors.textTertiary,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Новые части разбора выходят по понедельникам',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ],

            // — Описание книги —
            if (description.isNotEmpty) ...[
              const SizedBox(height: 28),
              Text(
                'О книге',
                style: AppTypography.sectionHeader,
              ),
              const SizedBox(height: 8),
              Text(
                description,
                style: AppTypography.body,
              ),
            ],

            // — Расписание частей —
            if (club.partSchedule.isNotEmpty) ...[
              const SizedBox(height: 28),
              Text(
                'Расписание открытия частей',
                style: AppTypography.sectionHeader,
              ),
              const SizedBox(height: 12),
              ...club.partSchedule.map((p) => _PartScheduleRow(part: p)),
            ],
          ],
        ),
      ),
    );
  }
}

/// Части разбора из сырого JSON книги: номер, название, длительность (сек).
/// Сортируем по номеру — порядок в БД не гарантирован.
List<({int number, String title, int duration})> _parseParts(dynamic raw) {
  if (raw is! List) return const [];
  final parts = <({int number, String title, int duration})>[];
  for (final item in raw) {
    if (item is! Map) continue;
    final number = (item['number'] as num?)?.toInt() ?? 0;
    if (number <= 0) continue;
    parts.add((
      number: number,
      title: item['title']?.toString() ?? '',
      duration: (item['duration'] as num?)?.toInt() ?? 0,
    ));
  }
  parts.sort((a, b) => a.number.compareTo(b.number));
  return parts;
}

/// Строка части во вкладке клуба. Тап → плеер с этой части.
/// Замок не нужен: в клуб без доступа не пускает пейвол, а архив открыт весь.
class _ClubPartRow extends StatelessWidget {
  const _ClubPartRow({
    required this.label,
    required this.subtitle,
    required this.duration,
    required this.onTap,
  });

  final String label;
  final String subtitle;
  final int duration;
  final VoidCallback onTap;

  String get _durationText {
    if (duration <= 0) return '';
    final minutes = (duration / 60).round();
    return '$minutes мин';
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.cardBackground,
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          boxShadow: AppColors.cardShadow,
        ),
        child: Row(
          children: [
            const Icon(Icons.play_circle_outline,
                size: 22, color: AppColors.terracotta),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: AppTypography.microBold.copyWith(
                      color: AppColors.terracotta,
                      letterSpacing: 0.5,
                    ),
                  ),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: AppTypography.bodyMedium,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            if (_durationText.isNotEmpty) ...[
              const SizedBox(width: 12),
              Text(_durationText, style: AppTypography.caption),
            ],
          ],
        ),
      ),
    );
  }
}

/// Чип с периодом действия клуба: «10.05 — 09.06».
class _PeriodChip extends StatelessWidget {
  const _PeriodChip({required this.startsAt, required this.endsAt});
  final DateTime startsAt;
  final DateTime endsAt;

  @override
  Widget build(BuildContext context) {
    String fmt(DateTime d) =>
        '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceMedium,
        borderRadius: BorderRadius.circular(AppSpacing.radiusChip),
      ),
      child: Text(
        '${fmt(startsAt)} — ${fmt(endsAt)}',
        style: AppTypography.smallMedium,
      ),
    );
  }
}

/// Строка расписания: «Часть N открывается DD.MM».
/// Если уже открыта (opensAt <= now) — без указания даты.
class _PartScheduleRow extends StatelessWidget {
  const _PartScheduleRow({required this.part});
  final PartSchedule part;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final isOpen = !part.opensAt.isAfter(now);

    final dd = part.opensAt.day.toString().padLeft(2, '0');
    final mm = part.opensAt.month.toString().padLeft(2, '0');

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(
            isOpen ? Icons.check_circle : Icons.lock_clock,
            size: 18,
            color: isOpen ? AppColors.success : AppColors.textTertiary,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              isOpen
                  ? 'Часть ${part.partNumber} — доступна'
                  : 'Часть ${part.partNumber} — откроется $dd.$mm',
              style: AppTypography.body.copyWith(
                color: isOpen ? AppColors.textPrimary : AppColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
