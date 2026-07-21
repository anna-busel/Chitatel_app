import Flutter
import UIKit
import UserNotifications

@UIApplicationMain
@objc class AppDelegate: FlutterAppDelegate {
  // Канал связи с Flutter (передача токена и тапов по уведомлению).
  private var pushChannel: FlutterMethodChannel?
  // Последний полученный APNs-токен (hex) — отдаём по запросу getToken.
  private var pendingToken: String?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    if let controller = window?.rootViewController as? FlutterViewController {
      let channel = FlutterMethodChannel(
        name: "chitatel/push",
        binaryMessenger: controller.binaryMessenger
      )
      channel.setMethodCallHandler { [weak self] call, result in
        self?.handlePushCall(call, result: result)
      }
      pushChannel = channel
    }

    UNUserNotificationCenter.current().delegate = self

    // Если разрешение уже выдано (вернувшийся юзер) — переполучаем токен на
    // старте. registerForRemoteNotifications ДИАЛОГ НЕ ПОКАЗЫВАЕТ, только
    // триггерит didRegister → onToken → регистрация на бэкенде.
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      if settings.authorizationStatus == .authorized {
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }
      }
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Обработка вызовов с Flutter-стороны.
  private func handlePushCall(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "requestPermissionAndRegister":
      UNUserNotificationCenter.current().requestAuthorization(
        options: [.alert, .badge, .sound]
      ) { granted, _ in
        if granted {
          DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
          }
        }
        result(granted)
      }
    case "getToken":
      result(pendingToken)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  // Успешная регистрация в APNs — конвертируем токен в hex и отдаём во Flutter.
  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let token = deviceToken.map { String(format: "%02x", $0) }.joined()
    pendingToken = token
    pushChannel?.invokeMethod("onToken", arguments: token)
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    pushChannel?.invokeMethod("onTokenError", arguments: error.localizedDescription)
  }

  // Показывать баннер, когда приложение на переднем плане.
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .badge])
  }

  // Тап по уведомлению — передаём кастомные поля во Flutter для навигации.
  // node-apn кладёт поля payload на верхний уровень (рядом с aps), поэтому
  // собираем всё, кроме aps.
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let userInfo = response.notification.request.content.userInfo
    var payload: [String: Any] = [:]
    for (key, value) in userInfo {
      if let k = key as? String, k != "aps" {
        payload[k] = value
      }
    }
    pushChannel?.invokeMethod("onTap", arguments: payload)
    completionHandler()
  }
}
