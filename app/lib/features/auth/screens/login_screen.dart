import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_contacts.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../providers/auth_provider.dart';

/// Экран входа (MASTER 4.2).
///
/// Кнопки: Apple (чёрная, первая), [Google — СКРЫТА, см. ниже], Email.
/// Чекбокс GDPR. Кнопка «Продолжить без регистрации» (гостевой режим, 1.8).
///
/// 🔴 12.07.2026 — GOOGLE ВРЕМЕННО СКРЫТ (`_googleEnabled = false`).
/// Кнопка была нерабочей СРАЗУ В ТРЁХ местах:
///   1. на сервере `GOOGLE_CLIENT_ID` пуст → верификация токена падает;
///   2. в Info.plist нет URL scheme (reversed client ID) → на iOS окно входа
///      Google вообще не открывается;
///   3. ключа в `.env` нет.
/// Нажатие ревьюером Apple = гарантированная ошибка = отклонение сборки.
/// Вход через Apple и почту закрывает iOS полностью.
///
/// ЧТОБЫ ВЕРНУТЬ (понадобится для Android): поставить `_googleEnabled = true`
/// + выдать `GOOGLE_CLIENT_ID` в server/.env + добавить URL scheme в Info.plist.
/// Сам код кнопки и вызов `signInWithGoogle()` НЕ удалены — только скрыты.
///
/// ⚠️ 12.07.2026 — ФИКС КРАША ПОСЛЕ РЕГИСТРАЦИИ: новый юзер отправлялся на
/// `Routes.survey`, а этого маршрута в роутере НЕТ (опрос — волна 6Б, задача
/// 6.3). go_router показал бы экран ошибки вместо приложения. Пока опроса нет,
/// новый юзер идёт на главную, как и все.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  /// Показывать ли кнопку Google. Пока false — см. комментарий выше.
  static const bool _googleEnabled = false;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

