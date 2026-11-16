import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/network/network_error.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../models/chat_message.dart';
import '../services/club_api_service.dart';

/// Шторка «Вопрос Анне» из чата клуба (решение Анны 15.11.2026).
///
/// Вопрос уходит ОБЫЧНЫМ сообщением в чат клуба с пометкой isQuestion —
/// видят все, отвечать и реагировать можно как на любое сообщение. Вкладки
/// «Вопросы» больше нет.
///
/// Ограничения с бэка:
/// - текст как у сообщения чата (до 1000 символов, без ссылок у участниц);
/// - не больше 3 вопросов в неделю (с понедельника 00:00 МСК) — 4-й →
///   429 QUESTION_LIMIT, показываем questionLimitMessage.
///
/// При открытии запрашиваем остаток и показываем «Осталось N из 3 на этой
/// неделе». Возвращает отправленное [ChatMessage] через Navigator.pop или
/// null, если закрыли.
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

  /// Остаток на неделю (null — ещё не загрузили или не удалось).
  int? _remaining;
  int _weeklyLimit = 3;

  static const int _maxChars = 1000;

  @override
  void initState() {
    super.initState();
    // Перерисовка на каждый ввод: кнопка «Задать вопрос» зависит от текста.
    // Ошибку лимита не сбрасываем — она остаётся до понедельника.
    _controller.addListener(() {
      setState(() {
        if (!_limitReached) _errorText = null;
      });
    });
    _loadRemaining();
  }

  bool get _limitReached => _remaining != null && _remaining! <= 0;

  Future<void> _loadRemaining() async {
    try {
      final api = ref.read(clubApiServiceProvider);
      final result = await api.fetchQuestionsRemaining(widget.clubMonthId);
      if (!mounted) return;
      setState(() {
        _remaining = result.remainingThisWeek;
        _weeklyLimit = result.weeklyLimit;
        if (_limitReached) _errorText = questionLimitMessage(null);
      });
    } catch (_) {
      // Не загрузили остаток — подписи нет, лимит всё равно проверит сервер.
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
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
      final ChatMessage sent = await api.sendTextMessage(
        clubMonthId: widget.clubMonthId,
        text: text,
        isQuestion: true,
      );
      if (!mounted) return;
      Navigator.of(context).pop(sent);
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      setState(() {
        _isSending = false;
        if (code == 'QUESTION_LIMIT') _remaining = 0;
        _errorText = switch (code) {
          'QUESTION_LIMIT' => questionLimitMessage(e),
          'LINK_NOT_ALLOWED' =>
            'Ссылки в чате запрещены. Уберите ссылку из сообщения',
          'FORBIDDEN' => 'В архиве нельзя отправлять сообщения',
          _ => userMessageFor(
              e,
              fallback: 'Не удалось отправить — попробуйте ещё раз',
            ),
        };
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
    final remainingChars = _maxChars - _controller.text.length;
    final isOverLimit = remainingChars < 0;
    final canSend = !_isSending &&
        !_limitReached &&
        _controller.text.trim().isNotEmpty;

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
                  'Вопрос появится в чате клуба с пометкой «Вопрос Анне»',
                  style: AppTypography.caption,
                ),
                if (_remaining != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Осталось $_remaining из $_weeklyLimit на этой неделе',
                    style: AppTypography.small,
                  ),
                ],
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
                    enabled: !_isSending && !_limitReached,
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

                // — Ошибка / счётчик символов —
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
                      if (remainingChars <= 50)
                        Text(
                          '$remainingChars',
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
                  onPressed: canSend ? _submit : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
