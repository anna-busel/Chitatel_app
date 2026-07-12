import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/ai_consent_modal.dart';
import '../providers/ai_consent_provider.dart';
import '../providers/diary_provider.dart';

/// Шторка «Новая цитата» (MASTER 4.17).
///
/// Открывается:
///   - FAB (перо) на главной и в дневнике;
///   - кнопкой «В дневник» в карточке «Мысль дня» (текст и источник предзаполнены).
///
/// Если поля предзаполнены — показывается подсказка «Автозаполнено».
/// Если согласие на ИИ ещё не дано — перед сохранением показывается модалка 4.42.
/// Отказ не мешает сохранить цитату, просто без разбора.
Future<bool> showQuoteSheet(
  BuildContext context, {
  String? text,
  String? author,
  String? bookTitle,
  String? bookId,
  int? audioTimestamp,
}) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _QuoteSheet(
      text: text,
      author: author,
      bookTitle: bookTitle,
      bookId: bookId,
      audioTimestamp: audioTimestamp,
    ),
  );
  return saved ?? false;
}

class _QuoteSheet extends ConsumerStatefulWidget {
  const _QuoteSheet({
    this.text,
    this.author,
    this.bookTitle,
    this.bookId,
    this.audioTimestamp,
  });

  final String? text;
  final String? author;
  final String? bookTitle;
  final String? bookId;
  final int? audioTimestamp;

  @override
  ConsumerState<_QuoteSheet> createState() => _QuoteSheetState();
}

class _QuoteSheetState extends ConsumerState<_QuoteSheet> {
  late final TextEditingController _textController;
  late final TextEditingController _authorController;
  late final TextEditingController _bookController;

  bool _isSaving = false;

  /// true — что-то подставилось извне (мысль дня / текущий разбор).
  bool get _isPrefilled =>
      (widget.text?.isNotEmpty ?? false) ||
      (widget.author?.isNotEmpty ?? false) ||
      (widget.bookTitle?.isNotEmpty ?? false);

  @override
  void initState() {
    super.initState();
    _textController = TextEditingController(text: widget.text ?? '');
    _authorController = TextEditingController(text: widget.author ?? '');
    _bookController = TextEditingController(text: widget.bookTitle ?? '');
  }

  @override
  void dispose() {
    _textController.dispose();
    _authorController.dispose();
    _bookController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final text = _textController.text.trim();
    if (text.isEmpty) {
      return;
    }

    // Согласие на ИИ ещё не спрашивали — показываем модалку 4.42.
    // Отказ не блокирует сохранение: цитата просто останется без разбора.
    final consent = ref.read(aiConsentProvider);
    if (consent == null) {
      await showAiConsentModal(context);
      if (!mounted) return;
    }

    setState(() => _isSaving = true);

    try {
      await ref.read(diaryActionsProvider).createQuote(
            text: text,
            author: _authorController.text.trim(),
            bookTitle: _bookController.text.trim(),
            bookId: widget.bookId,
            audioTimestamp: widget.audioTimestamp,
          );

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить цитату')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final aiEnabled = ref.watch(aiConsentProvider) == true;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        left: AppSpacing.screenPadding,
        right: AppSpacing.screenPadding,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
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
          Row(
            children: [
              Expanded(
                child: Text('Новая цитата', style: AppTypography.serifSectionTitle),
              ),
              GestureDetector(
                onTap: () => Navigator.of(context).pop(false),
                behavior: HitTestBehavior.opaque,
                child: const SizedBox(
                  width: AppSpacing.minTapTarget,
                  height: AppSpacing.minTapTarget,
                  child: Icon(Icons.close, size: 20, color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          AppTextField(
            controller: _textController,
            placeholder: 'Текст цитаты',
            maxLines: 5,
            autofocus: widget.text == null || widget.text!.isEmpty,
            textCapitalization: TextCapitalization.sentences,
            autocorrect: true,
            enableSuggestions: true,
          ),
          const SizedBox(height: 10),
          AppTextField(
            controller: _authorController,
            placeholder: 'Автор',
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 10),
          AppTextField(
            controller: _bookController,
            placeholder: 'Книга',
            textCapitalization: TextCapitalization.sentences,
          ),
          if (_isPrefilled) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.check, size: 14, color: AppColors.success),
                const SizedBox(width: 6),
                Text(
                  'Автозаполнено — можно отредактировать',
                  style: AppTypography.small.copyWith(color: AppColors.success),
                ),
              ],
            ),
          ],
          const SizedBox(height: 18),
          AppButton(
            text: 'Сохранить',
            isLoading: _isSaving,
            onPressed: _isSaving ? null : _save,
          ),
          const SizedBox(height: 10),
          Center(
            child: Text(
              aiEnabled
                  ? 'После сохранения ИИ подготовит анализ'
                  : 'ИИ-анализ выключен — цитата сохранится без разбора',
              style: AppTypography.small,
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}
