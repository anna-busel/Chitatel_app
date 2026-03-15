import 'package:flutter/material.dart';
import 'core/theme/app_colors.dart';
import 'core/theme/app_typography.dart';
import 'core/constants/app_spacing.dart';
import 'core/constants/app_sizes.dart';
import 'shared/widgets/app_button.dart';
import 'shared/widgets/app_card.dart';
import 'shared/widgets/app_text_field.dart';
import 'shared/widgets/app_bottom_bar.dart';
import 'shared/widgets/app_top_bar.dart';
import 'shared/widgets/shimmer_loading.dart';
import 'shared/widgets/error_view.dart';
import 'shared/widgets/no_connection.dart';

/// Тестовый экран, показывающий ВСЕ компоненты дизайн-системы.
/// Запуск: `flutter run` → визуально сверить с прототипом.
/// Удалить или скрыть перед релизом.
class DesignSystemShowcase extends StatefulWidget {
  const DesignSystemShowcase({super.key});

  @override
  State<DesignSystemShowcase> createState() => _DesignSystemShowcaseState();
}

class _DesignSystemShowcaseState extends State<DesignSystemShowcase> {
  int _tabIndex = 0;
  int _page = 0; // 0 = components, 1 = typography, 2 = colors, 3 = states

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            // Page switcher
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenPadding,
                vertical: 8,
              ),
              child: Row(
                children: [
                  _PageTab('Виджеты', 0),
                  _PageTab('Шрифты', 1),
                  _PageTab('Цвета', 2),
                  _PageTab('Состояния', 3),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenPadding,
                ),
                child: _buildPage(),
              ),
            ),
            AppBottomBar(
              currentIndex: _tabIndex,
              onTap: (i) => setState(() => _tabIndex = i),
            ),
          ],
        ),
      ),
    );
  }

  Widget _PageTab(String label, int index) {
    final isActive = _page == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _page = index),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isActive ? AppColors.terracotta : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
              color: isActive ? Colors.white : AppColors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPage() {
    switch (_page) {
      case 0:
        return _buildWidgets();
      case 1:
        return _buildTypography();
      case 2:
        return _buildColors();
      case 3:
        return _buildStates();
      default:
        return _buildWidgets();
    }
  }

  // ── PAGE 0: Widgets ──
  Widget _buildWidgets() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),

        // TopBar
        _SectionLabel('AppTopBar'),
        AppTopBar(
          backLabel: 'Профиль',
          onBack: () {},
        ),
        const SizedBox(height: 16),

        // Buttons
        _SectionLabel('AppButton — Primary'),
        AppButton(text: 'Подписаться', onPressed: () {}),
        const SizedBox(height: 10),

        _SectionLabel('AppButton — Outline'),
        AppButton(
          text: 'Слушать превью (5 мин)',
          onPressed: () {},
          variant: AppButtonVariant.outline,
        ),
        const SizedBox(height: 10),

        _SectionLabel('AppButton — Danger'),
        AppButton(
          text: 'Удалить аккаунт навсегда',
          onPressed: () {},
          variant: AppButtonVariant.danger,
        ),
        const SizedBox(height: 10),

        _SectionLabel('AppButton — Loading'),
        AppButton(text: 'Загрузка...', onPressed: () {}, isLoading: true),
        const SizedBox(height: 16),

        // TextField
        _SectionLabel('AppTextField'),
        const AppTextField(placeholder: 'Email'),
        const SizedBox(height: 8),
        const AppTextField(placeholder: 'Пароль', obscureText: true),
        const SizedBox(height: 16),

        // Card
        _SectionLabel('AppCard'),
        AppCard(
          onTap: () {},
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: AppColors.terracottaGradient,
                  borderRadius: BorderRadius.circular(10),
                ),
                alignment: Alignment.center,
                child: Text(
                  'БС',
                  style: AppTypography.bodyBold.copyWith(color: Colors.white),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Бегство от свободы',
                        style: AppTypography.bodyBold),
                    Text('Фромм · 4ч 12м', style: AppTypography.small),
                  ],
                ),
              ),
              Text(
                '\$12',
                style: AppTypography.bodyLargeMedium.copyWith(
                  color: AppColors.terracotta,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Card — book with cover gradient
        AppCard(
          onTap: () {},
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: AppSizes.coverHeightSmall,
                decoration: const BoxDecoration(
                  gradient: AppColors.terracottaGradient,
                ),
                alignment: Alignment.center,
                child: Text(
                  'МП',
                  style: AppTypography.serifPlayerTitle.copyWith(
                    color: Colors.white.withOpacity(0.9),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE8F5E9),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'БЕСПЛАТНО',
                        style: AppTypography.badge.copyWith(
                          color: AppColors.success,
                          fontSize: 9,
                        ),
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text('Маленький принц', style: AppTypography.captionMedium.copyWith(color: AppColors.textPrimary)),
                    Text('Сент-Экзюпери · 2ч 10м',
                        style: AppTypography.micro),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 80),
      ],
    );
  }

  // ── PAGE 1: Typography ──
  Widget _buildTypography() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        _SectionLabel('Serif (Playfair Display)'),
        Text('Headline 30px', style: AppTypography.serifHeadline),
        const SizedBox(height: 8),
        Text('Price 26px', style: AppTypography.serifPrice),
        const SizedBox(height: 8),
        Text('Book Title 23px', style: AppTypography.serifBookTitle),
        const SizedBox(height: 8),
        Text('Section Title 22px', style: AppTypography.serifSectionTitle),
        const SizedBox(height: 8),
        Text('Player Title 21px', style: AppTypography.serifPlayerTitle),
        const SizedBox(height: 8),
        Text('ЧИТАТЕЛЬ', style: AppTypography.serifLogo),
        const SizedBox(height: 8),
        Text(
          '«Свобода — это ответственность»',
          style: AppTypography.serifQuote,
        ),
        const SizedBox(height: 24),

        _SectionLabel('Sans-serif (системный)'),
        Text('Screen Title 20px', style: AppTypography.screenTitle),
        const SizedBox(height: 8),
        Text('Button 17px', style: AppTypography.button.copyWith(color: AppColors.textPrimary)),
        const SizedBox(height: 8),
        Text('Section Header 16px', style: AppTypography.sectionHeader),
        const SizedBox(height: 8),
        Text('Body Large 15px', style: AppTypography.bodyLarge),
        const SizedBox(height: 8),
        Text('Body 14px — основной текст', style: AppTypography.body),
        const SizedBox(height: 8),
        Text('Caption 13px — описания', style: AppTypography.caption),
        const SizedBox(height: 8),
        Text('Small 12px — подписи', style: AppTypography.small),
        const SizedBox(height: 8),
        Text('Micro 11px — юридический', style: AppTypography.micro),
        const SizedBox(height: 8),
        Text('BADGE 10px', style: AppTypography.badge.copyWith(color: AppColors.terracotta)),

        const SizedBox(height: 80),
      ],
    );
  }

  // ── PAGE 2: Colors ──
  Widget _buildColors() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        _SectionLabel('Основные'),
        _ColorRow('Терракота', AppColors.terracotta, '#C73E28'),
        _ColorRow('Коралл', AppColors.coral, '#E8734A'),
        _ColorRow('Тёмный кофе', AppColors.darkCoffee, '#1A0E08'),
        _ColorRow('Светлый кофе', AppColors.lightCoffee, '#3A2018'),
        _ColorRow('Фон', AppColors.background, '#FAFAF7'),
        _ColorRow('Карточка', AppColors.cardBackground, '#FFFFFF'),
        const SizedBox(height: 12),

        _SectionLabel('Текст'),
        _ColorRow('Primary', AppColors.textPrimary, '#1A1A1A'),
        _ColorRow('Secondary', AppColors.textSecondary, '#666666'),
        _ColorRow('Tertiary', AppColors.textTertiary, '#7A6E62'),
        _ColorRow('Placeholder', AppColors.textPlaceholder, '#757575'),
        _ColorRow('Metadata', AppColors.textMetadata, '#C0B8B0'),
        const SizedBox(height: 12),

        _SectionLabel('Семантические'),
        _ColorRow('Успех', AppColors.success, '#2D7F5E'),
        _ColorRow('Успех светлый', AppColors.successLight, '#2D9F6E'),
        _ColorRow('Ошибка', AppColors.error, '#DC3545'),
        _ColorRow('Фиолетовый', AppColors.purple, '#7B61FF'),
        _ColorRow('Золотой', AppColors.gold, '#FFB800'),
        const SizedBox(height: 12),

        _SectionLabel('Поверхности'),
        _ColorRow('Light', AppColors.surfaceLight, '#F5F3EF'),
        _ColorRow('Medium', AppColors.surfaceMedium, '#F0EDE8'),
        _ColorRow('Border', AppColors.border, '#E8E5E0'),

        const SizedBox(height: 80),
      ],
    );
  }

  // ── PAGE 3: States ──
  Widget _buildStates() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),

        _SectionLabel('Shimmer Loading'),
        const SizedBox(
          height: 200,
          child: HomeShimmer(),
        ),
        const SizedBox(height: 24),

        _SectionLabel('Error View'),
        ErrorView(
          icon: const Icon(
            Icons.error_outline,
            size: 40,
            color: AppColors.textTertiary,
          ),
          title: 'Что-то пошло не так',
          message: 'Не удалось загрузить данные',
          onRetry: () {},
        ),
        const SizedBox(height: 24),

        _SectionLabel('No Connection (preview)'),
        Container(
          height: 300,
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.wifi_off_rounded,
                size: 40,
                color: AppColors.textTertiary.withOpacity(0.4),
              ),
              const SizedBox(height: 20),
              Text(
                'Нет подключения',
                style: AppTypography.screenTitle,
              ),
              const SizedBox(height: 8),
              Text(
                'Проверьте интернет-соединение',
                style: AppTypography.body.copyWith(
                  color: AppColors.textTertiary,
                ),
              ),
              const SizedBox(height: 24),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: AppButton(
                  text: 'Попробовать снова',
                  onPressed: () {},
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 80),
      ],
    );
  }
}

// ── Helper widgets ──

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.textTertiary,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

class _ColorRow extends StatelessWidget {
  const _ColorRow(this.name, this.color, this.hex);
  final String name;
  final Color color;
  final String hex;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: AppColors.border,
                width: color == Colors.white || color == AppColors.background
                    ? 1
                    : 0,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(name, style: AppTypography.body),
          ),
          Text(
            hex,
            style: AppTypography.caption.copyWith(
              fontFamily: 'monospace',
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}
