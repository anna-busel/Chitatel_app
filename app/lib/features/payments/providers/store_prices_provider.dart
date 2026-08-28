import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/purchase_service.dart';

/// Живые локализованные цены из App Store по productId (1.0.1).
///
/// Раньше каталог, экран книги, пакеты, «Популярные» и шторка в плеере
/// показывали статичный priceUsd из нашей БД. У пользователей других
/// сторфронтов цифра на кнопке не совпадала с окном оплаты Apple — другая
/// валюта и сумма, выглядело как обман. Пейвол подписок уже брал цену из
/// StoreKit; теперь так делают и товары.
///
/// Использование в виджете:
///   final prices = ref.watch(storePricesProvider);
///   ref.read(storePricesProvider.notifier).ensure([book.appleProductId]);
///   final price = prices[book.appleProductId] ?? book.displayPriceUsd;
///
/// Пока StoreKit не ответил (или недоступен) — виджет показывает прежний
/// fallback из БД: хуже, чем было, не бывает.
final storePricesProvider =
    StateNotifierProvider<StorePricesNotifier, Map<String, String>>((ref) {
  return StorePricesNotifier(ref.read(purchaseServiceProvider));
});

class StorePricesNotifier extends StateNotifier<Map<String, String>> {
  StorePricesNotifier(this._service) : super(const {});

  final PurchaseService _service;

  /// productId, по которым запрос уже ушёл — защита от повторов при каждом
  /// build (ensure безопасно звать из build: state меняется после await).
  final Set<String> _requested = {};

  /// Догрузить цены для продуктов, которых ещё нет в карте.
  /// Идемпотентен; null и пустые id игнорируются; продукты запрашиваются
  /// у StoreKit одной пачкой.
  Future<void> ensure(Iterable<String?> productIds) async {
    final need = productIds
        .whereType<String>()
        .where((id) => id.isNotEmpty && !_requested.contains(id))
        .toSet();
    if (need.isEmpty) return;
    _requested.addAll(need);
    try {
      final products = await _service.loadProducts(need);
      if (!mounted) return;
      state = {
        ...state,
        for (final p in products) p.id: p.price,
      };
    } catch (_) {
      // StoreKit не ответил — снимаем бронь, чтобы попробовать в следующий раз.
      _requested.removeAll(need);
    }
  }
}
