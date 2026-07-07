import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../../../core/storage/secure_storage.dart';
import '../services/purchase_service.dart';

/// Статус paywall. Назван PaywallStatus, чтобы не путать с PurchaseStatus
/// из самого in_app_purchase.
enum PaywallStatus {
  initial,
  loading, // проверка доступности + загрузка продуктов
  ready, // продукты загружены, можно покупать
  unavailable, // покупки недоступны / продукты не найдены (напр. ещё не созданы)
  purchasing, // идёт системный диалог Apple
  verifying, // проверка чека на бэкенде
  success, // покупка подтверждена сервером
  error,
}

class PaywallState {
  const PaywallState({
    this.status = PaywallStatus.initial,
    this.products = const [],
    this.entitlements,
    this.errorMessage,
  });

  final PaywallStatus status;
  final List<ProductDetails> products;
  final Map<String, dynamic>? entitlements; // сводка прав из ответа /verify
  final String? errorMessage;

  PaywallState copyWith({
    PaywallStatus? status,
    List<ProductDetails>? products,
    Map<String, dynamic>? entitlements,
    String? errorMessage,
  }) {
    return PaywallState(
      status: status ?? this.status,
      products: products ?? this.products,
      entitlements: entitlements ?? this.entitlements,
      errorMessage: errorMessage,
    );
  }
}

final purchaseProvider =
    StateNotifierProvider<PurchaseNotifier, PaywallState>((ref) {
  return PurchaseNotifier(
    ref.read(purchaseServiceProvider),
    ref.read(secureStorageProvider),
  );
});

class PurchaseNotifier extends StateNotifier<PaywallState> {
  PurchaseNotifier(this._service, this._storage) : super(const PaywallState()) {
    _init();
  }

  final PurchaseService _service;
  final SecureStorage _storage;
  StreamSubscription<List<PurchaseDetails>>? _sub;

  Future<void> _init() async {
    state = state.copyWith(status: PaywallStatus.loading);

    final available = await _service.isAvailable();
    if (!available) {
      state = state.copyWith(status: PaywallStatus.unavailable);
      return;
    }

    // Подписываемся на обновления покупок ДО запроса продуктов.
    _sub = _service.purchaseStream.listen(
      _onPurchaseUpdates,
      onError: (Object _) {
        state = state.copyWith(
          status: PaywallStatus.error,
          errorMessage: 'Ошибка App Store',
        );
      },
    );

    try {
      final products = await _service.loadProducts(PurchaseService.clubProductIds);
      if (products.isEmpty) {
        state = state.copyWith(status: PaywallStatus.unavailable, products: products);
        return;
      }
      products.sort((a, b) => a.rawPrice.compareTo(b.rawPrice));
      state = state.copyWith(status: PaywallStatus.ready, products: products);
    } catch (_) {
      state = state.copyWith(status: PaywallStatus.unavailable);
    }
  }

  /// Начать покупку выбранного тарифа.
  ///
  /// appAccountToken (B2): UUID, детерминированно построенный из userId
  /// (SecureStorage → PurchaseService.appAccountTokenFromUserId). Apple
  /// прикрепит его к транзакции и будет присылать в каждом S2S-уведомлении —
  /// сервер найдёт юзера по продлению, даже если записи Purchase ещё нет
  /// (переустановка приложения до restore и т.п.). Если userId недоступен —
  /// токен null, покупка идёт как раньше (verify привяжет по JWT).
  Future<void> buy(ProductDetails product) async {
    state = state.copyWith(status: PaywallStatus.purchasing);
    try {
      final userId = await _storage.getUserId();
      final token = PurchaseService.appAccountTokenFromUserId(userId);
      await _service.buy(product, appAccountToken: token);
    } catch (_) {
      state = state.copyWith(
        status: PaywallStatus.error,
        errorMessage: 'Не удалось начать покупку',
      );
    }
  }

  /// Восстановить ранее совершённые покупки.
  Future<void> restore() async {
    state = state.copyWith(status: PaywallStatus.purchasing);
    try {
      await _service.restore();
    } catch (_) {
      state = state.copyWith(
        status: PaywallStatus.error,
        errorMessage: 'Не удалось восстановить покупки',
      );
    }
  }

  Future<void> _onPurchaseUpdates(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      switch (purchase.status) {
        case PurchaseStatus.pending:
          state = state.copyWith(status: PaywallStatus.purchasing);
          break;
        case PurchaseStatus.canceled:
          state = state.copyWith(status: PaywallStatus.ready);
          await _service.complete(purchase);
          break;
        case PurchaseStatus.error:
          state = state.copyWith(
            status: PaywallStatus.error,
            errorMessage: purchase.error?.message ?? 'Покупка не завершена',
          );
          await _service.complete(purchase);
          break;
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          await _verify(purchase);
          break;
      }
    }
  }

  Future<void> _verify(PurchaseDetails purchase) async {
    state = state.copyWith(status: PaywallStatus.verifying);
    try {
      final jws = purchase.verificationData.serverVerificationData;
      final entitlements = await _service.verifyOnServer(jws);
      state = state.copyWith(
        status: PaywallStatus.success,
        entitlements: entitlements,
      );
    } catch (_) {
      state = state.copyWith(
        status: PaywallStatus.error,
        errorMessage: 'Не удалось подтвердить покупку',
      );
    } finally {
      await _service.complete(purchase);
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
