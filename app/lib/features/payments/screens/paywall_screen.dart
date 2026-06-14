import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../providers/purchase_provider.dart';
import '../services/purchase_service.dart';
import 'success_screen.dart';

/// Экран подписки на Клуб (MASTER 4.28).
///
/// Показывает тарифы (месяц + сезон), цена берётся из App Store (локализованная).
/// Обязательно для ревью Apple: текст про автопродление и как отменить,
/// ссылки на Условия и Конфиденциальность, кнопка «Восстановить покупки».
class PaywallScreen extends ConsumerWidget {
  const PaywallScreen({super.key});

  // Ссылки должны быть «живыми» к моменту ревью Apple.
  static const String _termsUrl = 'https://chitatel.app/terms';
  static const String _privacyUrl = 'https://chitatel.app/privacy';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(purchaseProvider);

    ref.listen<PaywallState>(purchaseProvider, (prev, next) {
      if (next.status == PaywallStatus.success) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const SuccessScreen()),
        );
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
      body: SafeArea(child: _buildBody(context, ref, state)),
    );
  }

  Widget _buildBody(BuildContext context, WidgetRef ref, PaywallState state) {
    if (state.status == PaywallStatus.initial || state.status == PaywallStatus.loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.terracotta),
      );
    }

    final bool busy =
        state.status == PaywallStatus.purchasing || state.status == PaywallStatus.verifying;
    final bool noProducts =
        state.status == PaywallStatus.unavailable || state.products.isEmpty;

    return Stack(
      children: [
        ListView(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          children: [
            const SizedBox(height: 8),
            Text('Месяц с книгой, которая меняет', style: AppTypography.screenTitle),
            const SizedBox(height: 8),
            Text(
              'Каждый месяц — одна тема и одна книга: аудиоразборы по понедельникам, '
              'живой чат сообщества, журнал цитат и рекомендация фильма.',
              style: AppTypography.bodyLarge.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 24),
            if (noProducts)
              const _UnavailableNote()
            else
              ...state.products.map(
                (p) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.cardGapLarge),
                  child: _TariffCard(
                    product: p,
                    onTap: busy ? null : () => ref.read(purchaseProvider.notifier).buy(p),
                  ),
                ),
              ),
            const SizedBox(height: 16),
            const _LegalText(termsUrl: _termsUrl, privacyUrl: _privacyUrl),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: busy ? null : () => ref.read(purchaseProvider.notifier).restore(),
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

/// Карточка одного тарифа. Заголовок/описание — по productId,
/// цена — локализованная строка из App Store (product.price).
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
      return 'Три месяца клуба выгоднее. Продлевается каждые 3 месяца.';
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

/// Юридический текст про автопродление + ссылки (требование Apple 3.1.2).
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
