import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../models/club_month.dart';

/// Таб «Разборы» на экране клуба. Источник: MASTER.md секция 4.21.
///
/// Содержит:
/// - Обложка книги
/// - Название + автор
/// - Описание книги (если есть в bookJson)
/// - Кнопка «Слушать разбор» → переход на BookScreen
/// - Список частей с расписанием (если есть partSchedule)
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

            // — Кнопка «Слушать разбор» —
            AppButton(
              text: 'Слушать разбор',
              onPressed: () => context.push(Routes.book(bookId)),
            ),

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
