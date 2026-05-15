import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/chat_message.dart';

/// Bubble одного сообщения в чате.
///
/// Логика стиля:
/// - Своё сообщение — справа, terracotta фон, белый текст
/// - Чужое — слева, белый фон, тёмный текст
/// - Удалённое (deletedAt != null) — серый курсив «Сообщение удалено»
/// - Reply preview — серая полоска сверху bubble с цитатой родителя
/// - Edited badge — после времени «изменено»
///
/// Тип image/voice — заглушка с иконкой и подписью (UI добавим в 4.6/4.12).
/// Модель парсит, bubble не падает, защитная нейтральная отрисовка.
class ChatMessageBubble extends StatelessWidget {
  const ChatMessageBubble({
    super.key,
    required this.message,
    required this.currentUserId,
    this.replyTo,
    this.onLongPress,
  });

  final ChatMessage message;
  final ChatMessage? replyTo;
  final String? currentUserId;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    if (message.isDeleted) {
      return _DeletedBubble(isMine: message.isMine(currentUserId));
    }

    final isMine = message.isMine(currentUserId);
    final bubbleColor = isMine ? AppColors.terracotta : AppColors.cardBackground;
    final textColor = isMine ? Colors.white : AppColors.textPrimary;
    final metaColor = isMine ? Colors.white70 : AppColors.textTertiary;

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: onLongPress,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75,
          ),
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 3),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: bubbleColor,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(isMine ? 16 : 4),
                bottomRight: Radius.circular(isMine ? 4 : 16),
              ),
              boxShadow: isMine ? null : AppColors.cardShadow,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Имя автора (только для чужих сообщений)
                if (!isMine) ...[
                  Text(
                    message.author.name,
                    style: AppTypography.smallMedium.copyWith(
                      color: AppColors.terracotta,
                    ),
                  ),
                  const SizedBox(height: 4),
                ],

                // Reply preview (если это ответ)
                if (replyTo != null) ...[
                  _ReplyPreview(replyTo: replyTo!, isMine: isMine),
                  const SizedBox(height: 6),
                ],

                // Содержимое — text/image/voice
                _MessageContent(message: message, textColor: textColor),

                // Время + edited + pin
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (message.isPinned) ...[
                      Icon(Icons.push_pin, size: 11, color: metaColor),
                      const SizedBox(width: 4),
                    ],
                    if (message.isEdited) ...[
                      Text(
                        'изменено',
                        style: AppTypography.micro.copyWith(color: metaColor),
                      ),
                      const SizedBox(width: 6),
                    ],
                    Text(
                      _formatTime(message.createdAt),
                      style: AppTypography.micro.copyWith(color: metaColor),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final local = dt.toLocal();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }
}

/// Содержимое: текст, заглушка image, заглушка voice.
class _MessageContent extends StatelessWidget {
  const _MessageContent({required this.message, required this.textColor});
  final ChatMessage message;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    switch (message.type) {
      case ChatMessageType.text:
      case ChatMessageType.unknown:
        return Text(
          message.text,
          style: AppTypography.body.copyWith(color: textColor),
        );

      case ChatMessageType.image:
        // Заглушка для 4.5 — реальная картинка в задаче 4.6.
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.image_outlined, size: 20, color: textColor),
            const SizedBox(width: 8),
            Text(
              'Картинка',
              style: AppTypography.body.copyWith(
                color: textColor,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        );

      case ChatMessageType.voice:
        // Заглушка для 4.5 — реальный плеер с waveform в задаче 4.12.
        final secs = message.voiceDurationSec ?? 0;
        final mm = (secs ~/ 60).toString().padLeft(1, '0');
        final ss = (secs % 60).toString().padLeft(2, '0');
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.mic, size: 20, color: textColor),
            const SizedBox(width: 8),
            Text(
              'Голосовое  $mm:$ss',
              style: AppTypography.body.copyWith(color: textColor),
            ),
          ],
        );
    }
  }
}

/// Превью родительского сообщения в reply.
class _ReplyPreview extends StatelessWidget {
  const _ReplyPreview({required this.replyTo, required this.isMine});
  final ChatMessage replyTo;
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    final accent = isMine ? Colors.white : AppColors.terracotta;
    final textColor = isMine ? Colors.white70 : AppColors.textSecondary;

    String preview;
    if (replyTo.isDeleted) {
      preview = 'Сообщение удалено';
    } else if (replyTo.type == ChatMessageType.image) {
      preview = '🖼 Картинка';
    } else if (replyTo.type == ChatMessageType.voice) {
      preview = '🎤 Голосовое сообщение';
    } else {
      preview = replyTo.text;
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      decoration: BoxDecoration(
        color: (isMine ? Colors.white : AppColors.surfaceLight).withOpacity(
          isMine ? 0.15 : 1,
        ),
        borderRadius: BorderRadius.circular(8),
        border: Border(left: BorderSide(color: accent, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            replyTo.author.name,
            style: AppTypography.micro.copyWith(
              color: accent,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            preview,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.small.copyWith(color: textColor),
          ),
        ],
      ),
    );
  }
}

/// Bubble удалённого сообщения.
class _DeletedBubble extends StatelessWidget {
  const _DeletedBubble({required this.isMine});
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.surfaceMedium,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(
          'Сообщение удалено',
          style: AppTypography.caption.copyWith(
            fontStyle: FontStyle.italic,
            color: AppColors.textTertiary,
          ),
        ),
      ),
    );
  }
}
