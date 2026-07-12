import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/quote.dart';
import '../models/weekly_report.dart';
import '../services/diary_service.dart';

/// Лента цитат дневника (4.24). Новые сверху.
///
/// Обновление после сохранения/удаления цитаты:
///   ref.invalidate(quotesProvider);
final quotesProvider = FutureProvider<List<QuoteModel>>((ref) async {
  final service = ref.read(diaryServiceProvider);
  return service.fetchQuotes();
});

/// Одна цитата с разбором (экран 4.25).
/// Если анализ ещё считается (aiStatus='pending') — экран перезапрашивает
/// эту цитату через invalidate.
final quoteProvider =
    FutureProvider.family<QuoteModel, String>((ref, id) async {
  final service = ref.read(diaryServiceProvider);
  return service.fetchQuote(id);
});

/// Последний еженедельный отчёт (4.26). null — отчётов ещё нет,
/// тогда кнопка «Еженедельный отчёт» в дневнике не показывается.
final latestReportProvider = FutureProvider<WeeklyReportModel?>((ref) async {
  final service = ref.read(diaryServiceProvider);
  return service.fetchLatestReport();
});

/// Статистика дневника для шапки (4.24): цитат · анализов · дней подряд.
class DiaryStats {
  const DiaryStats({
    required this.quotesCount,
    required this.analysesCount,
    required this.streakDays,
  });

  final int quotesCount;
  final int analysesCount;
  final int streakDays;
}

/// Считаем статистику из загруженной ленты (сервер отдельного эндпоинта не даёт).
/// streak — сколько дней подряд, начиная с сегодня (или вчера), есть цитаты.
DiaryStats calculateDiaryStats(List<QuoteModel> quotes) {
  if (quotes.isEmpty) {
    return const DiaryStats(quotesCount: 0, analysesCount: 0, streakDays: 0);
  }

  final analyses = quotes.where((q) => q.hasAnalysis).length;

  // Множество дней (без времени), в которые была хотя бы одна цитата.
  final days = <DateTime>{};
  for (final q in quotes) {
    final d = q.createdAt.toLocal();
    days.add(DateTime(d.year, d.month, d.day));
  }

  final now = DateTime.now();
  var cursor = DateTime(now.year, now.month, now.day);

  // Если сегодня цитат ещё нет — streak может тянуться со вчера.
  if (!days.contains(cursor)) {
    cursor = cursor.subtract(const Duration(days: 1));
  }

  var streak = 0;
  while (days.contains(cursor)) {
    streak += 1;
    cursor = cursor.subtract(const Duration(days: 1));
  }

  return DiaryStats(
    quotesCount: quotes.length,
    analysesCount: analyses,
    streakDays: streak,
  );
}

/// Действия дневника: сохранить / удалить цитату.
final diaryActionsProvider = Provider<DiaryActions>((ref) {
  return DiaryActions(ref);
});

class DiaryActions {
  DiaryActions(this._ref);
  final Ref _ref;

  /// Сохранить цитату. Возвращает созданную цитату
  /// (aiStatus='pending', если ИИ включён — разбор досчитается на сервере).
  Future<QuoteModel> createQuote({
    required String text,
    String? author,
    String? bookTitle,
    String? bookId,
    int? audioTimestamp,
  }) async {
    final service = _ref.read(diaryServiceProvider);
    final quote = await service.createQuote(
      text: text,
      author: author,
      bookTitle: bookTitle,
      bookId: bookId,
      audioTimestamp: audioTimestamp,
    );

    _ref.invalidate(quotesProvider);
    return quote;
  }

  /// Удалить свою цитату.
  Future<void> deleteQuote(String id) async {
    final service = _ref.read(diaryServiceProvider);
    await service.deleteQuote(id);
    _ref.invalidate(quotesProvider);
  }
}
