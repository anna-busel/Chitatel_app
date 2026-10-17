package app.chitatel

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.app.NotificationManager
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// AudioServiceActivity вместо FlutterActivity — требование audio_service:
// иначе плеер не переживает сворачивание приложения.
class MainActivity : AudioServiceActivity() {

    // 17.10.2026: канал для экрана «Уведомления» на Android.
    // areNotificationsEnabled — включены ли уведомления у приложения (не
    // зависит от Firebase); openNotificationSettings — открыть системные
    // настройки уведомлений Читателя (когда Android больше не показывает
    // окно разрешения, и чтобы выключить — приложение само не может).
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "chitatel/settings")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "areNotificationsEnabled" ->
                        result.success(
                            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                                .areNotificationsEnabled()
                        )
                    "openNotificationSettings" -> {
                        try {
                            startActivity(
                                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                            )
                        } catch (e: Exception) {
                            startActivity(
                                Intent(
                                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    Uri.parse("package:$packageName")
                                )
                            )
                        }
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
