import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../models/qa_question.dart';
import '../services/club_api_service.dart';

/// Bottom sheet для задания вопроса Анне.
///
/// Ограничения с бэка:
/// - min 5 символов
/// - max 500 символов
/// - дубликаты блокируются (409 QA_DUPLICATE)
///
/// Возвращает созданный QAQuestion через Navigator.pop (или null если отмена).
class AskQuestionSheet extends ConsumerStatefulWidget {
  const AskQuestionSheet({super.key, required this.clubMonthId});
  final String clubMonthId;

  @override
  ConsumerState<AskQuestionSheet> createState() => _AskQuestionSheetState();
}

class _AskQuestionSheetState extends ConsumerState<AskQuestionSheet> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();

  bool _isSending = false;
  String? _errorText;

  static const int _maxChars = 500;
  static const int _minChars = 5;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      if (_errorText != null) setState(() => _errorText = null);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.length < _minChars) {
      setState(() => _errorText = 'Минимум $_minChars символов');
      return;
    }
    if (text.length > _maxChars) {
      setState(() => _errorText = 'Максимум $_maxChars символов');
      return;
    }

    setState(() {
      _isSending = true;
      _errorText = null;
    });

    try {
      final api = ref.read(clubApiServiceProvider);
      final question = await api.askQuestion(
        clubMonthId: widget.clubMonthId,
        questionText: text,
      );
      if (!mounted) return;
      Navigator.of(context).pop(question);
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      setState(() {
        _isSending = false;
        _errorText = code == 'QA_DUPLICATE'
            ? 'Похожий вопрос уже задан'
            : 'Не удалось отправить — попробуйте ещё раз';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isSending = false;
        _errorText = 'Не удалось отправить — попробуйте ещё раз';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final remaining = _maxChars - _controller.text.length;
    final isOverLimit = remaining < 0;

    // viewInsets — учитывает клавиатуру.
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.cardBackground,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // — Хэндл —
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                Text('Вопрос Анне', style: AppTypography.serifSectionTitle),
                const SizedBox(height: 4),
                Text(
                  'Анна отвечает по пятницам — пришлём push когда ответ будет готов',
                  style: AppTypography.caption,
                ),
                const SizedBox(height: 16),

                // — Поле ввода —
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.surfaceLight,
                    borderRadius: BorderRadius.circular(12),
                    border: _errorText != null
                        ? Border.all(color: AppColors.error)
                        : null,
                  ),
                  child: TextField(
                    controller: _controller,
                    focusNode: _focusNode,
                    autofocus: true,
                    maxLines: 6,
                    minLines: 4,
                    maxLength: _maxChars,
                    enabled: !_isSending,
                    style: AppTypography.body,
                    decoration: InputDecoration(
                      hintText: 'О чём хотите спросить?',
                      hintStyle: AppTypography.body.copyWith(
                        color: AppColors.textPlaceholder,
                      ),
                      border: InputBorder.none,
                      counterText: '',
                      contentPadding: const EdgeInsets.all(14),
                    ),
                  ),
                ),

                // — Счётчик символов / ошибка —
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: _errorText != null
                            ? Text(
                                _errorText!,
                                style: AppTypography.small.copyWith(
                                  color: AppColors.error,
                                ),
                              )
                            : const SizedBox.shrink(),
                      ),
                      Text(
                        '$remaining',
                        style: AppTypography.small.copyWith(
                          color: isOverLimit
                              ? AppColors.error
                              : AppColors.textTertiary,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),

                // — Кнопка отправки —
                AppButton(
                  text: _isSending ? 'Отправка...' : 'Задать вопрос',
                  onPressed: _isSending ? null : _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
