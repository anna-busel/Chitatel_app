import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'routes.dart';
import '../../shared/widgets/app_bottom_bar.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/constants/app_spacing.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/email_login_screen.dart';
import '../../features/auth/screens/email_register_screen.dart';
import '../../features/auth/screens/forgot_password_screen.dart';

// — Key для ShellRoute navigator —
final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

// — Provider для GoRouter —
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: Routes.home,
    redirect: (context, state) async {
      final prefs = await SharedPreferences.getInstance();
      final onboardingSeen = prefs.getBool('onboarding_seen') ?? false;
      final location = state.matchedLocation;

      // Если онбординг не пройден — на экран входа
      // (онбординг слайды будут в задаче 6.3, пока сразу на login)
      if (!onboardingSeen &&
          location != Routes.login &&
          location != Routes.emailLogin &&
          location != Routes.register &&
          location != Routes.forgotPassword &&
          location != Routes.survey &&
          location != Routes.aiConsent &&
          location != Routes.pushConsent) {
        return Routes.login;
      }

      return null;
    },
    routes: [
      // — Auth (без tab bar) —
      GoRoute(
        path: Routes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: Routes.emailLogin,
        builder: (context, state) => const EmailLoginScreen(),
      ),
      GoRoute(
        path: Routes.register,
        builder: (context, state) => const EmailRegisterScreen(),
      ),
      GoRoute(
        path: Routes.forgotPassword,
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: Routes.onboarding,
        builder: (context, state) => const _Placeholder('Онбординг'),
      ),
      GoRoute(
        path: Routes.survey,
        builder: (context, state) => const _Placeholder('Опрос'),
      ),
      GoRoute(
        path: Routes.aiConsent,
        builder: (context, state) => const _Placeholder('Согласие на ИИ'),
      ),
      GoRoute(
        path: Routes.pushConsent,
        builder: (context, state) => const _Placeholder('Разрешение push'),
      ),

      // — Главные табы (ShellRoute с bottom bar) —
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) {
          return _ScaffoldWithBottomBar(child: child);
        },
        routes: [
          GoRoute(
            path: Routes.home,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: _Placeholder('Главная'),
            ),
          ),
          GoRoute(
            path: Routes.catalog,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: _Placeholder('Каталог'),
            ),
          ),
          GoRoute(
            path: Routes.club,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: _Placeholder('Клуб'),
            ),
          ),
          GoRoute(
            path: Routes.profile,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: _Placeholder('Профиль'),
            ),
          ),
        ],
      ),

      // — Экраны без tab bar —
      GoRoute(
        path: Routes.bookPath,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          return _Placeholder('Книга: $id');
        },
      ),
      GoRoute(
        path: Routes.playerPath,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final bookId = state.pathParameters['bookId'] ?? '';
          return _Placeholder('Плеер: $bookId');
        },
      ),
      GoRoute(
        path: Routes.search,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Поиск'),
      ),
      GoRoute(
        path: Routes.paywall,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Тарифы'),
      ),
      GoRoute(
        path: Routes.notifications,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Уведомления'),
      ),
      GoRoute(
        path: Routes.diary,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Дневник'),
      ),
      GoRoute(
        path: Routes.editProfile,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Редактирование профиля'),
      ),
      GoRoute(
        path: Routes.myPurchases,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Мои покупки'),
      ),
      GoRoute(
        path: Routes.myProgress,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Мой прогресс'),
      ),
      GoRoute(
        path: Routes.manageSub,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Управление подпиской'),
      ),
      GoRoute(
        path: Routes.deleteAccount,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Удаление аккаунта'),
      ),
      GoRoute(
        path: Routes.notificationSettings,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Настройки уведомлений'),
      ),
      GoRoute(
        path: Routes.support,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Поддержка'),
      ),
      GoRoute(
        path: Routes.referral,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const _Placeholder('Пригласить подругу'),
      ),
    ],
  );
});

// — Scaffold с bottom bar для табовых экранов —
class _ScaffoldWithBottomBar extends StatelessWidget {
  const _ScaffoldWithBottomBar({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(child: child),
      bottomNavigationBar: AppBottomBar(
        currentIndex: _currentIndex(context),
        onTap: (index) => _onTabTap(context, index),
      ),
    );
  }

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith(Routes.home)) return 0;
    if (location.startsWith(Routes.catalog)) return 1;
    if (location.startsWith(Routes.club)) return 2;
    if (location.startsWith(Routes.profile)) return 3;
    return 0;
  }

  void _onTabTap(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go(Routes.home);
      case 1:
        context.go(Routes.catalog);
      case 2:
        context.go(Routes.club);
      case 3:
        context.go(Routes.profile);
    }
  }
}

// — Placeholder экран (заменится реальными экранами в следующих задачах) —
class _Placeholder extends StatelessWidget {
  const _Placeholder(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: AppTypography.serifSectionTitle,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Экран в разработке',
                style: AppTypography.caption,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
