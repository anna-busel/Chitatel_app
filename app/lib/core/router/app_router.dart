import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'routes.dart';
import '../../shared/widgets/app_bottom_bar.dart';
import '../../shared/widgets/guest_gate.dart';
import '../../core/theme/app_colors.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/email_login_screen.dart';
import '../../features/auth/screens/email_register_screen.dart';
import '../../features/auth/screens/forgot_password_screen.dart';
import '../../features/auth/screens/ai_consent_screen.dart';
import '../../features/auth/screens/push_permission_screen.dart';
import '../../features/home/screens/home_screen.dart';
import '../../features/catalog/screens/catalog_screen.dart';
import '../../features/club/screens/club_screen.dart';
import '../../features/book/screens/book_screen.dart';
import '../../features/search/screens/search_screen.dart';
import '../../features/player/screens/player_screen.dart';
import '../../features/player/widgets/mini_player.dart';
import '../../features/payments/screens/paywall_screen.dart';
import '../../features/diary/screens/diary_screen.dart';
import '../../features/diary/screens/analysis_screen.dart';
import '../../features/diary/screens/weekly_report_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/profile/screens/edit_profile_screen.dart';
import '../../features/profile/screens/my_purchases_screen.dart';
import '../../features/profile/screens/my_progress_screen.dart';
import '../../features/profile/screens/manage_sub_screen.dart';
import '../../features/profile/screens/notification_settings_screen.dart';
import '../../features/profile/screens/support_screen.dart';
import '../../features/profile/screens/blocked_users_screen.dart';
import '../../features/profile/screens/delete_account_screen.dart';

// — Key для ShellRoute navigator —
final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

/// Роутер приложения.
///
/// ⚠️ 12.07.2026 (Фаза 6, A6): все заглушки `_Placeholder` УДАЛЕНЫ — Apple
/// отклоняет сборки с экранами «в разработке». Профиль и его подэкраны теперь
/// настоящие (задача 6.2). Онбординг и опрос — волна 6Б (задача 6.3);
/// до тех пор эти маршруты не объявлены вовсе, чтобы на них нельзя было
/// попасть и упереться в пустоту. Экран разрешения push (4.8) — задача 6.1,
/// теперь зарегистрирован (на него ведёт экран согласия на ИИ).
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: Routes.home,
    redirect: (context, state) async {
      final prefs = await SharedPreferences.getInstance();
      final onboardingSeen = prefs.getBool('onboarding_seen') ?? false;
      final location = state.matchedLocation;

      // Первый запуск — на экран входа (слайды онбординга и опрос — волна 6Б).
      if (!onboardingSeen &&
          location != Routes.login &&
          location != Routes.emailLogin &&
          location != Routes.register &&
          location != Routes.forgotPassword &&
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
      // Согласие на ИИ (4.7, задача 5.3) — шаг онбординга после опроса.
      GoRoute(
        path: Routes.aiConsent,
        builder: (context, state) => const AiConsentScreen(),
      ),
      // Разрешение на push (4.8, задача 6.1) — шаг онбординга после согласия на ИИ.
      GoRoute(
        path: Routes.pushConsent,
        builder: (context, state) => const PushPermissionScreen(),
      ),

      // — Главные табы (ShellRoute с bottom bar + mini-player) —
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) {
          return _ScaffoldWithBottomBar(child: child);
        },
        routes: [
          GoRoute(
            path: Routes.home,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: HomeScreen(),
            ),
          ),
          GoRoute(
            path: Routes.catalog,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: CatalogScreen(),
            ),
          ),
          // Клуб требует аккаунт (контент по подписке) — гостю показываем
          // приглашение войти (GuestGate, задача 1.8). Авторизованному — клуб.
          GoRoute(
            path: Routes.club,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: GuestGate(
                title: 'Клуб',
                message:
                    'Войдите, чтобы присоединиться к клубу: разборы, чат и ответы Анны.',
                child: ClubScreen(),
              ),
            ),
          ),
          // Профиль требует аккаунт — гостю приглашение войти (задача 1.8).
          GoRoute(
            path: Routes.profile,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: GuestGate(
                title: 'Профиль',
                message:
                    'Войдите, чтобы открыть профиль, дневник и историю покупок.',
                child: ProfileScreen(),
              ),
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
          return BookScreen(bookId: id);
        },
      ),
      GoRoute(
        path: Routes.playerPath,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final bookId = state.pathParameters['bookId'] ?? '';
          // Опциональные параметры из extra: { 'startPart': int, 'startPosition': int }
          // Используются при нажатии на конкретную часть в списке книги.
          final extra = state.extra;
          int? startPart;
          int? startPosition;
          if (extra is Map) {
            final part = extra['startPart'];
            if (part is int) startPart = part;
            final position = extra['startPosition'];
            if (position is int) startPosition = position;
          }
          return PlayerScreen(
            bookId: bookId,
            startPart: startPart,
            startPosition: startPosition,
          );
        },
      ),
      GoRoute(
        path: Routes.search,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const SearchScreen(),
      ),
      GoRoute(
        path: Routes.paywall,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const PaywallScreen(),
      ),

      // — Дневник (задача 5.3) —
      GoRoute(
        path: Routes.diary,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DiaryScreen(),
      ),
      GoRoute(
        path: Routes.analysisPath,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final quoteId = state.pathParameters['quoteId'] ?? '';
          return AnalysisScreen(quoteId: quoteId);
        },
      ),
      GoRoute(
        path: Routes.weeklyReport,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const WeeklyReportScreen(),
      ),

      // — Профильная зона (задача 6.2) —
      GoRoute(
        path: Routes.editProfile,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const EditProfileScreen(),
      ),
      GoRoute(
        path: Routes.myPurchases,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const MyPurchasesScreen(),
      ),
      GoRoute(
        path: Routes.myProgress,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const MyProgressScreen(),
      ),
      GoRoute(
        path: Routes.manageSub,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const ManageSubScreen(),
      ),
      GoRoute(
        path: Routes.notificationSettings,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const NotificationSettingsScreen(),
      ),
      GoRoute(
        path: Routes.support,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const SupportScreen(),
      ),
      // Заблокированные участницы (A1) — единственный способ снять блокировку.
      GoRoute(
        path: Routes.blockedUsers,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const BlockedUsersScreen(),
      ),
      // Удаление аккаунта (4.34, Apple 5.1.1(v)).
      GoRoute(
        path: Routes.deleteAccount,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DeleteAccountScreen(),
      ),
    ],
  );
});

/// Scaffold с bottom bar для табовых экранов.
///
/// Layout (снизу вверх):
/// - bottom bar (4 таба, AppBottomBar)
/// - mini-player (виден только когда что-то играет, MiniPlayer)
/// - content (child)
///
/// MiniPlayer сам отображается/скрывается через ref.watch(playerUiStateProvider).
/// Когда плеер пуст — возвращает SizedBox.shrink, не занимая места.
class _ScaffoldWithBottomBar extends StatelessWidget {
  const _ScaffoldWithBottomBar({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(bottom: false, child: child),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const MiniPlayer(),
          AppBottomBar(
            currentIndex: _currentIndex(context),
            onTap: (index) => _onTabTap(context, index),
          ),
        ],
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
