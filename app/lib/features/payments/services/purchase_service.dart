import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';

/// Покупки через StoreKit 2 (плагин in_app_purchase) — задача 3.2.
///
/// Сервис намеренно общий: умеет загрузить и купить ЛЮБОЙ productId.
/// Сейчас paywall использует подписку «Клуб» (месяц + сезон), но позже сюда
/// без изменений добавятся «Навсегда» (archive.forever) и отдельные разборы.
///
/// ⚠️ in_app_purchase на iOS по умолчанию использует StoreKit 2 — тогда
/// `verificationData.serverVerificationData` это JWS транзакции, который и
/// проверяет бэкенд (POST /api/purchases/verify, задача 3.3).
final purchaseServiceProvider = Provider<PurchaseService>((ref) {
  return PurchaseService(ref.read(apiClientProvider));
});

class PurchaseService {
  PurchaseService(this._apiClient);

  final ApiClient _apiClient;
  final InAppPurchase _iap = InAppPurchase.instance;

  // Product ID должны ТОЧНО совпадать с создаными в App Store Connect
  // (задача 3.1 — создаёт Анна). Подписка «Клуб»: месяц + сезон (3 мес).
  // Премиум появится позже как club.premium.* в той же subscription group.
  static const String monthlyId = 'club.basic.monthly';
  static const String seasonId = 'club.basic.season';
  static const Set<String> clubProductIds = {monthlyId, seasonId};

  /// appAccountToken из userId (фикс B2 аудита 07.07.2026).
  ///
  /// Зачем: Apple прикрепляет этот UUID к транзакции и присылает его в каждом
  /// S2S-уведомлении (продление, refund). Сервер (webhook.service) находит по
  /// нему юзера, даже если записи Purchase ещё нет — например, участница
  /// переустановила приложение и автопродление пришло ДО restore. Без токена
  /// такое продление молча терялось и подписка в БД не продлевалась.
  ///
  /// Формат: Mongo ObjectId — 24 hex-символа (12 байт), UUID требует 32 hex
  /// (16 байт). Дополняем ObjectId восемью нулями справа и форматируем как
  /// канонический UUID 8-4-4-4-12. Преобразование детерминированное и
  /// обратимое — сервер снимает дефисы, проверяет нулевой хвост и берёт
  /// первые 24 hex (webhook.service.userIdFromAppAccountToken).
  ///
  /// Возвращает null, если userId отсутствует или не похож на ObjectId —
  /// тогда покупка идёт без токена (как раньше, verify по JWT всё равно
  /// привяжет её к юзеру).
  static String? appAccountTokenFromUserId(String? userId) {
    if (userId == null) return null;
    final id = userId.toLowerCase();
    if (!RegExp(r'^[0-9a-f]{24}$').hasMatch(id)) return null;
    final padded = '${id}00000000'; // 32 hex
    return '${padded.substring(0, 8)}-'
        '${padded.substring(8, 12)}-'
        '${padded.substring(12, 16)}-'
        '${padded.substring(16, 20)}-'
        '${padded.substring(20)}';
  }

  /// Доступны ли покупки на устройстве вообще.
  Future<bool> isAvailable() => _iap.isAvailable();

  /// Поток обновлений по покупкам (покупка/восстановление/ошибка).
  Stream<List<PurchaseDetails>> get purchaseStream => _iap.purchaseStream;

  /// Загружает детали продуктов из App Store. notFoundIDs игнорируем
  /// (например, если продукт ещё не создан в App Store Connect).
  Future<List<ProductDetails>> loadProducts(Set<String> ids) async {
    final response = await _iap.queryProductDetails(ids);
    return response.productDetails;
  }

  /// Инициирует покупку. Подписки и non-consumable идут через buyNonConsumable
  /// (авто-возобновление StoreKit обрабатывает сам).
  ///
  /// [appAccountToken] — UUID из appAccountTokenFromUserId (B2). Уходит в
  /// PurchaseParam.applicationUserName: на iOS StoreKit кладёт его в
  /// appAccountToken транзакции, и он приходит серверу в каждом
  /// S2S-уведомлении. null — покупка без токена (гость до логин-гейта и т.п.).
  Future<void> buy(ProductDetails product, {String? appAccountToken}) async {
    final param = PurchaseParam(
      productDetails: product,
      applicationUserName: appAccountToken,
    );
    await _iap.buyNonConsumable(purchaseParam: param);
  }

  /// Восстановление покупок (обязательная кнопка на paywall — требование Apple).
  Future<void> restore() => _iap.restorePurchases();

  /// Завершает транзакцию (после верификации/доставки). Без этого StoreKit
  /// будет повторять её при каждом запуске.
  Future<void> complete(PurchaseDetails purchase) async {
    if (purchase.pendingCompletePurchase) {
      await _iap.completePurchase(purchase);
    }
  }

  /// Отправляет JWS транзакции на бэкенд для верификации.
  /// Возвращает сводку прав пользователя (data из ответа).
  Future<Map<String, dynamic>> verifyOnServer(String signedTransaction) async {
    final response = await _apiClient.dio.post(
      ApiEndpoints.purchasesVerify,
      data: {'signedTransaction': signedTransaction},
    );
    return response.data['data'] as Map<String, dynamic>;
  }
}
