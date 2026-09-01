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
  success, // покупка подтверждена сервером (ТОЛЬКО реальная покупка, не restore)
  restored, // восстановление по кнопке подтверждено (доступ обновлён)
  error,
}

class PaywallState {
  const PaywallState({
    this.status = PaywallStatus.initial,
    this.products = const [],
    this.entitlements,
    this.errorMessage,
    this.infoMessage,
  });

  final PaywallStatus status;
  final List<ProductDetails> products;
  final Map<String, dynamic>? entitlements; // сводка прав из ответа /verify
  final String? errorMessage;

  /// Информационное сообщение (не ошибка) — напр. «Активных покупок не
  /// найдено» после restore без транзакций (P3). Как и errorMessage,
  /// НЕ переносится через copyWith — живёт ровно одно обновление стейта.
  final String? infoMessage;

  PaywallState copyWith({
    PaywallStatus? status,
    List<ProductDetails>? products,
    Map<String, dynamic>? entitlements,
    String? errorMessage,
    String? infoMessage,
  }) {
    return PaywallState(
      status: status ?? this.status,
      products: products ?? this.products,
      entitlements: entitlements ?? this.entitlements,
      errorMessage: errorMessage,
      infoMessage: infoMessage,
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

  /// ⚠️ АВТО-RESTORE УБРАН (решение 11.07.2026).
  ///
  /// StoreKit при запуске приложения сам скармливает в purchaseStream старые
  /// (restored/незавершённые) транзакции. Раньше провайдер отправлял их на
  /// verify без разбора → подписка «тихо» реанимировалась при каждом входе и
  /// привязывалась к ЛЮБОМУ залогиненному юзеру приложения (один Apple ID
  /// раздавал подписку разным аккаунтам — дыра). Теперь restored-транзакции
  /// верифицируются ТОЛЬКО если восстановление явно запросил пользователь
  /// кнопкой «Восстановить покупки» (_restoreRequested). Иначе транзакция
  /// просто завершается (complete), ничего не привязывая.
  ///
  /// Сверка appAccountToken транзакции с юзером на сервере при verify/restore
  /// (чтобы чужую транзакцию нельзя было привязать вообще) — отдельная задача
  /// на потом (вариант 2, AI-CONTEXT-3).
  bool _restoreRequested = false;

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
  /// appAccountToken (B2): UUID, детерминированно построенный из userId.
  /// Apple прикрепит его к транзакции и пришлёт в каждом S2S-уведомлении.
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

  /// Восстановить ранее совершённые покупки (кнопка на paywall).
  /// Только этот путь разрешает верификацию restored-транзакций.
  Future<void> restore() async {
    _restoreRequested = true;
    // Запоминаем статус до restore, чтобы вернуть его, если покупок нет
    // (ready / unavailable — оба возможны).
    final prevStatus = state.status == PaywallStatus.unavailable
        ? PaywallStatus.unavailable
        : PaywallStatus.ready;
    state = state.copyWith(status: PaywallStatus.purchasing);
    try {
      await _service.restore();
    } catch (_) {
      _restoreRequested = false;
      state = state.copyWith(
        status: PaywallStatus.error,
        errorMessage: 'Не удалось восстановить покупки',
      );
      return;
    }
    // P3: если у Apple ID нет покупок — StoreKit НЕ пришлёт ни одного события
    // в purchaseStream, и статус purchasing завис бы навсегда (вечный спиннер).
    // Ждём 3 с; если restored-транзакции так и не пришли — снимаем спиннер и
    // сообщаем пользователю. Реальные транзакции обработает _onPurchaseUpdates.
    await Future<void>.delayed(const Duration(seconds: 3));
    if (!mounted) return;
    if (_restoreRequested && state.status == PaywallStatus.purchasing) {
      _restoreRequested = false;
      state = state.copyWith(
        status: prevStatus,
        infoMessage: 'Активных покупок не найдено',
      );
    }
  }

  Future<void> _onPurchaseUpdates(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      // Единый purchaseStream плагина слышат ОБА провайдера: этот (подписка
      // «Клуб») и productPurchaseProvider (отдельные разборы/пакеты). Здесь
      // обрабатываем ТОЛЬКО клубную подписку — иначе покупка book.*/package.*
      // включила бы клубный success («переход в клуб») и прошла бы вторую,
      // ненужную верификацию. Отдельные товары завершает и верифицирует их
      // владелец — productPurchaseProvider.
      if (!PurchaseService.clubProductIds.contains(purchase.productID)) {
        continue;
      }
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
          // Реальная покупка → verify → success (paywall уводит в клуб).
          await _verify(purchase, isRestore: false);
          break;
        case PurchaseStatus.restored:
          if (_restoreRequested) {
            // Пользователь явно нажал «Восстановить покупки».
            await _verify(purchase, isRestore: true);
          } else {
            // Авто-выдача StoreKit при запуске: НЕ верифицируем и НЕ
            // привязываем — только закрываем транзакцию, чтобы StoreKit
            // не повторял её бесконечно. Доступ решает сервер по базе.
            await _service.complete(purchase);
          }
          break;
      }
    }
    // Явный restore обслужен этой пачкой — сбрасываем флаг, чтобы
    // последующие авто-выдачи StoreKit снова игнорировались.
    if (_restoreRequested &&
        purchases.any((p) => p.status == PurchaseStatus.restored)) {
      _restoreRequested = false;
    }
  }

  Future<void> _verify(PurchaseDetails purchase, {required bool isRestore}) async {
    state = state.copyWith(status: PaywallStatus.verifying);
    try {
      final jws = purchase.verificationData.serverVerificationData;
      final entitlements = await _service.verifyOnServer(jws);
      state = state.copyWith(
        status: isRestore ? PaywallStatus.restored : PaywallStatus.success,
        entitlements: entitlements,
      );
      // P6: complete() ТОЛЬКО после успешной верификации сервером.
      await _service.complete(purchase);
    } catch (e) {
      // 1.0.2: транзакция ДРУГОГО аккаунта приложения (403 PURCHASE_INVALID) —
      // завершаем её на устройстве, иначе она навсегда застревает в очереди
      // StoreKit и блокирует остальные покупки. Доступа она не даёт; у Apple
      // покупка владельца сохраняется, он вернёт её через «Восстановить».
      if (PurchaseService.isForeignAccountError(e)) {
        try {
          await _service.complete(purchase);
        } catch (_) {
          // Не удалось завершить — StoreKit доставит снова, попробуем ещё.
        }
        state = state.copyWith(
          status: PaywallStatus.error,
          errorMessage: 'Эта подписка оформлена под другим аккаунтом',
        );
        return;
      }
      // Остальные ошибки: транзакцию НЕ завершаем — StoreKit пере-доставит её
      // при следующем запуске, и verify повторится (иначе оплаченная покупка
      // потерялась бы).
      state = state.copyWith(
        status: PaywallStatus.error,
        errorMessage: isRestore
            ? 'Не удалось восстановить покупки'
            : 'Не удалось подтвердить покупку',
      );
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
