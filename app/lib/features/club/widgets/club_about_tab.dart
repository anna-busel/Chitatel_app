import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/utils/part_labels.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../../../shared/widgets/listen_button.dart';
import '../../book/widgets/book_parts_list.dart';
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
/// Кнопка и список частей — ТЕ ЖЕ виджеты, что в каталоге (ListenButton,
/// BookPartsList): вид и поведение обязаны совпадать, иначе клуб выглядит
/// «другим приложением».
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

    // Книга клуба — та же модель, что в каталоге: bookJson это документ Book
    // целиком (GET /api/club/current). Через модель получаем части и отдаём их
    // штатному BookPartsList, чтобы вид совпадал с карточкой разбора.
    final book = bookJson != null ? BookModel.fromJson(bookJson!) : null;
    final parts = book?.parts ?? const [];
    final hasGreeting = parts.isNotEmpty &&
        isGreetingPart(parts.first.number, parts.first.title);
    // Пока загружено только приветствие — так и пишем на кнопке, чтобы никто
    // не ждал разбор книги.
    final onlyGreeting = parts.length == 1 && hasGreeting;
    final buttonText = onlyGreeting ? 'Слушать приветствие' : 'Слушать разбор';

    // Градиент-подложка обложки — из модели (поле coverGradientColors). Раньше
    // здесь читался несуществующий ключ 'coverGradient', и всегда подставлялся
    // дефолт; теперь берём то же, что каталог.
    final gradientColors = book?.coverGradientColors ?? const <String>[];

    // Идёт ли месяц этого клуба — от этого зависит строка про новые части.
    // 1.0.2: раньше условие смотрело на club.partSchedule, но расписание в
    // админке не заполняется (сервер всегда сохраняет пустой список), поэтому
    // строка не показывалась НИ РАЗУ. Части действительно добавляются в
    // течение месяца, поэтому показываем, пока месяц клуба не закончился;
    // в архиве обещать новые части нельзя.
    final now = DateTime.now();
    final isClubRunning = now.isBefore(club.endsAt);

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
            //   (audio_service тянет прогресс по книге). Тот же зелёный вид,
            //   что на карточке разбора в каталоге.
            ListenButton(
              label: buttonText,
              enabled: parts.isNotEmpty,
              onTap: () => context.push(Routes.player(bookId)),
            ),

            // — Описание книги —
            // Без заголовка «О книге» — как на карточке разбора в каталоге,
            // где описание идёт просто текстом (1.0.2: клуб и каталог должны
            // выглядеть одинаково).
            if (description.isNotEmpty) ...[
              const SizedBox(height: 24),
              Text(
                description,
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ],

            // — Список частей: штатный виджет каталога. isPurchased: true —
            //   в клуб без доступа не пускает пейвол, а архив открыт целиком,
            //   поэтому замков здесь нет.
            if (book != null && parts.isNotEmpty) ...[
              const SizedBox(height: 20),
              BookPartsList(
                book: book,
                isPurchased: true,
                listenedPartNumbers: const <int>{},
                onPartTap: (part) => context.push(
                  Routes.player(bookId),
                  extra: {'startPart': part.number, 'startPosition': 0},
                ),
              ),
            ],

            // — Ритм выхода частей —
            // Спокойная строка о том, что разбор пополняется в течение месяца.
            // Без конкретных дат: части появляются по факту загрузки.
            if (isClubRunning) ...[
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
