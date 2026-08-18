import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../auth/providers/auth_provider.dart';
import '../../club/providers/club_provider.dart';
import '../providers/purchase_provider.dart';
import '../season_window.dart';
import '../services/purchase_service.dart';

/// Экран подписки на Клуб (MASTER 4.28).
///
/// ⚠️ 10.07.2026: success-экран убран из потока. После реальной покупки
/// (PaywallStatus.success) сбрасываем кэш клуба и уходим в /club.
/// ⚠️ 11.07.2026: авто-restore при запуске убран (purchase_provider);
/// восстановление — только кнопкой «Восстановить покупки», после успеха
/// (PaywallStatus.restored) так же сбрасываем кэш клуба и уходим в /club.
///
/// ⚠️ 11.07.2026 СЕЗОНЫ: карточка «Сезон» показывается ТОЛЬКО в окно покупки
/// (первый месяц сезона); в окно анонса (с 15-го предыдущего месяца) —
/// плашка-анонс без покупки; вне окон — только Месяц. Финальные тексты —
/// season_window.dart («одной подпиской», «до 30 сентября»).
///
/// ⚠️ 12.07.2026 (Фаза 6, шаг 0): тестовый жест «тройной тап по заголовку»
/// (подмена даты для проверки сезонных окон) УДАЛЁН — скрытая отладка не
/// должна уезжать в ревью Apple. Подмена даты остаётся в season_window.dart
/// (debugNowOverride) и вызывается только из кода при отладке.
class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({super.key, this.showClose = true});

  /// Показывать крестик закрытия в шапке.
  ///
  /// ⛔️ 18.08.2026 — когда пейвол открыт как ОТДЕЛЬНЫЙ экран (с главной, из
  /// карточек клуба, по маршруту /paywall), крестик нужен и работает: там есть
  /// что снять со стека. Но в табе «Клуб» без подписки пейвол подставляется
  /// как обычный виджет внутрь ShellRoute (club_screen.dart), маршрута нет, и
  /// maybePop() молча ничего не делает — кнопка выглядела сломанной. Там
  /// передаётся showClose: false, выход из таба — нижней навигацией.
  final bool showClose;

  // Легальные страницы (A3). Отдаются Express'ом с api.chitatel.app —
  // те же URL указаны в App Store Connect (Privacy Policy / EULA).
  static const String _termsUrl = 'https://api.chitatel.app/legal/terms';
  static const String _privacyUrl = 'https://api.chitatel.app/legal/privacy';

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen> {
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(purchaseProvider);

    ref.listen<PaywallState>(purchaseProvider, (prev, next) {
      if (next.status == PaywallStatus.success ||
          next.status == PaywallStatus.restored) {
        // Покупка или восстановление по кнопке подтверждены сервером →
        // сбрасываем кэш клуба (мог держать 403) и уходим в клуб.
        ref.invalidate(currentClubProvider);
        ref.invalidate(clubListProvider);
        if (context.mounted) context.go('/club');
      } else if (next.status == PaywallStatus.error && next.errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.errorMessage!)),
        );
      } else if (next.infoMessage != null) {
        // P3: restore без покупок — «Активных покупок не найдено».
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.infoMessage!)),
        );
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: widget.showClose
            ? IconButton(
                icon: const Icon(Icons.close, color: AppColors.textPrimary),
                onPressed: () => Navigator.of(context).maybePop(),
              )
            : null,
        automaticallyImplyLeading: false,
        centerTitle: true,
        title: Text('Клуб ЧИТАТЕЛЬ', style: AppTypography.screenTitle),
      ),
      body: SafeArea(child: _buildBody(context, state)),
    );
  }

  Widget _buildBody(BuildContext context, PaywallState state) {
    if (state.status == PaywallStatus.initial || state.status == PaywallStatus.loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.terracotta),
      );
    }

    final bool busy =
        state.status == PaywallStatus.purchasing || state.status == PaywallStatus.verifying;

    // СЕЗОНЫ: вне окна покупки карточка Сезона скрывается с витрины.
    final seasonPhase = SeasonWindow.phase();
    final visibleProducts = state.products
        .where((p) =>
            p.id != PurchaseService.seasonId || seasonPhase == SeasonPhase.open)
        .toList();

    final bool noProducts =
        state.status == PaywallStatus.unavailable || visibleProducts.isEmpty;

    return Stack(
      children: [
        ListView(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          children: [
            const SizedBox(height: 8),
            Text('Одна книга в месяц, которая меняет',
                style: AppTypography.screenTitle),
            const SizedBox(height: 8),
            Text(
              'Аудиоразборы по понедельникам, живой чат с Анной и участницами, '
              'журнал цитат и фильм месяца.',
              style: AppTypography.bodyLarge.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 24),
            // Анонс сезона (15-е — конец месяца перед сезоном): информируем,
            // купить ещё нельзя. Без таймеров/давления (Apple ревью).
            if (seasonPhase == SeasonPhase.announce) ...[
              _SeasonAnnounceCard(text: SeasonWindow.announceText()),
              const SizedBox(height: AppSpacing.cardGapLarge),
            ],
            if (noProducts)
              const _UnavailableNote()
            else
              ...visibleProducts.map(
                (p) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.cardGapLarge),
                  child: _TariffCard(
                    product: p,
                    onTap: busy
                        ? null
                        : () {
                            // P5: без сессии подписку не начинаем — Apple
                            // спишет, а привязать не к кому. Ведём на вход
                            // (как в book_screen для разборов).
                            if (ref.read(authProvider).status !=
                                AuthStatus.authenticated) {
                              context.push(Routes.login);
                              return;
                            }
                            ref.read(purchaseProvider.notifier).buy(p);
                          },
                  ),
                ),
              ),
            const SizedBox(height: 16),
            const _LegalText(
              termsUrl: PaywallScreen._termsUrl,
              privacyUrl: PaywallScreen._privacyUrl,
            ),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: busy
                    ? null
                    : () => ref.read(purchaseProvider.notifier).restore(),
                child: Text(
                  'Восстановить покупки',
                  style: AppTypography.bodyMedium.copyWith(color: AppColors.terracotta),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
        if (busy)
          const Positioned.fill(
            child: ColoredBox(
              color: Color(0x66000000),
              child: Center(child: CircularProgressIndicator(color: Colors.white)),
            ),
          ),
      ],
    );
  }
}

