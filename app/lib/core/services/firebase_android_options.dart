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
/// Проект Firebase: chitatel-49c96 (заведён 17.10.2026, только Android-приложение).
/// Если поля очистить — пуши на Android тихо выключатся, приложение работает.
const String _apiKey = 'AIzaSyA_y5qE5NjZhMbUwHTEu4ngbh_APcKdndU';
const String _appId = '1:216777806066:android:581ee2310f84214c71406b';
const String _messagingSenderId = '216777806066';
const String _projectId = 'chitatel-49c96';

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
