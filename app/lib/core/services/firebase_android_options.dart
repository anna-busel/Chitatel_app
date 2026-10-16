import 'package:firebase_core/firebase_core.dart';

/// Firebase для Android-пушей (задача C3 ANDROID-PLAN, 16.10.2026).
///
/// Значения — из google-services.json проекта Firebase (Project settings →
/// Your apps → Android app `app.chitatel` → google-services.json):
///   apiKey            ← client[0].api_key[0].current_key
///   appId             ← client[0].client_info.mobilesdk_app_id
///   messagingSenderId ← project_info.project_number
///   projectId         ← project_info.project_id
///
/// Это не секреты: те же строки лежат внутри любого собранного APK.
/// Сам google-services.json в проект не кладём и gradle-плагин
/// google-services не подключаем — Firebase запускается этими опциями из
/// Dart, поэтому сборка не зависит от файла.
///
/// Пока поля пустые — пуши на Android тихо выключены, приложение работает.
const String _apiKey = '';
const String _appId = '';
const String _messagingSenderId = '';
const String _projectId = '';

/// Заполнены ли опции. false — PushService не трогает Firebase вовсе.
bool get kFirebaseAndroidConfigured =>
    _apiKey.isNotEmpty &&
    _appId.isNotEmpty &&
    _messagingSenderId.isNotEmpty &&
    _projectId.isNotEmpty;

const FirebaseOptions firebaseAndroidOptions = FirebaseOptions(
  apiKey: _apiKey,
  appId: _appId,
  messagingSenderId: _messagingSenderId,
  projectId: _projectId,
);
