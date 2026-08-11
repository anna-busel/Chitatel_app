import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../providers/onboarding_provider.dart';

/// Онбординг, опрос (задача 6.3, тексты вопросов — от Анны Бусел).
///
/// 6 шагов: жизненная ситуация + 5 вопросов. Часть — выбор карточками
/// (одиночный/множественный), часть — свободный текст. Ответы уходят в
/// POST /api/profile/survey и подмешиваются в контекст ИИ-анализа цитат
/// (см. server ai.service.buildUserContext). Ничто не обязательно: любой шаг
/// можно оставить пустым, весь опрос — «Пропустить».
///
/// Иконки — Material (как везде в приложении), не эмодзи.
class SurveyScreen extends ConsumerStatefulWidget {
  const SurveyScreen({super.key});

  @override
  ConsumerState<SurveyScreen> createState() => _SurveyScreenState();
}

class _SurveyScreenState extends ConsumerState<SurveyScreen> {
  static const int _stepCount = 6;

  int _step = 0;
  bool _isSaving = false;

  // Шаг 1 — жизненная ситуация (одиночный выбор, коды для сервера).
  String? _lifeSituation;

  // Шаг 3 — что мешает читать (одиночный выбор; «Другое» → поле ввода).
  String? _obstacle;

  // Шаг 5 — что ценно в клубе (множественный выбор).
  final Set<String> _clubValues = <String>{};

  // Свободный текст.
  final _childhoodBookCtrl = TextEditingController();
  final _obstacleOtherCtrl = TextEditingController();
  final _lifeQuestionCtrl = TextEditingController();
  final _yearWishCtrl = TextEditingController();

  static const List<_Choice> _situations = [
    _Choice('mom', 'Я мама', Icons.child_care, subtitle: 'Дети — главная забота'),
    _Choice('married', 'Замужем', Icons.balance,
        subtitle: 'Балансирую дом, работу и себя'),
    _Choice('single', 'Без отношений', Icons.self_improvement,
        subtitle: 'Изучаю мир и себя'),
  ];

  static const List<_Choice> _obstacles = [
    _Choice('Не хватает времени', 'Не хватает времени', Icons.schedule),
    _Choice('Откладываю жизнь «на потом»', 'Откладываю жизнь «на потом»',
        Icons.hourglass_bottom),
    _Choice('Жду «идеальных условий»', 'Жду «идеальных условий»', Icons.tune),
    _Choice('Не могу найти «ту самую» книгу', 'Не могу найти «ту самую» книгу',
        Icons.search),
    _Choice('Часто отвлекаюсь', 'Часто отвлекаюсь', Icons.blur_on),
    _Choice('Не хватает мотивации', 'Не хватает мотивации', Icons.bolt),
    _Choice('Другое', 'Другое', Icons.more_horiz),
  ];

  static const List<_Choice> _clubValueOptions = [
    _Choice('Поддержка и опора', 'Поддержка и опора', Icons.favorite_border),
    _Choice('Регулярность рядом с другими', 'Регулярность рядом с другими',
        Icons.groups),
    _Choice('Общение с единомышленниками', 'Общение с единомышленниками',
        Icons.forum),
    _Choice('Новые книжные открытия', 'Новые книжные открытия',
        Icons.auto_stories),
    _Choice('Интересные обсуждения', 'Интересные обсуждения',
        Icons.chat_bubble_outline),
    _Choice('Мотивация читать регулярно', 'Мотивация читать регулярно',
        Icons.local_fire_department),
    _Choice('Новые знакомства', 'Новые знакомства', Icons.person_add_alt_1),
  ];

  @override
  void dispose() {
    _childhoodBookCtrl.dispose();
    _obstacleOtherCtrl.dispose();
    _lifeQuestionCtrl.dispose();
    _yearWishCtrl.dispose();
    super.dispose();
  }

