import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/error_view.dart';
import '../models/club_access.dart';
import '../models/club_month.dart';
import '../models/qa_question.dart';
import '../services/club_api_service.dart';
import 'ask_question_sheet.dart';

/// Таб «Q&A» — список вопросов к Анне.
///
/// Загружает вопросы клуба, рендерит ExpansionTile-карточки.
/// Кнопка «Задать вопрос» внизу — открывает AskQuestionSheet, после успешной
/// отправки рефрешим список.
///
/// Анна отвечает по пятницам (см. AI-CONTEXT v5). Push участнице при ответе —
/// задача 6.1.
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
                      itemBuilder: (_, i) => _QuestionCard(question: _questions[i]),
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
class _QuestionCard extends StatelessWidget {
  const _QuestionCard({required this.question});
  final QAQuestion question;

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
            else
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'Анна отвечает по пятницам — следите за уведомлениями',
                  style: AppTypography.caption.copyWith(
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
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
