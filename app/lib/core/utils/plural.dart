/// Склонение существительных по числу (1.0.1).
///
/// plural(1, 'цитата', 'цитаты', 'цитат') → 'цитата'
/// plural(4, 'цитата', 'цитаты', 'цитат') → 'цитаты'
/// plural(5, 'цитата', 'цитаты', 'цитат') → 'цитат'
///
/// Тот же алгоритм, что razborWord в package_card (11-14 — всегда «many»).
String plural(int n, String one, String few, String many) {
  final mod10 = n % 10;
  final mod100 = n % 100;
  if (mod10 == 1 && mod100 != 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
