import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../../../core/storage/secure_storage.dart';
import '../services/purchase_service.dart';

/// Покупка ОТДЕЛЬНОГО товара — разбор `book.<slug>` или пакет
/// `package.<slug>` (Non-Consumable Apple IAP). Задача 3.2 (расширение:
/// в STEP-BY-STEP 3.2 описана подписка «Клуб»; отдельные товары — та же
/// StoreKit-механика, вынесены сюда, чтобы не мешать paywall-стейт клуба).
///
/// Клубную подписку покупает purchaseProvider (paywall). Здесь — только разовые
/// товары. Оба провайдера слушают ЕДИНЫЙ purchaseStream плагина, поэтому каждый
/// строго фильтрует свои productId: этот берёт book.*/package.*, клубный —
/// club.* (см. фильтр в purchase_provider._onPurchaseUpdates). Иначе одна
/// транзакция обработалась бы дважды.
///
/// Провайдер намеренно НЕ autoDispose: подписка на purchaseStream живёт всё
/// время работы приложения, чтобы поймать событие покупки, даже если экран
/// разбора уже закрыт (системный диалог Apple мог задержаться).
enum ProductPurchaseStatus {
  idle,
  purchasing, // загрузка продукта / системный диалог Apple
  verifying, // проверка чека на бэкенде
  success, // покупка подтверждена сервером
  restored, // товар уже куплен — StoreKit вернул restore (доступ есть по БД)
  error,
}

class ProductPurchaseState {
  const ProductPurchaseState({
    this.status = ProductPurchaseStatus.idle,
    this.productId,
    this.errorMessage,
  });

  final ProductPurchaseStatus status;

  /// productId, к которому относится текущий статус (book.<slug>/package.<slug>).
  /// Экран сверяет его со своим, чтобы реагировать только на «свою» покупку.
  final String? productId;

  final String? errorMessage;
}

final productPurchaseProvider =
    StateNotifierProvider<ProductPurchaseNotifier, ProductPurchaseState>((ref) {
  return ProductPurchaseNotifier(
    ref.read(purchaseServiceProvider),
    ref.read(secureStorageProvider),
  );
});

class ProductPurchaseNotifier extends StateNotifier<ProductPurchaseState> {
  ProductPurchaseNotifier(this._service, this._storage)
      : super(const ProductPurchaseState()) {
    // Подписываемся синхронно в конструкторе (до любого buy) — слушатель
    // гарантированно активен к моменту, когда StoreKit пришлёт событие покупки.
    _sub = _service.purchaseStream.listen(
      _onPurchaseUpdates,
      onError: (Object _) {
        state = const ProductPurchaseState(
          status: ProductPurchaseStatus.error,
          errorMessage: 'Ошибка App Store',
        );
      },
    );
  }

  final PurchaseService _service;
  final SecureStorage _storage;
  StreamSubscription<List<PurchaseDetails>>? _sub;

  /// Наши товары — только разовые: book.* и package.*.
  static bool _isProduct(String productId) =>
      productId.startsWith('book.') || productId.startsWith('package.');

  /// Купить отдельный товар по Apple productId (book.<slug>/package.<slug>).
  Future<void> buy(String productId) async {
    if (!_isProduct(productId)) {
      state = ProductPurchaseState(
        status: ProductPurchaseStatus.error,
        productId: productId,
        errorMessage: 'Неверный тип товара',
      );
      return;
    }

    state = ProductPurchaseState(
      status: ProductPurchaseStatus.purchasing,
      productId: productId,
    );

    try {
      final products = await _service.loadProducts({productId});
      if (products.isEmpty) {
        state = ProductPurchaseState(
          status: ProductPurchaseStatus.error,
          productId: productId,
          errorMessage: 'Товар недоступен в App Store',
        );
        return;
      }
      final userId = await _storage.getUserId();
      final token = PurchaseService.appAccountTokenFromUserId(userId);
      await _service.buy(products.first, appAccountToken: token);
      // Дальнейшее (pending → purchased → verify) приходит через purchaseStream.
    } catch (_) {
      state = ProductPurchaseState(
        status: ProductPurchaseStatus.error,
        productId: productId,
        errorMessage: 'Не удалось начать покупку',
      );
    }
  }

  Future<void> _onPurchaseUpdates(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      // Не наш товар (club.* подписка / archive.*) — пропускаем: его обработает
      // и завершит владелец (purchaseProvider). Не трогаем, чтобы не было
      // двойной обработки одной транзакции из общего purchaseStream.
      if (!_isProduct(purchase.productID)) continue;

      switch (purchase.status) {
        case PurchaseStatus.pending:
          state = ProductPurchaseState(
            status: ProductPurchaseStatus.purchasing,
            productId: purchase.productID,
          );
          break;
        case PurchaseStatus.canceled:
          state = ProductPurchaseState(
            status: ProductPurchaseStatus.idle,
            productId: purchase.productID,
          );
          await _service.complete(purchase);
          break;
        case PurchaseStatus.error:
          state = ProductPurchaseState(
            status: ProductPurchaseStatus.error,
            productId: purchase.productID,
            errorMessage: purchase.error?.message ?? 'Покупка не завершена',
          );
          await _service.complete(purchase);
          break;
        case PurchaseStatus.purchased:
          await _verify(purchase);
          break;
        case PurchaseStatus.restored:
          // Non-consumable может прийти как restored (переустановка / авто-выдача
          // StoreKit при запуске, а также повторная покупка того же товара в
          // Sandbox). Доступ к купленным товарам сервер и так считает по БД
          // (userHasBookAccess: purchasedBooks/purchasedPackages), поэтому НЕ
          // верифицируем повторно и НЕ привязываем — только завершаем транзакцию,
          // чтобы StoreKit не повторял её. Та же модель безопасности, что в
          // paywall (решение 11.07.2026).
          await _service.complete(purchase);
          // Сообщаем экрану (если открыт), что доступ к этому товару подтверждён:
          // пусть перечитает каталог/доступ, чтобы «Куплено» появилось сразу без
          // ручного refresh. На холодном старте эти экраны не смонтированы, так
          // что авто-restore при запуске лишних обновлений не вызовет.
          state = ProductPurchaseState(
            status: ProductPurchaseStatus.restored,
            productId: purchase.productID,
          );
          break;
      }
    }
  }

  Future<void> _verify(PurchaseDetails purchase) async {
    state = ProductPurchaseState(
      status: ProductPurchaseStatus.verifying,
      productId: purchase.productID,
    );
    try {
      final jws = purchase.verificationData.serverVerificationData;
      await _service.verifyOnServer(jws);
      state = ProductPurchaseState(
        status: ProductPurchaseStatus.success,
        productId: purchase.productID,
      );
    } catch (_) {
      state = ProductPurchaseState(
        status: ProductPurchaseStatus.error,
        productId: purchase.productID,
        errorMessage: 'Не удалось подтвердить покупку',
      );
    } finally {
      await _service.complete(purchase);
    }
  }

  /// Сброс в исходное состояние — вызывает экран после того, как обработал
  /// success/error (показал тост, обновил доступ), чтобы состояние не «залипло».
  void reset() {
    state = const ProductPurchaseState();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
