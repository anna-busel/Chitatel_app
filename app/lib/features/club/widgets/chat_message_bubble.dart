import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/chat_message.dart';

/// Bubble одного сообщения в чате.
///
/// Логика стиля:
/// - Своё сообщение — справа, terracotta фон, белый текст, без аватара
/// - Чужое — слева, белый фон, тёмный текст, с круглым аватаром-инициалом
/// - Удалённое (deletedAt != null) — серый курсив «Сообщение удалено»
/// - Reply preview — серая полоска сверху bubble с цитатой родителя
/// - Edited badge — после времени «изменено»
///
/// image — реальная картинка (4.6), тап открывает полноэкранный просмотр.
/// voice — заглушка с иконкой (UI в 4.12).
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

    final bubble = ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.of(context).size.width * 0.72,
      ),
      child: GestureDetector(
        onLongPress: onLongPress,
        child: Container(
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
    );

    // Своё — bubble справа без аватара.
    if (isMine) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [bubble],
        ),
      );
    }

    // Чужое — аватар слева, bubble после него.
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Avatar(
            name: message.author.name,
            avatarUrl: message.author.avatarUrl,
          ),
          const SizedBox(width: 8),
          Flexible(child: bubble),
        ],
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

/// Круглый аватар. Если `avatarUrl` есть — пытаемся загрузить картинку.
/// При ошибке загрузки или если url пустой — fallback: цветной круг с инициалом.
///
/// Цвет круга детерминирован по хэшу имени — у одного юзера всегда один цвет.
/// Палитра из 6 спокойных тонов, подходящих под бренд (тёплые, не кричащие).
class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.avatarUrl});
  final String name;
  final String? avatarUrl;

  static const double _size = 32;

  // 6 цветов — детерминированно выбирается по хэшу имени.
  // Тёплые, чтобы вписаться в фирменный палитру (terracotta / coral / coffee).
  static const List<Color> _palette = [
    Color(0xFFC73E28), // terracotta
    Color(0xFFE8734A), // coral
    Color(0xFF7B61FF), // purple
    Color(0xFF2D9F6E), // green
    Color(0xFFD9A33A), // gold-warm
    Color(0xFF3A2018), // coffee
  ];

  Color _colorForName(String n) {
    if (n.isEmpty) return _palette[0];
    // Стабильный хэш на основе суммы кодов символов.
    var sum = 0;
    for (final c in n.codeUnits) {
      sum = (sum + c) & 0x7fffffff;
    }
    return _palette[sum % _palette.length];
  }

  String _initial(String n) {
    final trimmed = n.trim();
    if (trimmed.isEmpty) return '?';
    return trimmed.characters.first.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final color = _colorForName(name);
    final initial = _initial(name);

    final fallback = Container(
      width: _size,
      height: _size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
      child: Text(
        initial,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 14,
          fontWeight: FontWeight.w700,
        ),
      ),
    );

    if (avatarUrl == null || avatarUrl!.isEmpty) {
      return fallback;
    }

    // Если URL есть — пробуем загрузить, при ошибке возвращаем fallback.
    return ClipOval(
      child: Image.network(
        avatarUrl!,
        width: _size,
        height: _size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => fallback,
      ),
    );
  }
}

/// Содержимое: текст, картинка (4.6), заглушка voice.
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
        // Картинка + опциональная подпись (caption хранится в text).
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _ChatImage(
              imageUrl: message.imageUrl ?? '',
              heroTag: 'chat-img-${message.id}',
            ),
            if (message.text.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                message.text,
                style: AppTypography.body.copyWith(color: textColor),
              ),
            ],
          ],
        );

      case ChatMessageType.voice:
        // Заглушка для 4.5/4.6 — реальный плеер с waveform в задаче 4.12.
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

/// Картинка в bubble. Скруглённая, фиксированная макс-высота, BoxFit.cover.
/// Тап открывает полноэкранный просмотр (InteractiveViewer для зума).
class _ChatImage extends StatelessWidget {
  const _ChatImage({required this.imageUrl, required this.heroTag});
  final String imageUrl;
  final String heroTag;

  @override
  Widget build(BuildContext context) {
    if (imageUrl.isEmpty) {
      return Container(
        width: 200,
        height: 150,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.surfaceMedium,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Icon(
          Icons.broken_image_outlined,
          color: AppColors.textTertiary,
        ),
      );
    }

    return GestureDetector(
      onTap: () => _openFullscreen(context),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Hero(
          tag: heroTag,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              maxWidth: 240,
              maxHeight: 280,
              minWidth: 120,
              minHeight: 80,
            ),
            child: Image.network(
              imageUrl,
              fit: BoxFit.cover,
              loadingBuilder: (context, child, progress) {
                if (progress == null) return child;
                return Container(
                  width: 200,
                  height: 150,
                  alignment: Alignment.center,
                  color: AppColors.surfaceMedium,
                  child: const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.terracotta,
                    ),
                  ),
                );
              },
              errorBuilder: (_, __, ___) => Container(
                width: 200,
                height: 150,
                alignment: Alignment.center,
                color: AppColors.surfaceMedium,
                child: const Icon(
                  Icons.broken_image_outlined,
                  color: AppColors.textTertiary,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _openFullscreen(BuildContext context) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierColor: Colors.black,
        pageBuilder: (_, __, ___) => _FullscreenImage(
          imageUrl: imageUrl,
          heroTag: heroTag,
        ),
      ),
    );
  }
}

/// Полноэкранный просмотр картинки с зумом (pinch) и закрытием по тапу/свайпу.
class _FullscreenImage extends StatelessWidget {
  const _FullscreenImage({required this.imageUrl, required this.heroTag});
  final String imageUrl;
  final String heroTag;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: Center(
              child: Hero(
                tag: heroTag,
                child: InteractiveViewer(
                  minScale: 1,
                  maxScale: 4,
                  child: Image.network(
                    imageUrl,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(
                      Icons.broken_image_outlined,
                      color: Colors.white54,
                      size: 48,
                    ),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 8,
            child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 28),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
        ],
      ),
    );
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
