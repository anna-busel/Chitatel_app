import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/error_view.dart';
import '../models/club_access.dart';
import '../models/club_month.dart';
import '../models/qa_question.dart';
import '../services/club_api_service.dart';
import '../services/qa_admin_service.dart';
import 'ask_question_sheet.dart';

/// Таб «Q&A» — список вопросов к Анне.
///
/// Это ОТДЕЛЬНАЯ рубрика, не чат: вопрос задаётся кнопкой внизу, ответ Анны
/// появляется внутри карточки вопроса (статус меняется «Ждёт» → «Отвечен»).
/// В чат ответы не попадают и не должны.
///
/// ⚠️ 12.07.2026 (Фаза 6): у АННЫ (access.kind == admin) в карточке
/// неотвеченного вопроса появилась кнопка «Ответить» — раньше ответить можно
/// было только curl'ом по /api/admin/qa/:id/answer, UI не существовало нигде,
/// и Q&A по факту не работал.
///
/// ⚠️ 13.07.2026 — ФИКС ВЁРСТКИ: короткий ответ («да») съёживался по ширине
/// текста и вставал по ЦЕНТРУ карточки. Причина: ExpansionTile по умолчанию
/// центрирует раскрытое содержимое (expandedCrossAxisAlignment = center).
/// Ставим stretch — блок ответа всегда во всю ширину, как и длинный.
class QATab extends ConsumerStatefulWidget {
  const QATab({super.key, required this.club, required this.access});
  final ClubMonth club;
  final ClubAccess access;

  @override
  ConsumerState<QATab> createState() => _QATabState();
}

class _QATabState extends ConsumerState<QATab> {
  List<QAQuestion> _questions = [];
  bool _isLoading = true;
  bool _hasError = false;

