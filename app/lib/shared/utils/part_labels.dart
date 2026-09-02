/// Подписи аудио-частей разбора (1.0.2).
///
/// Один источник правды для двух экранов: список частей на карточке разбора
/// (features/book) и список частей во вкладке клуба (features/club). Раньше
/// подпись строилась только в первом; когда части появились и в клубе, логику
/// вынесли сюда, чтобы «Приветствие» и нумерация не разъехались.
///
/// ПРАВИЛО. Приветствие ведущей грузится ПЕРВОЙ частью с названием
/// «Приветствие» (так описано в docs/CLUB-UPLOAD-GUIDE.md). Тогда:
/// - у него подпись «Приветствие», а не «Часть 1»;
/// - остальные части нумеруются со сдвигом, чтобы совпадать с тем, как их
///   назвала админка: файл «Часть 1» лежит вторым и показывается «Часть 1».
/// Если приветствия нет (обычный разбор каталога) — всё как было: «Часть N».
library;

/// Часть №1, названная «Приветствие…» — приветствие ведущей.
bool isGreetingPart(int number, String title) {
  if (number != 1) return false;
  return title.trim().toLowerCase().startsWith('приветствие');
}

/// Есть ли в разборе приветствие первой частью.
bool hasGreetingPart(Iterable<({int number, String title})> parts) {
  return parts.any((p) => isGreetingPart(p.number, p.title));
}

/// Подпись части: «Приветствие» либо «Часть N» (со сдвигом, если есть
/// приветствие).
String partLabel({
  required int number,
  required String title,
  required bool hasGreeting,
}) {
  if (isGreetingPart(number, title)) return 'Приветствие';
  final displayNumber = hasGreeting ? number - 1 : number;
  return 'Часть $displayNumber';
}

/// Подпись части по книге: находит часть по номеру и строит подпись с учётом
/// приветствия. Для мест, где на руках вся книга (главная «Продолжить
/// слушать», «Мой прогресс»), — чтобы там не было «Часть 1» на приветствии.
String partLabelInBook({
  required int number,
  required Iterable<({int number, String title})> parts,
}) {
  final list = parts.toList(growable: false);
  final title = list
      .where((p) => p.number == number)
      .map((p) => p.title)
      .followedBy(const [''])
      .first;
  return partLabel(
    number: number,
    title: title,
    hasGreeting: hasGreetingPart(list),
  );
}

/// Сколько частей показывать в «Часть N из M»: приветствие в счёт разбора не
/// идёт.
int partsCountForDisplay({
  required int totalParts,
  required Iterable<({int number, String title})> parts,
}) {
  return hasGreetingPart(parts) ? totalParts - 1 : totalParts;
}

/// Вторая строка под подписью. Пустая, если название дублирует подпись
/// («Часть 1 · Часть 1») — тогда её не показываем.
String partSubtitle({
  required int number,
  required String title,
  required String label,
}) {
  if (isGreetingPart(number, title) &&
      title.trim().toLowerCase() == 'приветствие') {
    return 'Анна Бусел';
  }
  final t = title.trim();
  if (t.isEmpty) return '';
  if (t.toLowerCase() == label.trim().toLowerCase()) return '';
  return t;
}
