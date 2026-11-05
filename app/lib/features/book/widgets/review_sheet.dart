import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/network/network_error.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/community_rules_sheet.dart';
import '../../club/services/club_api_service.dart';
import '../providers/book_provider.dart';
import '../providers/reviews_provider.dart';
import '../services/reviews_service.dart';

/// Шторка «Оставить отзыв» / «Изменить отзыв» (UPDATES-PLAN C3, 05.11.2026).
///
/// Звёзды 1–5 и текст до 1000 символов (текст необязателен — сервер
/// принимает пустой). Отзыв один на разбор: повторная отправка правит
/// прежний. Публикуется сразу, модерация — постфактум (правило P6).
///
/// Перед первой публикацией — правила сообщества (A3): шторка
/// ensureCommunityRulesAccepted. Если сервер всё равно ответил
/// UGC_RULES_REQUIRED (профиль на устройстве устарел) — показываем её ещё раз
/// и повторяем отправку.
///
/// Возвращает true, если отзыв сохранён.
Future<bool> showReviewSheet(
  BuildContext context, {
  required String bookId,
  Review? existing,
}) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _ReviewSheet(bookId: bookId, existing: existing),
  );
  return saved ?? false;
}

class _ReviewSheet extends ConsumerStatefulWidget {
  const _ReviewSheet({required this.bookId, this.existing});

  final String bookId;
  final Review? existing;

  @override
  ConsumerState<_ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends ConsumerState<_ReviewSheet> {
  static const int _maxLength = 1000;

  late final TextEditingController _textController;
  int _rating = 0;
  bool _isSaving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _rating = widget.existing?.rating ?? 0;
    _textController = TextEditingController(text: widget.existing?.text ?? '');
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_rating < 1) {
      setState(() => _error = 'Поставьте оценку — от одной до пяти звёзд');
      return;
    }
    setState(() {
      _isSaving = true;
      _error = null;
    });

    // A3: правила сообщества до первой публикации.
    final accepted = await ensureCommunityRulesAccepted(context, ref);
    if (!mounted) return;
    if (!accepted) {
      setState(() => _isSaving = false);
      return;
    }

    var saved = await _send();
    if (!mounted) return;
    if (saved == _SendResult.rulesRequired) {
      // Сервер не видит согласия — показываем правила ещё раз.
      final again =
          await ensureCommunityRulesAccepted(context, ref, force: true);
      if (!mounted) return;
      if (!again) {
        setState(() => _isSaving = false);
        return;
      }
      saved = await _send();
      if (!mounted) return;
    }

    if (saved == _SendResult.ok) {
      // Рейтинг в шапке экрана книги берётся из книги — перечитываем её.
      ref.invalidate(bookProvider(widget.bookId));
      Navigator.of(context).pop(true);
      return;
    }
    setState(() => _isSaving = false);
  }

  Future<_SendResult> _send() async {
    try {
      await ref.read(reviewsProvider(widget.bookId).notifier).submit(
            rating: _rating,
            text: _textController.text.trim(),
          );
      return _SendResult.ok;
    } catch (e) {
      final code = ClubApiService.errorCodeFromException(e);
      if (code == 'UGC_RULES_REQUIRED') return _SendResult.rulesRequired;
      if (!mounted) return _SendResult.failed;
      setState(() => _error = switch (code) {
            'PURCHASE_REQUIRED' =>
              'Отзыв могут оставить те, у кого есть доступ к разбору',
            'FORBIDDEN' => 'Вы не можете оставлять отзывы',
            'VALIDATION_ERROR' =>
              'Проверьте оценку и текст — не больше 1000 символов',
            _ => userMessageFor(
                e,
                fallback: 'Не удалось сохранить отзыв. Попробуйте ещё раз',
              ),
          });
      return _SendResult.failed;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.existing != null;

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
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
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
              const SizedBox(height: 20),
              Text(
                isEdit ? 'Изменить отзыв' : 'Ваш отзыв',
                style: AppTypography.serifSectionTitle,
              ),
              const SizedBox(height: 4),
              Text(
                'Отзыв увидят другие участницы',
                style: AppTypography.caption,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  for (var i = 1; i <= 5; i++)
                    IconButton(
                      onPressed: _isSaving
                          ? null
                          : () => setState(() {
                                _rating = i;
                                _error = null;
                              }),
                      icon: Icon(
                        i <= _rating
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        size: 34,
                        color: i <= _rating
                            ? AppColors.gold
                            : AppColors.textTertiary,
                      ),
                      tooltip: '$i из 5',
                      constraints: const BoxConstraints(
                        minWidth: AppSpacing.minTapTarget,
                        minHeight: AppSpacing.minTapTarget,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.surfaceMedium,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
                ),
                child: TextField(
                  controller: _textController,
                  enabled: !_isSaving,
                  maxLength: _maxLength,
                  minLines: 3,
                  maxLines: 6,
                  textCapitalization: TextCapitalization.sentences,
                  style: AppTypography.inputText,
                  decoration: InputDecoration(
                    hintText: 'Что откликнулось, что запомнилось',
                    hintStyle: AppTypography.inputPlaceholder,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(
                  _error!,
                  style: AppTypography.caption.copyWith(color: AppColors.error),
                ),
              ],
              const SizedBox(height: 16),
              AppButton(
                text: isEdit ? 'Сохранить' : 'Опубликовать',
                isLoading: _isSaving,
                onPressed: _isSaving ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _SendResult { ok, rulesRequired, failed }
