/// Окна продаж СЕЗОННОЙ подписки (согласовано 10-11.07.2026,
/// финальные тексты — 11.07.2026).
///
/// Сезоны = времена года: лето (июнь-август), осень (сентябрь-ноябрь),
/// зима (декабрь-февраль), весна (март-май).
///
/// Правила витрины (только НОВЫЕ покупки; автопродление купленных сезонов
/// идёт на стороне Apple и окон не касается):
/// - АНОНС: с 15-го числа последнего месяца текущего сезона до конца этого
///   месяца (напр. 15-31 августа для осеннего) — плашка-анонс, купить нельзя.
/// - ОКНО ПОКУПКИ: весь ПЕРВЫЙ месяц сезона (сентябрь/декабрь/март/июнь) —
///   карточка «Сезон» видна и покупаема, с окном «до 30 сентября».
/// - ВНЕ ОКОН: карточки Сезон нет вовсе, только Месяц.
///
/// ⚠️ Формулировки в UI — спокойно-информативные, без таймеров и
/// «только сегодня!» — Apple ревью не любит manipulative scarcity.
/// ⚠️ «По цене двух»: честная математика при базовых ценах ASC
/// monthly $27.99 × 2 = $55.98 ≥ season $54.99. Если цены в ASC когда-нибудь
/// изменятся — ПЕРЕПРОВЕРИТЬ эту фразу (openCardNote/announceText/
/// clubBannerText), иначе она станет враньём.
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

  /// Название сезона по его ПЕРВОМУ месяцу (строчными: «осенний»).
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

  /// То же с заглавной («Осенний») — для заголовка карточки.
  static String _seasonNameCapByFirstMonth(int month) {
    final name = _seasonNameByFirstMonth(month);
    return name[0].toUpperCase() + name.substring(1);
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

  static const Map<int, String> _monthNominative = {
    1: 'январь',
    2: 'февраль',
    3: 'март',
    4: 'апрель',
    5: 'май',
    6: 'июнь',
    7: 'июль',
    8: 'август',
    9: 'сентябрь',
    10: 'октябрь',
    11: 'ноябрь',
    12: 'декабрь',
  };

  /// Последний день ПЕРВОГО месяца сезона (окно оформления):
  /// 30 сентября / 31 декабря / 31 марта / 30 июня.
  static String _openUntil(int firstMonth) {
    final lastDay = DateTime(2000, firstMonth + 1, 0).day; // 30 или 31
    return '$lastDay ${_monthGenitive[firstMonth]}';
  }

  /// «Сентябрь, октябрь и ноябрь» — три месяца сезона по его первому месяцу.
  static String _seasonMonthsList(int firstMonth) {
    final m1 = _monthNominative[firstMonth]!;
    final m2 = _monthNominative[firstMonth % 12 + 1]!;
    final m3 = _monthNominative[(firstMonth + 1) % 12 + 1]!;
    return '${m1[0].toUpperCase()}${m1.substring(1)}, $m2 и $m3';
  }

  /// Заголовок карточки Сезона в окно покупки.
  /// Пример: «Осенний сезон · 3 месяца».
  static String cardTitle() {
    return '${_seasonNameCapByFirstMonth(now.month)} сезон · 3 месяца';
  }

  /// Подпись на карточке Сезона в окно покупки (фаза open).
  /// Пример: «Сентябрь, октябрь и ноябрь — по цене двух месяцев.
  /// Оформление открыто до 30 сентября. Продлевается автоматически.»
  static String openCardNote() {
    final m = now.month;
    return '${_seasonMonthsList(m)} — по цене двух месяцев. '
        'Оформление открыто до ${_openUntil(m)}. '
        'Продлевается автоматически.';
  }

  /// Текст плашки-анонса на paywall (фаза announce).
  /// Пример: «С 1 сентября — осенний сезон: три месяца клуба по цене двух».
  static String announceText() {
    final d = now;
    final firstMonth = d.month == 12 ? 1 : d.month + 1;
    final name = _seasonNameByFirstMonth(firstMonth);
    final genitive = _monthGenitive[firstMonth] ?? '';
    return 'С 1 $genitive — $name сезон: три месяца клуба по цене двух';
  }

  /// Текст плашки в КЛУБЕ и полоски на ГЛАВНОЙ (для действующих подписчиц
  /// и всех, кто на главной): анонс или окно.
  static String? clubBannerText() {
    switch (phase()) {
      case SeasonPhase.announce:
        final firstMonth = now.month == 12 ? 1 : now.month + 1;
        final name = _seasonNameByFirstMonth(firstMonth);
        final genitive = _monthGenitive[firstMonth] ?? '';
        return 'С 1 $genitive — $name сезон: три месяца по цене двух';
      case SeasonPhase.open:
        final name = _seasonNameByFirstMonth(now.month);
        return '${name[0].toUpperCase()}${name.substring(1)} сезон открыт: '
            'три месяца по цене двух — оформление до ${_openUntil(now.month)}';
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
