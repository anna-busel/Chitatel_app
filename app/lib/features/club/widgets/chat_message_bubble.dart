import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/chat_message.dart';

/// 6 разрешённых реакций. Должен совпадать с ALLOWED_REACTIONS
/// в server/src/models/ChatMessage.js (белый список v5).
const List<String> kAllowedReactions = ['❤️', '👍', '🔥', '👏', '🥲', '🙏'];

/// Bubble одного сообщения в чате.
///
/// Логика стиля:
/// - Своё сообщение — справа, terracotta фон, белый текст, без аватара
/// - Чужое — слева, белый фон, тёмный текст, с круглым аватаром-инициалом
/// - Удалённое (deletedAt != null) — серый курсив «Сообщение удалено»
/// - Reply preview — компактная полоска (1 строка) сверху bubble с цитатой
///   родителя. Берётся из message.replySnapshot (приходит с сервера populated,
///   самодостаточно — НЕ ищем родителя в загруженном списке). Тап по превью →
///   onReplyTap (переход к оригиналу в chat_tab, с догрузкой контекста).
/// - Edited badge — «изменено» после времени
/// - Реакции — ряд чипов под bubble (эмодзи + счётчик, свои подсвечены)
/// - isHighlighted — временная подсветка (после перехода к закрепу/reply),
///   снимается таймером в chat_tab. Жёлтая обводка поверх обычного bubble.
///
/// Картинки (4.6, как в Telegram):
/// - БЕЗ подписи → bubble = сама картинка, без цветного фона и padding,
///   скруглена. Никакой «оранжевой рамки».
/// - С подписью → картинка сверху во всю ширину bubble (скруглены верхние
///   углы, без padding), подпись снизу на цветном фоне с padding.
/// Время/edited/pin для картинок — поверх картинки на полупрозрачной подложке
/// (если нет подписи) либо в строке подписи (если есть).
///
/// Long-press на bubble → меню (как в Telegram, единое для всех действий):
/// - ряд 6 эмодзи-реакций
/// - «Ответить» (всем)
/// - «Изменить» (своим, не voice)
/// - «Удалить» (своим)
/// - «Пожаловаться» (чужим)
class ChatMessageBubble extends StatelessWidget {
  const ChatMessageBubble({
    super.key,
    required this.message,
    required this.currentUserId,
    this.isHighlighted = false,
    this.onReactionTap,
    this.onReport,
    this.onReply,
    this.onEdit,
    this.onDelete,
    this.onReplyTap,
  });

  final ChatMessage message;
  final String? currentUserId;

  /// Временная подсветка после перехода к этому сообщению (закреп/reply).
  /// Управляется таймером в chat_tab (выставляется на ~1.8 сек).
  final bool isHighlighted;

  /// Тап по эмодзи (тап по чипу реакции или выбор в меню).
  final void Function(String emoji)? onReactionTap;

  /// «Пожаловаться» в меню (только для чужих).
  final VoidCallback? onReport;

  /// «Ответить» в меню (для всех сообщений).
  final VoidCallback? onReply;

  /// «Изменить» в меню (только для своих text/image).
  final VoidCallback? onEdit;

  /// «Удалить» в меню (только для своих).
  final VoidCallback? onDelete;

  /// Тап по reply-превью → переход к оригинальному сообщению.
  final VoidCallback? onReplyTap;

