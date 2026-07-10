/// Окна продаж СЕЗОННОЙ подписки (согласовано 10-11.07.2026).
///
/// Сезоны = времена года: лето (июнь-август), осень (сентябрь-ноябрь),
/// зима (декабрь-февраль), весна (март-май).
///
/// Правила витрины (только НОВЫЕ покупки; автопродление купленных сезонов
/// идёт на стороне Apple и окон не касается):
/// - АНОНС: с 15-го числа последнего месяца текущего сезона до конца этого
///   месяца (напр. 15-31 августа для осеннего) — плашка-анонс, купить нельзя.
/// - ОКНО ПОКУПКИ: весь ПЕРВЫЙ месяц сезона (сентябрь/декабрь/март/июнь) —
///   карточка «Сезон» видна и покупаема, с подписью «в течение <месяца>».
/// - ВНЕ ОКОН: карточки Сезон нет вовсе, только Месяц.
///
/// ⚠️ Формулировки в UI — спокойно-информативные, без таймеров и
/// «только сегодня!» — Apple ревью не любит manipulative scarcity.
///
/// ТЕСТОВАЯ РУЧКА: debugNowOverride подменяет «сегодня» для всей формулы.
/// На paywall тройной тап по заголовку циклически переключает даты
/// (реальная → 20 авг → 5 сен → 10 окт) — проверка всего календаря глазами
/// на одном билде. ⚠️ Перед сабмитом в App Store жест убрать (Фаза 7).
enum SeasonPhase {
  /// Вне окон — сезон не показываем вообще.
  none,

  /// Анонс (15-е — конец месяца перед сезоном): плашка, без покупки.
  announce,

  /// Окно покупки (первый месяц сезона): карточка Сезон видна.
  open,
}

class SeasonWindow {
  SeasonWindow._();

  /// Тестовая подмена «сегодня». null = реальная дата.
  static DateTime? debugNowOverride;

  static DateTime get now => debugNowOverride ?? DateTime.now();

  /// Первые месяцы сезонов: март, июнь, сентябрь, декабрь.
  static const List<int> _firstMonths = [3, 6, 9, 12];

  /// Текущая фаза окна продаж.
  static SeasonPhase phase() {
    final d = now;
    if (_firstMonths.contains(d.month)) return SeasonPhase.open;
    final nextMonth = d.month == 12 ? 1 : d.month + 1;
    if (_firstMonths.contains(nextMonth) && d.day >= 15) {
      return SeasonPhase.announce;
    }
    return SeasonPhase.none;
  }

  /// Название сезона по его ПЕРВОМУ месяцу.
  static String _seasonNameByFirstMonth(int month) {
    switch (month) {
      case 3:
        return 'весенний';
      case 6:
        return 'летний';
      case 9:
        return 'осенний';
      case 12:
        return 'зимний';
      default:
        return 'новый';
    }
  }

  static const Map<int, String> _monthGenitive = {
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

  /// Текст плашки-анонса (фаза announce).
  /// Пример: «С 1 сентября — осенний сезон: 3 месяца клуба одной оплатой».
  static String announceText() {
    final d = now;
    final firstMonth = d.month == 12 ? 1 : d.month + 1;
    final name = _seasonNameByFirstMonth(firstMonth);
    final genitive = _monthGenitive[firstMonth] ?? '';
    return 'С 1 $genitive — $name сезон: 3 месяца клуба одной оплатой';
  }

  /// Подпись на карточке Сезона в окно покупки (фаза open).
  /// Пример: «Оформление — в течение сентября. Продлевается автоматически
  /// каждые 3 месяца.»
  static String openCardNote() {
    final genitive = _monthGenitive[now.month] ?? '';
    return 'Оформление — в течение $genitive. '
        'Продлевается автоматически каждые 3 месяца.';
  }

  /// Текст плашки в КЛУБЕ (для действующих подписчиц): анонс или окно.
  static String? clubBannerText() {
    switch (phase()) {
      case SeasonPhase.announce:
        return announceText();
      case SeasonPhase.open:
        final name = _seasonNameByFirstMonth(now.month);
        final genitive = _monthGenitive[now.month] ?? '';
        return 'Сейчас можно оформить $name сезон — 3 месяца одной оплатой, в течение $genitive';
      case SeasonPhase.none:
        return null;
    }
  }

  /// Цикл тестовых дат для скрытого жеста на paywall.
  /// null → 20 авг (анонс) → 5 сен (окно) → 10 окт (нет) → null …
  static String cycleDebugDate() {
    final year = DateTime.now().year;
    if (debugNowOverride == null) {
      debugNowOverride = DateTime(year, 8, 20);
      return 'Тест сезонов: сегодня = 20 августа (анонс)';
    }
    if (debugNowOverride!.month == 8) {
      debugNowOverride = DateTime(year, 9, 5);
      return 'Тест сезонов: сегодня = 5 сентября (окно покупки)';
    }
    if (debugNowOverride!.month == 9) {
      debugNowOverride = DateTime(year, 10, 10);
      return 'Тест сезонов: сегодня = 10 октября (без сезона)';
    }
    debugNowOverride = null;
    return 'Тест сезонов: реальная дата';
  }
}
