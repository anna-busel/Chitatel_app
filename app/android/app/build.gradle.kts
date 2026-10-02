import java.io.FileInputStream
import java.util.Properties

// Подпись релиза (задача A5). key.properties и сам keystore в репозиторий НЕ
// попадают — они в .gitignore и в секретах Codemagic. Пока файла нет, релизная
// сборка подписывается debug-ключом, как в шаблоне Flutter: так `flutter build`
// не падает у того, у кого ключа нет.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }
}

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "app.chitatel"
    // compileSdk и targetSdk заданы числом, а не flutter.*, чтобы требование
    // Google Play (targetSdk 36 для новых приложений с 31.08.2026) не зависело
    // от версии Flutter на машине сборки.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "app.chitatel"
        // minSdk 26: адаптивная иконка без PNG-набора + Android 8.0 и новее.
        minSdk = 26
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = keystoreProperties.getProperty("storeFile")?.let { file(it) }
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig =
                if (keystorePropertiesFile.exists()) {
                    signingConfigs.getByName("release")
                } else {
                    signingConfigs.getByName("debug")
                }

            // 02.10.2026. Вырезание неиспользуемых ресурсов выключено.
            // Flutter включает его для release сам (FlutterPlugin: isMinifyEnabled
            // = true, isShrinkResources = true), и дважды подряд это ломало плеер:
            // сборщик видит только статические ссылки на ресурсы, а на иконки
            // уведомления ссылаются строкой из Dart — сначала пропала наша
            // ic_stat_chitatel, потом иконки кнопок плагина audio_service
            // (в логе телефона: IllegalArgumentException "You must specify an
            // icon resource id to build a CustomAction", 742 раза за сеанс,
            // уведомление плеера из-за этого не публиковалось вовсе).
            // keep.xml закрывает известные случаи, эта строка — класс проблемы
            // целиком: следующий плагин с таким же приёмом уже не сломается.
            // Сжатие и обфускация кода (R8) остаются включёнными.
            // Плагин Flutter выставляет флаг при apply() в блоке plugins, то есть
            // ДО этого блока, поэтому значение отсюда перекрывает его.
            isShrinkResources = false
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
