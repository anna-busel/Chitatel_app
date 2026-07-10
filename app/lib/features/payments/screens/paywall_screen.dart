import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../club/providers/club_provider.dart';
import '../providers/purchase_provider.dart';
import '../season_window.dart';
import '../services/purchase_service.dart';

/// Экран подписки на Клуб (MASTER 4.28).
///
/// ⚠️ 10.07.2026: success-экран убран из потока. После реальной покупки
/// (PaywallStatus.success) сбрасываем кэш клуба и уходим в /club. restore
/// (авто-восстановление) идёт тихо (PaywallStatus.restored).
///
/// ⚠️ 11.07.2026 СЕЗОНЫ: карточка «Сезон» показывается ТОЛЬКО в окно покупки
/// (первый месяц сезона), с подписью «в течение <месяца>»; в окно анонса
/// (с 15-го предыдущего месяца) — плашка-анонс без покупки; вне окон — только
/// Месяц. Логика и тексты — season_window.dart.
/// ТЕСТОВАЯ РУЧКА: тройной тап по заголовку «Месяц с книгой…» циклически
/// подменяет дату (реальная → 20.08 → 05.09 → 10.10) — проверка календаря на
/// одном билде. ⚠️ Убрать жест перед сабмитом (Фаза 7).
class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({super.key});

  static const String _termsUrl = 'https://chitatel.app/terms';
  static const String _privacyUrl = 'https://chitatel.app/privacy';

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen> {
  // Счётчик для скрытого жеста теста сезонов (тройной тап по заголовку).
  int _titleTaps = 0;
  DateTime _lastTap = DateTime.fromMillisecondsSinceEpoch(0);

  void _onTitleTap() {
    final now = DateTime.now();
    if (now.difference(_lastTap).inMilliseconds > 1500) {
      _titleTaps = 0;
    }
    _lastTap = now;
    _titleTaps++;
    if (_titleTaps >= 3) {
      _titleTaps = 0;
      final msg = SeasonWindow.cycleDebugDate();
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), duration: const Duration(seconds: 2)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(purchaseProvider);

    ref.listen<PaywallState>(purchaseProvider, (prev, next) {
      if (next.status == PaywallStatus.success) {
        ref.invalidate(currentClubProvider);
        ref.invalidate(clubListProvider);
        if (context.mounted) context.go('/club');
      } else if (next.status == PaywallStatus.error && next.errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.errorMessage!)),
        );
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
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
            GestureDetector(
              onTap: _onTitleTap,
              behavior: HitTestBehavior.opaque,
              child: Text('Месяц с книгой, которая меняет',
                  style: AppTypography.screenTitle),
            ),
            const SizedBox(height: 8),
            Text(
              'Каждый месяц — одна тема и одна книга: аудиоразборы по понедельникам, '
              'живой чат сообщества, журнал цитат и рекомендация фильма.',
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
                        : () => ref.read(purchaseProvider.notifier).buy(p),
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
/// Для сезона подпись включает окно оформления («в течение сентября»).
class _TariffCard extends StatelessWidget {
  const _TariffCard({required this.product, required this.onTap});

  final ProductDetails product;
  final VoidCallback? onTap;

  String get _title {
    if (product.id == PurchaseService.seasonId) return 'Сезон · 3 месяца';
    if (product.id == PurchaseService.monthlyId) return 'Месяц';
    return product.title;
  }

  String get _note {
    if (product.id == PurchaseService.seasonId) {
      return SeasonWindow.openCardNote();
    }
    return 'Доступ к клубу на месяц. Продлевается автоматически.';
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