  @override
  Widget build(BuildContext context) {
    if (message.isDeleted) {
      return _DeletedBubble(isMine: message.isMine(currentUserId));
    }

    final isMine = message.isMine(currentUserId);
    final isImage = message.type == ChatMessageType.image;
    final hasCaption = message.text.isNotEmpty;

    // Картинка без подписи — особый случай: bubble это сама картинка,
    // без цветного фона и без padding (стандарт всех мессенджеров).
    final bareImage = isImage && !hasCaption;

    final bubbleColor =
        isMine ? AppColors.terracotta : AppColors.cardBackground;
    final textColor = isMine ? Colors.white : AppColors.textPrimary;
    final metaColor = isMine ? Colors.white70 : AppColors.textTertiary;

    final snapshot = message.replySnapshot;

    final borderRadius = BorderRadius.only(
      topLeft: const Radius.circular(16),
      topRight: const Radius.circular(16),
      bottomLeft: Radius.circular(isMine ? 16 : 4),
      bottomRight: Radius.circular(isMine ? 4 : 16),
    );

    // — Внутренность bubble —
    Widget inner;
    if (bareImage) {
      // Только картинка: никакого Container с цветом/padding.
      // Время — поверх картинки справа снизу на полупрозрачной подложке.
      inner = Stack(
        children: [
          _ChatImage(
            imageUrl: message.imageUrl ?? '',
            heroTag: 'chat-img-${message.id}',
            borderRadius: borderRadius,
            fullWidth: false,
          ),
          Positioned(
            right: 8,
            bottom: 8,
            child: _TimeOverlay(
              message: message,
            ),
          ),
          if (!isMine)
            Positioned(
              left: 10,
              top: 8,
              child: _NameOverlay(name: message.author.name),
            ),
        ],
      );
    } else if (isImage && hasCaption) {
      // Картинка сверху во всю ширину bubble (без padding, скруглены верхние
      // углы), подпись снизу на цветном фоне с padding.
      inner = Container(
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: borderRadius,
          boxShadow: isMine ? null : AppColors.cardShadow,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!isMine)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: Text(
                  message.author.name,
                  style: AppTypography.smallMedium.copyWith(
                    color: AppColors.terracotta,
                  ),
                ),
              ),
            if (snapshot != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
                child: _ReplyPreview(
                  snapshot: snapshot,
                  isMine: isMine,
                  onTap: onReplyTap,
                ),
              ),
            Padding(
              padding: EdgeInsets.only(top: (!isMine || snapshot != null) ? 6 : 0),
              child: _ChatImage(
                imageUrl: message.imageUrl ?? '',
                heroTag: 'chat-img-${message.id}',
                // Картинка занимает всю ширину bubble; верхние углы скруглять
                // не нужно (она внутри clip'а), низ упирается в подпись.
                borderRadius: BorderRadius.zero,
                fullWidth: true,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    message.text,
                    style: AppTypography.body.copyWith(color: textColor),
                  ),
                  const SizedBox(height: 4),
                  _MetaRow(message: message, metaColor: metaColor),
                ],
              ),
            ),
          ],
        ),
      );
    } else {
      // Текст / voice / unknown — обычный bubble с padding и цветом.
      inner = Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: borderRadius,
          boxShadow: isMine ? null : AppColors.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isMine) ...[
              Text(
                message.author.name,
                style: AppTypography.smallMedium.copyWith(
                  color: AppColors.terracotta,
                ),
              ),
              const SizedBox(height: 4),
            ],
            if (snapshot != null) ...[
              _ReplyPreview(
                snapshot: snapshot,
                isMine: isMine,
                onTap: onReplyTap,
              ),
              const SizedBox(height: 6),
            ],
            _MessageContent(message: message, textColor: textColor),
            const SizedBox(height: 4),
            _MetaRow(message: message, metaColor: metaColor),
          ],
        ),
      );
    }

    // Подсветка перехода: жёлтая обводка вокруг bubble, плавно появляется.
    final bubble = ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.of(context).size.width * 0.72,
      ),
      child: GestureDetector(
        onLongPress: () => _showActionMenu(context, isMine),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          decoration: BoxDecoration(
            borderRadius: borderRadius,
            border: Border.all(
              color: isHighlighted
                  ? AppColors.terracotta
                  : Colors.transparent,
              width: 2.5,
            ),
            color: isHighlighted
                ? AppColors.terracotta.withOpacity(0.10)
                : Colors.transparent,
          ),
          child: inner,
        ),
      ),
    );

    final reactionsRow = message.hasReactions
        ? Padding(
            padding: EdgeInsets.only(
              top: 4,
              left: isMine ? 0 : 40,
            ),
            child: _ReactionsRow(
              reactions: message.reactions,
              currentUserId: currentUserId,
              onTap: onReactionTap,
            ),
          )
        : const SizedBox.shrink();

    if (isMine) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [bubble],
            ),
            reactionsRow,
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
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
          reactionsRow,
        ],
      ),
    );
  }

  /// Long-press меню: реакции (6 эмодзи) + Ответить + (свои: Изменить/Удалить)
  /// + (чужие: Пожаловаться). Единое меню как в Telegram.
  void _showActionMenu(BuildContext context, bool isMine) {
    final canEdit = isMine &&
        onEdit != null &&
        message.type != ChatMessageType.voice;

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.cardBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: kAllowedReactions.map((emoji) {
                  final mine = message.reactions.any((r) =>
                      r.emoji == emoji &&
                      currentUserId != null &&
                      r.containsUser(currentUserId!));
                  return GestureDetector(
                    onTap: () {
                      Navigator.of(ctx).pop();
                      onReactionTap?.call(emoji);
                    },
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: mine
                            ? AppColors.terracotta.withOpacity(0.15)
                            : Colors.transparent,
                        shape: BoxShape.circle,
                      ),
                      child: Text(emoji, style: const TextStyle(fontSize: 28)),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 8),
            const Divider(height: 1),
            if (onReply != null)
              ListTile(
                leading: const Icon(Icons.reply,
                    color: AppColors.textSecondary),
                title: Text('Ответить', style: AppTypography.body),
                onTap: () {
                  Navigator.of(ctx).pop();
                  onReply?.call();
                },
              ),
            if (canEdit)
              ListTile(
                leading: const Icon(Icons.edit_outlined,
                    color: AppColors.textSecondary),
                title: Text('Изменить', style: AppTypography.body),
                onTap: () {
                  Navigator.of(ctx).pop();
                  onEdit?.call();
                },
              ),
            if (isMine && onDelete != null)
              ListTile(
                leading: const Icon(Icons.delete_outline,
                    color: AppColors.error),
                title: Text(
                  'Удалить',
                  style: AppTypography.body.copyWith(color: AppColors.error),
                ),
                onTap: () {
                  Navigator.of(ctx).pop();
                  onDelete?.call();
                },
              ),
            if (!isMine && onReport != null)
              ListTile(
                leading: const Icon(Icons.flag_outlined,
                    color: AppColors.error),
                title: Text(
                  'Пожаловаться',
                  style: AppTypography.body.copyWith(color: AppColors.error),
                ),
                onTap: () {
                  Navigator.of(ctx).pop();
                  onReport?.call();
                },
              ),
            ListTile(
              leading: const Icon(Icons.close, color: AppColors.textTertiary),
              title: Text('Отмена', style: AppTypography.body),
              onTap: () => Navigator.of(ctx).pop(),
            ),
          ],
        ),
      ),
    );
  }
}

