import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';

/// Поле ввода чата клуба.
///
/// Поведение:
/// - canPost=true (активная подписка, не мьют) → поле + кнопка фото + send
/// - canPost=false:
///   - kind=archive → серая полоска «Архив — чтение разрешено»
///   - isMuted=true → «Вы заблокированы в чате до DD.MM HH:mm»
///   - иначе → пустой контейнер (не должно случаться, но защитно)
///
/// Лимит на сервере — 1000 символов; counter показываем когда осталось ≤50.
///
/// onAttachImage вызывается при тапе на кнопку-скрепку (выбор фото).
/// Сам выбор/загрузку делает родитель (ChatTab) — инпут только сигналит.
class ChatInput extends StatefulWidget {
  const ChatInput({
    super.key,
    required this.canPost,
    required this.isMuted,
    required this.isArchive,
    required this.onSend,
    required this.onAttachImage,
    this.mutedUntil,
  });

  final bool canPost;
  final bool isMuted;
  final bool isArchive;
  final DateTime? mutedUntil;
  final ValueChanged<String> onSend;
  final VoidCallback onAttachImage;

  @override
  State<ChatInput> createState() => _ChatInputState();
}

class _ChatInputState extends State<ChatInput> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  bool _hasText = false;

  static const int _maxChars = 1000;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      final has = _controller.text.trim().isNotEmpty;
      if (has != _hasText) setState(() => _hasText = has);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _handleSend() {
    final text = _controller.text.trim();
    if (text.isEmpty || text.length > _maxChars) return;
    widget.onSend(text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.canPost) {
      return _ReadOnlyBanner(
        isArchive: widget.isArchive,
        isMuted: widget.isMuted,
        mutedUntil: widget.mutedUntil,
      );
    }

    final remaining = _maxChars - _controller.text.length;
    final showCounter = remaining <= 50;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (showCounter)
                Padding(
                  padding: const EdgeInsets.only(right: 60, bottom: 4),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      '$remaining',
                      style: AppTypography.micro.copyWith(
                        color: remaining < 0
                            ? AppColors.error
                            : AppColors.textTertiary,
                      ),
                    ),
                  ),
                ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // — Кнопка прикрепить фото —
                  _AttachButton(onTap: widget.onAttachImage),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Container(
                      constraints: const BoxConstraints(maxHeight: 120),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceLight,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: TextField(
                        controller: _controller,
                        focusNode: _focusNode,
                        minLines: 1,
                        maxLines: 5,
                        maxLength: _maxChars,
                        textInputAction: TextInputAction.newline,
                        style: AppTypography.body,
                        decoration: InputDecoration(
                          hintText: 'Сообщение...',
                          hintStyle: AppTypography.body.copyWith(
                            color: AppColors.textPlaceholder,
                          ),
                          border: InputBorder.none,
                          counterText: '',
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  _SendButton(enabled: _hasText, onTap: _handleSend),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Кнопка-скрепка для прикрепления фото. Открывает выбор источника
/// (галерея/камера) — реализовано в родителе через onAttachImage.
class _AttachButton extends StatelessWidget {
  const _AttachButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: const SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            Icons.add_photo_alternate_outlined,
            size: 24,
            color: AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

/// Круглая кнопка отправки. Серая когда нет текста, terracotta когда есть.
class _SendButton extends StatelessWidget {
  const _SendButton({required this.enabled, required this.onTap});
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: enabled ? AppColors.terracotta : AppColors.surfaceMedium,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: enabled ? onTap : null,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            Icons.arrow_upward,
            size: 22,
            color: enabled ? Colors.white : AppColors.textTertiary,
          ),
        ),
      ),
    );
  }
}

/// Read-only баннер вместо поля ввода.
class _ReadOnlyBanner extends StatelessWidget {
  const _ReadOnlyBanner({
    required this.isArchive,
    required this.isMuted,
    required this.mutedUntil,
  });
  final bool isArchive;
  final bool isMuted;
  final DateTime? mutedUntil;

  @override
  Widget build(BuildContext context) {
    String message;
    IconData icon;

    if (isMuted && mutedUntil != null) {
      final local = mutedUntil!.toLocal();
      final dd = local.day.toString().padLeft(2, '0');
      final mm = local.month.toString().padLeft(2, '0');
      final hh = local.hour.toString().padLeft(2, '0');
      final min = local.minute.toString().padLeft(2, '0');
      message = 'Вы заблокированы в чате до $dd.$mm $hh:$min';
      icon = Icons.volume_off_outlined;
    } else if (isArchive) {
      message = 'Архивный режим — отправка сообщений недоступна';
      icon = Icons.archive_outlined;
    } else {
      message = 'Отправка сообщений недоступна';
      icon = Icons.lock_outline;
    }

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          child: Row(
            children: [
              Icon(icon, size: 18, color: AppColors.textTertiary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(message, style: AppTypography.caption),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
