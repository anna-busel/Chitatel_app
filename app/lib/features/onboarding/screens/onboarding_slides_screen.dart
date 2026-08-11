import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';

/// Онбординг, интро-слайды (MASTER 4.1) — самый первый запуск, ДО экрана входа.
///
/// 3 слайда с иконками, переключаются свайпом или кнопкой «Далее»; на 3-м —
/// «Начать» → экран входа. «Пропустить» ведёт туда же. Данных не собирает.
/// Показывается один раз: и «Начать», и «Пропустить» ставят `onboarding_seen`,
/// после чего редирект роутера на слайды больше не наводит.
class OnboardingSlidesScreen extends ConsumerStatefulWidget {
  const OnboardingSlidesScreen({super.key});

  @override
  ConsumerState<OnboardingSlidesScreen> createState() =>
      _OnboardingSlidesScreenState();
}

class _OnboardingSlidesScreenState
    extends ConsumerState<OnboardingSlidesScreen> {
  final _controller = PageController();
  int _page = 0;

  static const List<_Slide> _slides = [
    _Slide(
      icon: Icons.headphones,
      title: 'Слушайте',
      subtitle: 'Аудиоразборы книг от психолога',
    ),
    _Slide(
      icon: Icons.edit_note,
      title: 'Записывайте',
      subtitle: 'Сохраняйте цитаты в личный дневник',
    ),
    _Slide(
      icon: Icons.auto_awesome,
      title: 'Анализируйте',
      subtitle: 'ИИ найдёт паттерны в ваших мыслях',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_seen', true);
    if (!mounted) return;
    context.go(Routes.login);
  }

  void _next() {
    if (_page < _slides.length - 1) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    } else {
      _finish();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _slides.length - 1;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: GestureDetector(
                onTap: _finish,
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.screenPadding),
                  child: Text(
                    'Пропустить',
                    style: AppTypography.bodyMedium.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                itemCount: _slides.length,
                itemBuilder: (context, i) {
                  final s = _slides[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.authScreenPadding,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 120,
                          height: 120,
                          decoration: BoxDecoration(
                            color: AppColors.terracotta.withValues(alpha: 0.08),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            s.icon,
                            size: 52,
                            color: AppColors.terracotta,
                          ),
                        ),
                        const SizedBox(height: 32),
                        Text(
                          s.title,
                          style: AppTypography.serifHeadline,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          s.subtitle,
                          textAlign: TextAlign.center,
                          style: AppTypography.bodyLarge.copyWith(
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (int i = 0; i < _slides.length; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: i == _page ? 22 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: i == _page
                          ? AppColors.terracotta
                          : AppColors.border,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.authScreenPadding,
                0,
                AppSpacing.authScreenPadding,
                24,
              ),
              child: AppButton(
                text: isLast ? 'Начать' : 'Далее',
                onPressed: _next,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Один слайд интро.
class _Slide {
  const _Slide({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;
}