  Map<String, dynamic> _collect() {
    final a = <String, dynamic>{};
    if (_lifeSituation != null) a['lifeSituation'] = _lifeSituation;

    final cb = _childhoodBookCtrl.text.trim();
    if (cb.isNotEmpty) a['childhoodBook'] = cb;

    if (_obstacle != null) {
      if (_obstacle == 'Другое') {
        final other = _obstacleOtherCtrl.text.trim();
        a['readingObstacle'] = other.isNotEmpty ? other : 'Другое';
      } else {
        a['readingObstacle'] = _obstacle;
      }
    }

    final lq = _lifeQuestionCtrl.text.trim();
    if (lq.isNotEmpty) a['lifeQuestion'] = lq;

    if (_clubValues.isNotEmpty) a['clubValue'] = _clubValues.toList();

    final yw = _yearWishCtrl.text.trim();
    if (yw.isNotEmpty) a['yearWish'] = yw;

    return a;
  }

  void _next() {
    FocusScope.of(context).unfocus();
    if (_step < _stepCount - 1) {
      setState(() => _step += 1);
    } else {
      _finish();
    }
  }

  void _back() {
    FocusScope.of(context).unfocus();
    if (_step > 0) setState(() => _step -= 1);
  }

  Future<void> _finish() async {
    FocusScope.of(context).unfocus();
    setState(() => _isSaving = true);
    try {
      await ref.read(onboardingControllerProvider).submitSurvey(_collect());
      if (!mounted) return;
      context.go(Routes.onboardingExtra);
    } catch (_) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить. Попробуйте позже')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _step == _stepCount - 1;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.authScreenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Верхняя строка: прогресс + «Пропустить».
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Персонализация · ${_step + 1}/$_stepCount',
                      style: AppTypography.captionMedium,
                    ),
                  ),
                  GestureDetector(
                    onTap: _isSaving ? null : _finish,
                    behavior: HitTestBehavior.opaque,
                    child: Text(
                      'Пропустить',
                      style: AppTypography.captionMedium.copyWith(
                        color: AppColors.terracotta,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: (_step + 1) / _stepCount,
                  minHeight: 4,
                  backgroundColor: AppColors.border,
                  valueColor:
                      const AlwaysStoppedAnimation<Color>(AppColors.terracotta),
                ),
              ),
              const SizedBox(height: 20),

              Expanded(
                child: SingleChildScrollView(
                  child: _buildStep(),
                ),
              ),

              const SizedBox(height: 12),
              Row(
                children: [
                  if (_step > 0) ...[
                    _BackButton(onTap: _isSaving ? null : _back),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: AppButton(
                      text: isLast ? 'Завершить' : 'Далее',
                      isLoading: _isSaving,
                      onPressed: _isSaving ? null : _next,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStep() {
    switch (_step) {
      case 0:
        return _choiceStep(
          icon: Icons.person_pin_circle_outlined,
          question: 'Расскажите о себе',
          children: [
            for (final c in _situations)
              _ChoiceCard(
                choice: c,
                selected: _lifeSituation == c.value,
                onTap: () => setState(() => _lifeSituation = c.value),
              ),
          ],
        );
      case 1:
        return _textStep(
          icon: Icons.menu_book,
          question: 'Какую книгу вы больше всего любили в детстве?',
          hint: 'Ту, которую перечитывали снова и снова или вспоминаете с теплотой.',
          controller: _childhoodBookCtrl,
          fieldHint: 'Название книги',
        );
      case 2:
        return _choiceStep(
          icon: Icons.hourglass_bottom,
          question: 'Что чаще всего мешает вам читать столько, сколько хочется?',
          children: [
            for (final c in _obstacles)
              _ChoiceCard(
                choice: c,
                selected: _obstacle == c.value,
                onTap: () => setState(() => _obstacle = c.value),
              ),
            if (_obstacle == 'Другое') ...[
              const SizedBox(height: 8),
              _inputField(
                controller: _obstacleOtherCtrl,
                hint: 'Опишите своими словами',
              ),
            ],
          ],
        );
      case 3:
        return _textStep(
          icon: Icons.auto_awesome,
          question: 'Какой вопрос вас больше всего волнует в данный момент жизни?',
          hint: null,
          controller: _lifeQuestionCtrl,
          fieldHint: 'Ваш вопрос',
          minLines: 2,
        );
      case 4:
        return _choiceStep(
          icon: Icons.groups,
          question: 'Что для вас самое ценное в книжном клубе?',
          hint: 'Можно выбрать несколько.',
          children: [
            for (final c in _clubValueOptions)
              _ChoiceCard(
                choice: c,
                selected: _clubValues.contains(c.value),
                onTap: () => setState(() {
                  if (!_clubValues.add(c.value)) _clubValues.remove(c.value);
                }),
              ),
          ],
        );
      case 5:
      default:
        return _textStep(
          icon: Icons.eco,
          question:
              'Представьте, что через год вы скажете: «Этот книжный клуб изменил мою жизнь». Что должно произойти?',
          hint:
              'Например: начну читать регулярно, найду близких по духу людей, открою любимого автора.',
          controller: _yearWishCtrl,
          fieldHint: 'Поделитесь своим желанием',
          minLines: 3,
        );
    }
  }

  Widget _stepHeader(IconData icon, String question, String? hint) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 30, color: AppColors.terracotta),
        const SizedBox(height: 14),
        Text(question, style: AppTypography.serifSectionTitle),
        if (hint != null) ...[
          const SizedBox(height: 8),
          Text(
            hint,
            style: AppTypography.body.copyWith(color: AppColors.textSecondary),
          ),
        ],
        const SizedBox(height: 18),
      ],
    );
  }

  Widget _choiceStep({
    required IconData icon,
    required String question,
    String? hint,
    required List<Widget> children,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stepHeader(icon, question, hint),
        ...children,
      ],
    );
  }

  Widget _textStep({
    required IconData icon,
    required String question,
    required String? hint,
    required TextEditingController controller,
    required String fieldHint,
    int minLines = 1,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _stepHeader(icon, question, hint),
        _inputField(controller: controller, hint: fieldHint, minLines: minLines),
      ],
    );
  }

  Widget _inputField({
    required TextEditingController controller,
    required String hint,
    int minLines = 1,
  }) {
    return TextField(
      controller: controller,
      minLines: minLines,
      maxLines: minLines > 1 ? minLines + 3 : 1,
      textCapitalization: TextCapitalization.sentences,
      style: AppTypography.inputText.copyWith(fontSize: 16),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: AppTypography.inputPlaceholder,
        filled: true,
        fillColor: AppColors.cardBackground,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: const BorderSide(color: AppColors.terracotta, width: 1.5),
        ),
      ),
    );
  }
}