/// Плашка-анонс будущего сезона на paywall (фаза announce).
class _SeasonAnnounceCard extends StatelessWidget {
  const _SeasonAnnounceCard({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.terracotta.withOpacity(0.08),
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.terracotta.withOpacity(0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.auto_awesome, size: 18, color: AppColors.terracotta),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: AppTypography.captionMedium.copyWith(color: AppColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

/// Карточка одного тарифа. Заголовок/описание — по productId,
/// цена — локализованная строка из App Store (product.price).
/// Сезон: заголовок «Осенний сезон · 3 месяца» и подпись с месяцами и окном
/// оформления — из season_window.dart. Обещаний про скидку в подписи нет.
class _TariffCard extends StatelessWidget {
  const _TariffCard({required this.product, required this.onTap});

  final ProductDetails product;
  final VoidCallback? onTap;

  String get _title {
    if (product.id == PurchaseService.seasonId) return SeasonWindow.cardTitle();
    if (product.id == PurchaseService.monthlyId) return 'Месяц';
    return product.title;
  }

  String get _note {
    if (product.id == PurchaseService.seasonId) {
      return SeasonWindow.openCardNote();
    }
    return 'Полный доступ к клубу этого месяца. '
        'Продлевается автоматически, отменить можно в любой момент.';
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.cardBackground,
      borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_title, style: AppTypography.sectionHeader),
                    const SizedBox(height: 4),
                    Text(
                      _note,
                      style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                product.price,
                style: AppTypography.bodyBold.copyWith(color: AppColors.terracotta),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _UnavailableNote extends StatelessWidget {
  const _UnavailableNote();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
      ),
      child: Text(
        'Тарифы временно недоступны. Загляните чуть позже.',
        style: AppTypography.body.copyWith(color: AppColors.textSecondary),
      ),
    );
  }
}

class _LegalText extends StatelessWidget {
  const _LegalText({required this.termsUrl, required this.privacyUrl});

  final String termsUrl;
  final String privacyUrl;

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final linkStyle = AppTypography.caption.copyWith(
      color: AppColors.terracotta,
      decoration: TextDecoration.underline,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Подписка продлевается автоматически, пока вы её не отмените. Оплата '
          'спишется с вашего Apple ID при подтверждении покупки. Управлять '
          'подпиской и отключить автопродление можно в Настройках iPhone → '
          'ваш Apple ID → Подписки, не позднее чем за 24 часа до конца периода.',
          style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          children: [
            GestureDetector(
              onTap: () => _open(termsUrl),
              child: Text('Условия использования', style: linkStyle),
            ),
            GestureDetector(
              onTap: () => _open(privacyUrl),
              child: Text('Конфиденциальность', style: linkStyle),
            ),
          ],
        ),
      ],
    );
  }
}