/// Какой способ входа сейчас выполняется — чтобы спиннер крутился только
/// на нажатой кнопке, а не на всех сразу (статус loading в auth общий).
enum _PendingMethod { none, apple, google }

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _gdprChecked = false;
  _PendingMethod _pending = _PendingMethod.none;

  Future<void> _openLegal(String url) async {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    // Когда auth перестал грузиться (успех/ошибка/гость) — сбрасываем,
    // чтобы спиннер не завис на кнопке.
    if (authState.status != AuthStatus.loading &&
        _pending != _PendingMethod.none) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _pending = _PendingMethod.none);
      });
    }

    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated) {
        // Задача 6.3: не прошёл персонализацию (у существующих аккаунтов поля
        // onboardingCompleted нет → не true) → в онбординг с экрана «Имя».
        // Иначе — сразу на главную. Резервно ту же развилку страхует редирект
        // роутера по флагу onboarding_pending.
        final user = next.user;
        final completed = user != null && user['onboardingCompleted'] == true;
        // Если на вход привёл редирект с защищённого экрана (?from=...),
        // возвращаемся туда после успешного входа (6.5). Иначе — на главную.
        final from = GoRouterState.of(context).uri.queryParameters['from'];
        final target =
            (from != null && from.startsWith('/')) ? from : Routes.home;
        context.go(completed ? target : Routes.onboardingName);
      }
      if (next.status == AuthStatus.error && next.errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.errorMessage!),
            backgroundColor: AppColors.error,
          ),
        );
      }
    });

    final isLoading = authState.status == AuthStatus.loading;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.authScreenPadding,
          ),
          child: Column(
            children: [
              const Spacer(),

              // Логотип
              Text(
                'ЧИТАТЕЛЬ',
                style: AppTypography.serifLogo.copyWith(
                  fontSize: 28,
                  letterSpacing: 5,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Войдите чтобы начать',
                style: AppTypography.body.copyWith(
                  color: AppColors.textTertiary,
                ),
              ),
              const SizedBox(height: 36),

              // Apple Sign In — первая кнопка (Apple требует)
              _SocialButton(
                label: 'Sign in with Apple',
                backgroundColor: Colors.black,
                textColor: Colors.white,
                icon: const Icon(Icons.apple, color: Colors.white, size: 20),
                enabled: _gdprChecked,
                loading: isLoading && _pending == _PendingMethod.apple,
                onPressed: () {
                  setState(() => _pending = _PendingMethod.apple);
                  ref.read(authProvider.notifier).signInWithApple();
                },
              ),
              const SizedBox(height: 10),

              // Google Sign In — СКРЫТ до настройки (см. шапку файла).
              if (LoginScreen._googleEnabled) ...[
                _SocialButton(
                  label: 'Google',
                  backgroundColor: Colors.white,
                  textColor: AppColors.textPrimary,
                  border: true,
                  icon: Image.network(
                    'https://developers.google.com/identity/images/g-logo.png',
                    width: 18,
                    height: 18,
                    errorBuilder: (_, __, ___) => const Icon(
                      Icons.g_mobiledata,
                      size: 20,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  enabled: _gdprChecked,
                  loading: isLoading && _pending == _PendingMethod.google,
                  onPressed: () {
                    setState(() => _pending = _PendingMethod.google);
                    ref.read(authProvider.notifier).signInWithGoogle();
                  },
                ),
                const SizedBox(height: 10),
              ],

              // Email
              _SocialButton(
                label: 'Email и пароль',
                backgroundColor: AppColors.surfaceLight,
                textColor: AppColors.textPrimary,
                enabled: _gdprChecked,
                onPressed: () => context.push(Routes.emailLogin),
              ),
              const SizedBox(height: 8),

              // Забыли пароль
              GestureDetector(
                onTap: () => context.push(Routes.forgotPassword),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Забыли пароль?',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.terracotta,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // GDPR чекбокс. Ссылки «Условия» и «Политика» теперь РАБОЧИЕ —
              // раньше это был просто цветной текст (ревью Apple открывает их).
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _gdprChecked = !_gdprChecked),
                    child: Container(
                      width: 22,
                      height: 22,
                      margin: const EdgeInsets.only(top: 1),
                      decoration: BoxDecoration(
                        color:
                            _gdprChecked ? AppColors.terracotta : Colors.white,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: _gdprChecked
                              ? AppColors.terracotta
                              : AppColors.textMetadata,
                          width: 2,
                        ),
                      ),
                      child: _gdprChecked
                          ? const Icon(Icons.check,
                              size: 14, color: Colors.white)
                          : null,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        style: AppTypography.small.copyWith(
                          color: AppColors.textSecondary,
                          height: 1.5,
                        ),
                        children: [
                          TextSpan(
                            text:
                                'Я согласна на обработку персональных данных и принимаю ',
                            recognizer: null,
                          ),
                          WidgetSpan(
                            alignment: PlaceholderAlignment.middle,
                            child: GestureDetector(
                              onTap: () => _openLegal(AppContacts.termsUrl),
                              child: Text(
                                'Условия',
                                style: AppTypography.small.copyWith(
                                  color: AppColors.terracotta,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                          ),
                          const TextSpan(text: ' и '),
                          WidgetSpan(
                            alignment: PlaceholderAlignment.middle,
                            child: GestureDetector(
                              onTap: () => _openLegal(AppContacts.privacyUrl),
                              child: Text(
                                'Политику конфиденциальности',
                                style: AppTypography.small.copyWith(
                                  color: AppColors.terracotta,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),

              const Spacer(),

              // Продолжить без регистрации (гостевой режим — Apple 5.1.1(v)).
              GestureDetector(
                onTap: () async {
                  ref.read(authProvider.notifier).enterAsGuest();
                  final prefs = await SharedPreferences.getInstance();
                  await prefs.setBool('onboarding_seen', true);
                  if (context.mounted) context.go(Routes.home);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    'Продолжить без регистрации',
                    style: AppTypography.body.copyWith(
                      color: AppColors.terracotta,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}

/// Кнопка социального входа.
class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.label,
    required this.backgroundColor,
    required this.textColor,
    required this.onPressed,
    this.icon,
    this.border = false,
    this.enabled = true,
    this.loading = false,
  });

  final String label;
  final Color backgroundColor;
  final Color textColor;
  final VoidCallback onPressed;
  final Widget? icon;
  final bool border;
  final bool enabled;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled && !loading ? onPressed : null,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 200),
        opacity: enabled ? 1.0 : 0.4,
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
            border: border
                ? Border.all(color: const Color(0xFFE0E0E0))
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                icon!,
                const SizedBox(width: 8),
              ],
              if (loading)
                SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: textColor,
                  ),
                )
              else
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: textColor,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