/// Вариант ответа: value уходит на сервер, label — на экран.
class _Choice {
  const _Choice(this.value, this.label, this.icon, {this.subtitle});

  final String value;
  final String label;
  final IconData icon;
  final String? subtitle;
}

class _ChoiceCard extends StatelessWidget {
  const _ChoiceCard({
    required this.choice,
    required this.selected,
    required this.onTap,
  });

  final _Choice choice;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.terracotta.withValues(alpha: 0.06)
                : AppColors.cardBackground,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(
              color: selected ? AppColors.terracotta : AppColors.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                choice.icon,
                size: 22,
                color: selected ? AppColors.terracotta : AppColors.textSecondary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(choice.label, style: AppTypography.bodyLargeMedium),
                    if (choice.subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        choice.subtitle!,
                        style: AppTypography.caption,
                      ),
                    ],
                  ],
                ),
              ),
              if (selected)
                const Icon(Icons.check_circle,
                    size: 20, color: AppColors.terracotta),
            ],
          ),
        ),
      ),
    );
  }
}

class _BackButton extends StatelessWidget {
  const _BackButton({required this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: AppColors.cardBackground,
          borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
          border: Border.all(color: AppColors.border),
        ),
        child: const Icon(Icons.arrow_back, color: AppColors.textSecondary),
      ),
    );
  }
}