  /// Анна — ведущая клуба. Только у неё есть кнопка «Ответить».
  bool get _isAdmin => widget.access.kind == ClubAccessKind.admin;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = ref.read(clubApiServiceProvider);
      final qs = await api.fetchQA(widget.club.id);
      if (!mounted) return;
      setState(() {
        _questions = qs;
        _isLoading = false;
        _hasError = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _hasError = true;
      });
    }
  }

  Future<void> _openAskSheet() async {
    final newQuestion = await showModalBottomSheet<QAQuestion>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AskQuestionSheet(clubMonthId: widget.club.id),
    );
    if (newQuestion != null && mounted) {
      setState(() {
        _questions = [newQuestion, ..._questions];
      });
    }
  }

  /// Ответить на вопрос (только Анна). Диалог с полем ответа → отправка →
  /// карточка перерисовывается уже с ответом.
  Future<void> _answerQuestion(QAQuestion question) async {
    final controller = TextEditingController();

    final answer = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.background,
        title: Text('Ответить', style: AppTypography.sectionHeader),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              question.questionText,
              style: AppTypography.caption,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              maxLength: 5000,
              minLines: 3,
              maxLines: 8,
              style: AppTypography.body,
              decoration: InputDecoration(
                hintText: 'Ваш ответ участнице',
                hintStyle: AppTypography.body.copyWith(
                  color: AppColors.textPlaceholder,
                ),
                counterText: '',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(
              'Отмена',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.terracotta,
            ),
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Опубликовать'),
          ),
        ],
      ),
    );

    if (answer == null || answer.isEmpty || !mounted) return;

    try {
      final updated = await ref.read(qaAdminServiceProvider).answerQuestion(
            questionId: question.id,
            answerText: answer,
          );
      if (!mounted) return;
      setState(() {
        _questions = _questions
            .map((q) => q.id == updated.id ? updated : q)
            .toList(growable: false);
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Ответ опубликован'),
        backgroundColor: AppColors.success,
      ));
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      final msg = code == 'FORBIDDEN'
          ? 'На вопрос уже отвечено'
          : 'Не удалось отправить ответ';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Container(
        color: AppColors.background,
        child: const Center(
          child: CircularProgressIndicator(
            color: AppColors.terracotta,
            strokeWidth: 2.5,
          ),
        ),
      );
    }

    if (_hasError) {
      return ErrorView(
        message: 'Не удалось загрузить вопросы',
        onRetry: () {
          setState(() => _isLoading = true);
          _load();
        },
      );
    }

    return Container(
      color: AppColors.background,
      child: Column(
        children: [
          Expanded(
            child: _questions.isEmpty
                ? _EmptyQA()
                : RefreshIndicator(
                    color: AppColors.terracotta,
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                      itemCount: _questions.length,
                      itemBuilder: (_, i) => _QuestionCard(
                        question: _questions[i],
                        onAnswer: _isAdmin && !_questions[i].isAnswered
                            ? () => _answerQuestion(_questions[i])
                            : null,
                      ),
                    ),
                  ),
          ),
          // — Кнопка «Задать вопрос» — только когда можно постить —
          if (widget.access.canPost)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: AppButton(
                  text: 'Задать вопрос',
                  onPressed: _openAskSheet,
                ),
              ),
            )
          else
            SafeArea(
              top: false,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
                decoration: BoxDecoration(
                  color: AppColors.surfaceLight,
                  border: Border(top: BorderSide(color: AppColors.border)),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.archive_outlined,
                      size: 18,
                      color: AppColors.textTertiary,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        widget.access.kind == ClubAccessKind.archive
                            ? 'В архивном режиме нельзя задавать вопросы'
                            : 'Задавать вопросы можно только с подпиской',
                        style: AppTypography.caption,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Карточка одного Q&A.
/// Свёрнутая показывает только вопрос; раскрытая — ответ Анны (если есть).
/// Для Анны у неотвеченного вопроса — кнопка «Ответить» (onAnswer != null).
class _QuestionCard extends StatelessWidget {
  const _QuestionCard({required this.question, this.onAnswer});
  final QAQuestion question;
  final VoidCallback? onAnswer;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(14),
        boxShadow: AppColors.cardShadow,
      ),
      child: Theme(
        // Убираем дефолтные дивайдеры ExpansionTile.
        data: Theme.of(context).copyWith(
          dividerColor: Colors.transparent,
          splashColor: Colors.transparent,
        ),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.fromLTRB(14, 4, 12, 4),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          iconColor: AppColors.terracotta,
          collapsedIconColor: AppColors.textSecondary,
          // ⚠️ БЕЗ ЭТИХ ДВУХ СТРОК короткий ответ («да») сжимался по ширине
          // текста и вставал по центру карточки — ExpansionTile центрирует
          // раскрытое содержимое по умолчанию.
          expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
          expandedAlignment: Alignment.centerLeft,
          title: Row(
            children: [
              Expanded(
                child: Text(
                  question.questionText,
                  style: AppTypography.bodyMedium,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              _StatusBadge(answered: question.isAnswered),
            ],
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '${question.askedBy.name} · ${_fmtDate(question.createdAt)}',
              style: AppTypography.small,
            ),
          ),
          children: [
            if (question.isAnswered)
              _AnswerBlock(
                answer: question.answerText!,
                answeredAt: question.answeredAt,
                answeredBy: question.answeredBy?.name ?? 'Анна Бусел',
              )
            else ...[
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Анна отвечает по пятницам — следите за уведомлениями',
                    style: AppTypography.caption.copyWith(
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),
              ),
              if (onAnswer != null) ...[
                const SizedBox(height: 10),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.terracotta,
                  ),
                  onPressed: onAnswer,
                  icon: const Icon(Icons.reply, size: 18),
                  label: const Text('Ответить'),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  String _fmtDate(DateTime dt) {
    final l = dt.toLocal();
    final dd = l.day.toString().padLeft(2, '0');
    final mm = l.month.toString().padLeft(2, '0');
    return '$dd.$mm';
  }
}

/// Бейдж статуса: «Отвечен» / «Ждёт ответа».
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.answered});
  final bool answered;

  @override
  Widget build(BuildContext context) {
    final color = answered ? AppColors.success : AppColors.textTertiary;
    final bg = answered ? const Color(0x1A2D7F5E) : AppColors.surfaceMedium;
    final label = answered ? 'Отвечен' : 'Ждёт';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        label,
        style: AppTypography.micro.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// Блок ответа Анны внутри развёрнутой карточки.
/// Всегда во всю ширину карточки — короткий ответ не должен «съёживаться».
class _AnswerBlock extends StatelessWidget {
  const _AnswerBlock({
    required this.answer,
    required this.answeredBy,
    this.answeredAt,
  });
  final String answer;
  final String answeredBy;
  final DateTime? answeredAt;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(10),
        border: Border(left: BorderSide(color: AppColors.terracotta, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            answeredBy,
            style: AppTypography.smallMedium.copyWith(
              color: AppColors.terracotta,
            ),
          ),
          const SizedBox(height: 6),
          Text(answer, style: AppTypography.body),
        ],
      ),
    );
  }
}

/// Пустой Q&A — пока никто не задал вопрос.
class _EmptyQA extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.help_outline,
              size: 48,
              color: AppColors.textTertiary,
            ),
            const SizedBox(height: 12),
            Text(
              'Пока нет вопросов',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              'Задайте Анне вопрос о книге — она ответит по пятницам',
              style: AppTypography.caption,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
