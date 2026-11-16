import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/chat_message.dart';
import '../services/club_api_service.dart';

/// Шторка «Вопросы» у Анны в чате клуба (решение Анны 15.11.2026).
///
/// Список вопросов клуба (сообщения чата с пометкой «Вопрос Анне»), новые
/// сверху: текст, имя, время. Страницы по 20 — «Показать ещё».
/// Тап по вопросу → Navigator.pop(id сообщения): чат закрывает шторку и
/// прокручивает ленту к этому сообщению с подсветкой (как к закрепу).
///
/// Отметку «просмотрено» (newCount = 0) ставит родитель при открытии.
class ChatQuestionsSheet extends ConsumerStatefulWidget {
  const ChatQuestionsSheet({super.key, required this.clubMonthId});
  final String clubMonthId;

  @override
  ConsumerState<ChatQuestionsSheet> createState() =>
      _ChatQuestionsSheetState();
}

class _ChatQuestionsSheetState extends ConsumerState<ChatQuestionsSheet> {
  final List<ChatMessage> _questions = [];
  int _page = 0;
  bool _hasMore = false;
  bool _isLoading = true;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _fetch(); // _isLoading уже true — setState в initState не нужен
  }

  /// «Показать ещё» / «Повторить».
  void _load() {
    setState(() {
      _isLoading = true;
      _hasError = false;
    });
    _fetch();
  }

  Future<void> _fetch() async {
    try {
      final api = ref.read(clubApiServiceProvider);
      final result = await api.fetchChatQuestions(
        widget.clubMonthId,
        page: _page + 1,
      );
      if (!mounted) return;
      final known = _questions.map((m) => m.id).toSet();
      setState(() {
        _questions.addAll(
          result.questions.where((m) => !known.contains(m.id)),
        );
        _page += 1;
        _hasMore = result.hasMore;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _hasError = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.of(context).size.height * 0.75;

    return Container(
      constraints: BoxConstraints(maxHeight: maxHeight),
      decoration: const BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // — Хэндл —
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text('Вопросы', style: AppTypography.serifSectionTitle),
            ),
            Flexible(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_questions.isEmpty && _isLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: Center(
          child: CircularProgressIndicator(
            color: AppColors.terracotta,
            strokeWidth: 2.5,
          ),
        ),
      );
    }

    if (_questions.isEmpty && _hasError) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Не удалось загрузить вопросы',
              style: AppTypography.caption,
            ),
            TextButton(
              onPressed: _load,
              child: const Text('Повторить'),
            ),
          ],
        ),
      );
    }

    if (_questions.isEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Text(
          'Вопросов пока нет',
          style: AppTypography.caption,
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      padding: const EdgeInsets.only(bottom: 12),
      itemCount: _questions.length + (_hasMore || _hasError ? 1 : 0),
      separatorBuilder: (_, __) => Divider(
        height: 1,
        indent: 20,
        endIndent: 20,
        color: AppColors.border,
      ),
      itemBuilder: (context, index) {
        if (index == _questions.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Center(
              child: _isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.terracotta,
                      ),
                    )
                  : TextButton(
                      onPressed: _load,
                      child: Text(
                        _hasError ? 'Повторить' : 'Показать ещё',
                      ),
                    ),
            ),
          );
        }
        final q = _questions[index];
        return _QuestionTile(
          message: q,
          onTap: () => Navigator.of(context).pop(q.id),
        );
      },
    );
  }
}

/// Строка списка: текст вопроса, имя автора, время.
class _QuestionTile extends StatelessWidget {
  const _QuestionTile({required this.message, required this.onTap});
  final ChatMessage message;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name =
        message.author.name.isNotEmpty ? message.author.name : 'Участница';
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message.text,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body,
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.small.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  _formatTime(message.createdAt),
                  style: AppTypography.small.copyWith(
                    color: AppColors.textTertiary,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// «16.11 14:05» в местном времени.
  static String _formatTime(DateTime at) {
    final local = at.toLocal();
    final dd = local.day.toString().padLeft(2, '0');
    final mm = local.month.toString().padLeft(2, '0');
    final hh = local.hour.toString().padLeft(2, '0');
    final min = local.minute.toString().padLeft(2, '0');
    return '$dd.$mm $hh:$min';
  }
}