/// Строка времени + «изменено» + pin (под текстом).
class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.message, required this.metaColor});
  final ChatMessage message;
  final Color metaColor;

  @override
  Widget build(BuildContext context) {
    return Row(
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
    );
  }
}

/// Время поверх картинки без подписи — на полупрозрачной тёмной подложке
/// (читается на любом фоне, как в Telegram).
class _TimeOverlay extends StatelessWidget {
  const _TimeOverlay({required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.45),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (message.isPinned) ...[
            const Icon(Icons.push_pin, size: 10, color: Colors.white),
            const SizedBox(width: 4),
          ],
          if (message.isEdited) ...[
            Text(
              'изменено',
              style: AppTypography.micro.copyWith(color: Colors.white),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            _formatTime(message.createdAt),
            style: AppTypography.micro.copyWith(color: Colors.white),
          ),
        ],
      ),
    );
  }
}

/// Имя автора поверх картинки без подписи (чужие сообщения).
class _NameOverlay extends StatelessWidget {
  const _NameOverlay({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.45),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        name,
        style: AppTypography.micro.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

String _formatTime(DateTime dt) {
  final local = dt.toLocal();
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return '$hh:$mm';
}

/// Ряд чипов реакций под bubble. Каждый чип: эмодзи + счётчик.
/// Свои реакции (где есть currentUserId) подсвечены terracotta-обводкой.
/// Тап по чипу — toggle этой реакции.
class _ReactionsRow extends StatelessWidget {
  const _ReactionsRow({
    required this.reactions,
    required this.currentUserId,
    required this.onTap,
  });

  final List<MessageReaction> reactions;
  final String? currentUserId;
  final void Function(String emoji)? onTap;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: reactions.where((r) => r.count > 0).map((r) {
        final mine = currentUserId != null && r.containsUser(currentUserId!);
        return GestureDetector(
          onTap: () => onTap?.call(r.emoji),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: mine
                  ? AppColors.terracotta.withOpacity(0.12)
                  : AppColors.surfaceLight,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: mine ? AppColors.terracotta : AppColors.border,
                width: mine ? 1.2 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(r.emoji, style: const TextStyle(fontSize: 14)),
                const SizedBox(width: 4),
                Text(
                  '${r.count}',
                  style: AppTypography.micro.copyWith(
                    color: mine
                        ? AppColors.terracotta
                        : AppColors.textSecondary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

/// Круглый аватар. Если `avatarUrl` есть — пытаемся загрузить картинку.
/// При ошибке загрузки или если url пустой — fallback: цветной круг с инициалом.
class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.avatarUrl});
  final String name;
  final String? avatarUrl;

  static const double _size = 32;

  static const List<Color> _palette = [
    Color(0xFFC73E28),
    Color(0xFFE8734A),
    Color(0xFF7B61FF),
    Color(0xFF2D9F6E),
    Color(0xFFD9A33A),
    Color(0xFF3A2018),
  ];

  Color _colorForName(String n) {
    if (n.isEmpty) return _palette[0];
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

/// Содержимое: текст, заглушка voice. (Картинка рендерится в build напрямую
/// — особый layout, см. ChatMessageBubble.build.)
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
        // Картинка обрабатывается в ChatMessageBubble.build (особый layout).
        // Сюда попасть не должно, но на всякий случай — текст подписи.
        return Text(
          message.text,
          style: AppTypography.body.copyWith(color: textColor),
        );

      case ChatMessageType.voice:
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

/// Картинка в bubble. Тап открывает полноэкранный просмотр (зум).
///
/// fullWidth=true — картинка тянется на всю ширину bubble (режим «с подписью»).
/// fullWidth=false — ограничена констрейнтами (режим «без подписи»),
/// скруглена по [borderRadius] (= радиус bubble).
class _ChatImage extends StatelessWidget {
  const _ChatImage({
    required this.imageUrl,
    required this.heroTag,
    required this.borderRadius,
    required this.fullWidth,
  });
  final String imageUrl;
  final String heroTag;
  final BorderRadius borderRadius;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    if (imageUrl.isEmpty) {
      return ClipRRect(
        borderRadius: borderRadius,
        child: Container(
          width: 220,
          height: 160,
          alignment: Alignment.center,
          color: AppColors.surfaceMedium,
          child: const Icon(
            Icons.broken_image_outlined,
            color: AppColors.textTertiary,
          ),
        ),
      );
    }

    final img = Image.network(
      imageUrl,
      fit: BoxFit.cover,
      loadingBuilder: (context, child, progress) {
        if (progress == null) return child;
        return Container(
          width: 220,
          height: 160,
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
        width: 220,
        height: 160,
        alignment: Alignment.center,
        color: AppColors.surfaceMedium,
        child: const Icon(
          Icons.broken_image_outlined,
          color: AppColors.textTertiary,
        ),
      ),
    );

    return GestureDetector(
      onTap: () => _openFullscreen(context),
      child: ClipRRect(
        borderRadius: borderRadius,
        child: Hero(
          tag: heroTag,
          child: fullWidth
              ? SizedBox(
                  width: double.infinity,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 320),
                    child: img,
                  ),
                )
              : ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: 260,
                    maxHeight: 320,
                    minWidth: 140,
                    minHeight: 90,
                  ),
                  child: img,
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
///
/// Берёт данные из ReplySnapshot (приходит с сервера populated — автор,
/// тип, текст). Компактное: ОДНА строка (как в Telegram, не разворачивается).
/// Тап → onTap (переход к оригиналу в chat_tab).
class _ReplyPreview extends StatelessWidget {
  const _ReplyPreview({
    required this.snapshot,
    required this.isMine,
    this.onTap,
  });
  final ReplySnapshot snapshot;
  final bool isMine;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final accent = isMine ? Colors.white : AppColors.terracotta;
    final textColor = isMine ? Colors.white70 : AppColors.textSecondary;

    String preview;
    if (snapshot.isDeleted) {
      preview = 'Сообщение удалено';
    } else if (snapshot.type == ChatMessageType.image) {
      preview = '🖼 Картинка';
    } else if (snapshot.type == ChatMessageType.voice) {
      preview = '🎤 Голосовое сообщение';
    } else {
      preview = snapshot.text;
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
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
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              snapshot.authorName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.micro.copyWith(
                color: accent,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              preview,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.small.copyWith(color: textColor),
            ),
          ],
        ),
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
