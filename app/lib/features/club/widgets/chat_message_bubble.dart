import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/chat_message.dart';
import 'voice_player.dart';

/// 6 разрешённых реакций. Должен совпадать с ALLOWED_REACTIONS
/// в server/src/models/ChatMessage.js (белый список v5).
const List<String> kAllowedReactions = ['❤️', '👍', '🔥', '👏', '🥲', '🙏'];

/// Построить Text с подсветкой @упоминаний (4.9). Слова вида @Имя
/// красятся terracotta + жирным (на тёмном фоне своего сообщения —
/// белым жирным, чтобы читалось). Остальной текст — обычный.
///
/// Эвристика: @ + последовательность букв/цифр/пробел-имя до знака
/// препинания/конца. Имя может содержать пробел («@Анна Бусел»), поэтому
/// захватываем буквы и одиночные пробелы между словами с заглавной — но
/// проще и надёжно: подсвечиваем @ + одно-два слова (буквы, до 30 симв).
Widget buildMentionText(
  String text, {
  required Color baseColor,
  required bool isMine,
}) {
  final mentionStyle = AppTypography.body.copyWith(
    color: isMine ? Colors.white : AppColors.terracotta,
    fontWeight: FontWeight.w700,
  );
  final baseStyle = AppTypography.body.copyWith(color: baseColor);

  // @ + буквы/цифры/_ + опц. один пробел + ещё буквы (для «@Имя Фамилия»).
  final re = RegExp(
    r'@[A-Za-zА-Яа-яЁё0-9_]+(?:\s[A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9_]+)?',
  );

  final spans = <InlineSpan>[];
  int last = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > last) {
      spans.add(TextSpan(text: text.substring(last, m.start), style: baseStyle));
    }
    spans.add(TextSpan(text: m.group(0), style: mentionStyle));
    last = m.end;
  }
  if (last < text.length) {
    spans.add(TextSpan(text: text.substring(last), style: baseStyle));
  }
  if (spans.isEmpty) {
    return Text(text, style: baseStyle);
  }
  return RichText(text: TextSpan(children: spans));
}

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
/// - @упоминания в тексте — подсвечены (buildMentionText), 4.9
/// - Голосовое (type=voice) — VoicePlayer (play/pause + waveform), 4.12
/// - Реакции — ряд чипов под bubble (эмодзи + счётчик, свои подсвечены)
/// - isHighlighted — временная подсветка (после перехода к закрепу/reply),
///   снимается таймером в chat_tab. Жёлтая обводка поверх обычного bubble.
///
/// Скругления пузырей — 18px (редизайн чата 28.06, мягче) с асимметричным
/// «хвостиком»: свой пузырь острый снизу-справа (4px), чужой — снизу-слева,
/// чтобы визуально «указывал» на отправителя (как в Telegram/iMessage).
///
/// Картинки (4.6, как в Telegram):
/// - БЕЗ подписи → bubble = сама картинка, без цветного фона и padding,
///   скруглена. Никакой «оранжевой рамки».
/// - С подписью → картинка сверху во всю ширину bubble (скруглены верхние
///   углы, без padding), подпись снизу на цветном фоне с padding.
/// Время/edited/pin для картинок — поверх картинки на полупрозрачной подложке
/// (если нет подписи) либо в строке подписи (если есть).
/// Картинки кэшируются на диск (CachedNetworkImage) — после первого показа
/// берутся локально, мгновенно, без сети (как в Telegram). signed URL картинок
/// фиксированный (стабильный), поэтому кэш по URL работает между заходами.
///
/// Long-press на bubble → контекстное меню (как в Telegram): всплывает по
/// центру с анимацией увеличения (showGeneralDialog + ScaleTransition), а не
/// выезжает снизу. Ряд 6 эмодзи-реакций сверху, ниже действия:
/// - «Ответить» (всем)
/// - «Изменить» (своим, не voice)
/// - «Удалить» (своим)
/// - «Закрепить»/«Открепить» (только админ — Анна, 4.10)
/// - «Пожаловаться» (чужим)
///
/// Клавиатура (как в Telegram): при долгом тапе клавиатура закрывается ДО
/// показа меню (иначе при последующем диалоге «Удалить?» клавиатура дёргано
/// анимируется на фоне). Если действие — «Ответить», после закрытия меню
/// фокус возвращается в поле ввода (продолжаешь печатать ответ).
class ChatMessageBubble extends StatelessWidget {
  const ChatMessageBubble({
    super.key,
    required this.message,
    required this.currentUserId,
    this.isHighlighted = false,
    this.isAdmin = false,
    this.authorIsAdmin = false,
    this.onReactionTap,
    this.onReport,
    this.onReply,
    this.onEdit,
    this.onDelete,
    this.onReplyTap,
    this.onPinToggle,
  });

  final ChatMessage message;
  final String? currentUserId;

  /// Временная подсветка после перехода к этому сообщению (закреп/reply).
  /// Управляется таймером в chat_tab (выставляется на ~1.8 сек).
  final bool isHighlighted;

  /// Текущий юзер — админ (Анна). Только тогда в меню есть «Закрепить» (4.10).
  final bool isAdmin;

  /// Автор ЭТОГО сообщения — админ (Анна). Тогда у чужого сообщения рисуем
  /// бейдж «АВТОР КЛУБА» рядом с именем и терракотовую полоску слева (редизайн
  /// чата 28.06). Вычисляется в chat_tab по списку админов (_adminIds).
  final bool authorIsAdmin;

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

  /// Закрепить/открепить (4.10). Передаётся только для админа. Аргумент —
  /// новое состояние (true = закрепить, false = открепить).
  final void Function(bool pin)? onPinToggle;

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

    // Скругления 18px (мягче прежних 16) с асимметричным хвостиком:
    // свой — острый снизу-справа, чужой — снизу-слева.
    final borderRadius = BorderRadius.only(
      topLeft: const Radius.circular(18),
      topRight: const Radius.circular(18),
      bottomLeft: Radius.circular(isMine ? 18 : 4),
      bottomRight: Radius.circular(isMine ? 4 : 18),
    );

    // Бейдж «АВТОР КЛУБА» + полоска слева — только у чужих сообщений Анны
    // (автор-админ). У своих и у обычных участниц не показываем.
    final showAuthorBadge = authorIsAdmin && !isMine;
    final adminBorder = showAuthorBadge
        ? const Border(
            left: BorderSide(color: AppColors.terracotta, width: 2.5),
          )
        : null;

    // — Внутренность bubble —
    Widget inner;
    if (bareImage) {
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
            child: _TimeOverlay(message: message),
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
      inner = Container(
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: borderRadius,
          boxShadow: isMine ? null : AppColors.cardShadow,
          border: adminBorder,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!isMine)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text(
                        message.author.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.smallMedium.copyWith(
                          color: AppColors.terracotta,
                        ),
                      ),
                    ),
                    if (showAuthorBadge) ...[
                      const SizedBox(width: 6),
                      const _AuthorBadge(),
                    ],
                  ],
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
                  buildMentionText(
                    message.text,
                    baseColor: textColor,
                    isMine: isMine,
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
      inner = Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: borderRadius,
          boxShadow: isMine ? null : AppColors.cardShadow,
          border: adminBorder,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isMine) ...[
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: Text(
                      message.author.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.smallMedium.copyWith(
                        color: AppColors.terracotta,
                      ),
                    ),
                  ),
                  if (showAuthorBadge) ...[
                    const SizedBox(width: 6),
                    const _AuthorBadge(),
                  ],
                ],
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
            _MessageContent(
              message: message,
              textColor: textColor,
              isMine: isMine,
            ),
            const SizedBox(height: 4),
            _MetaRow(message: message, metaColor: metaColor),
          ],
        ),
      );
    }

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

  /// Long-press меню в стиле Telegram: всплывает по центру с анимацией
  /// увеличения (scale + fade), фон затемняется. Ряд из 6 эмодзи-реакций
  /// сверху (крупные), ниже — действия.
  ///
  /// Клавиатура: если она была открыта — закрываем ДО показа меню (иначе при
  /// последующем диалоге «Удалить?» клавиатура дёргано анимируется на фоне).
  /// Запоминаем факт «была открыта» в wasKeyboardOpen. После закрытия меню,
  /// если выбрано «Ответить» (replyChosen) и клавиатура была открыта —
  /// возвращаем фокус в поле ввода (продолжаешь печатать ответ, как в Telegram).
  Future<void> _showActionMenu(BuildContext context, bool isMine) async {
    final canEdit = isMine &&
        onEdit != null &&
        message.type != ChatMessageType.voice;

    // Была ли открыта клавиатура (есть активный фокус с виртуальной клавой).
    final wasKeyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;
    final primaryFocus = FocusManager.instance.primaryFocus;

    // Закрываем клавиатуру до показа меню — убирает дёрганье на фоне диалогов.
    if (wasKeyboardOpen) {
      FocusManager.instance.primaryFocus?.unfocus();
      // Ждём, пока клавиатура уедет, чтобы меню всплывало на спокойном фоне.
      await Future<void>.delayed(const Duration(milliseconds: 150));
    }
    if (!context.mounted) return;

    // Флаг: выбрали «Ответить» — тогда после меню вернём фокус (клавиатуру).
    var replyChosen = false;

    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Меню сообщения',
      barrierColor: Colors.black.withOpacity(0.45),
      transitionDuration: const Duration(milliseconds: 180),
      pageBuilder: (ctx, _, __) {
        return _ActionMenuContent(
          message: message,
          currentUserId: currentUserId,
          isMine: isMine,
          isAdmin: isAdmin,
          canEdit: canEdit,
          onReactionTap: onReactionTap,
          onReply: () {
            replyChosen = true;
            onReply?.call();
          },
          onEdit: onEdit,
          onDelete: onDelete,
          onReport: onReport,
          onPinToggle: onPinToggle,
        );
      },
      transitionBuilder: (ctx, anim, _, child) {
        final curved =
            CurvedAnimation(parent: anim, curve: Curves.easeOutBack);
        return FadeTransition(
          opacity: anim,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.85, end: 1.0).animate(curved),
            child: child,
          ),
        );
      },
    );

    // После закрытия меню: если выбрали «Ответить» и клавиатура была открыта —
    // возвращаем фокус (клавиатура снова появляется, продолжаешь печатать).
    if (replyChosen && wasKeyboardOpen && primaryFocus != null) {
      primaryFocus.requestFocus();
    }
  }
}

/// Содержимое контекстного меню (выносим отдельно — чтобы анимация scale/fade
/// применялась ко всей карточке). Ряд эмодзи + список действий.
class _ActionMenuContent extends StatelessWidget {
  const _ActionMenuContent({
    required this.message,
    required this.currentUserId,
    required this.isMine,
    required this.isAdmin,
    required this.canEdit,
    this.onReactionTap,
    this.onReply,
    this.onEdit,
    this.onDelete,
    this.onReport,
    this.onPinToggle,
  });

  final ChatMessage message;
  final String? currentUserId;
  final bool isMine;
  final bool isAdmin;
  final bool canEdit;
  final void Function(String emoji)? onReactionTap;
  final VoidCallback? onReply;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onReport;
  final void Function(bool pin)? onPinToggle;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Material(
          color: Colors.transparent,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // — Ряд эмодзи-реакций (крупные) — отдельная «пилюля» сверху.
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.cardBackground,
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: AppColors.cardShadow,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: kAllowedReactions.map((emoji) {
                    final mine = message.reactions.any((r) =>
                        r.emoji == emoji &&
                        currentUserId != null &&
                        r.containsUser(currentUserId!));
                    return GestureDetector(
                      onTap: () {
                        Navigator.of(context).pop();
                        onReactionTap?.call(emoji);
                      },
                      child: Container(
                        margin:
                            const EdgeInsets.symmetric(horizontal: 2),
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: mine
                              ? AppColors.terracotta.withOpacity(0.15)
                              : Colors.transparent,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          emoji,
                          style: const TextStyle(fontSize: 30),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 10),
              // — Карточка действий —
              Container(
                width: 240,
                decoration: BoxDecoration(
                  color: AppColors.cardBackground,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: AppColors.cardShadow,
                ),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (onReply != null)
                      _ActionTile(
                        icon: Icons.reply,
                        label: 'Ответить',
                        onTap: () {
                          Navigator.of(context).pop();
                          onReply?.call();
                        },
                      ),
                    if (isAdmin && onPinToggle != null)
                      _ActionTile(
                        icon: message.isPinned
                            ? Icons.push_pin_outlined
                            : Icons.push_pin,
                        label: message.isPinned ? 'Открепить' : 'Закрепить',
                        iconColor: AppColors.terracotta,
                        onTap: () {
                          Navigator.of(context).pop();
                          onPinToggle?.call(!message.isPinned);
                        },
                      ),
                    if (canEdit)
                      _ActionTile(
                        icon: Icons.edit_outlined,
                        label: 'Изменить',
                        onTap: () {
                          Navigator.of(context).pop();
                          onEdit?.call();
                        },
                      ),
                    if (isMine && onDelete != null)
                      _ActionTile(
                        icon: Icons.delete_outline,
                        label: 'Удалить',
                        iconColor: AppColors.error,
                        labelColor: AppColors.error,
                        onTap: () {
                          Navigator.of(context).pop();
                          onDelete?.call();
                        },
                      ),
                    if (!isMine && onReport != null)
                      _ActionTile(
                        icon: Icons.flag_outlined,
                        label: 'Пожаловаться',
                        iconColor: AppColors.error,
                        labelColor: AppColors.error,
                        onTap: () {
                          Navigator.of(context).pop();
                          onReport?.call();
                        },
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Строка действия в контекстном меню (иконка + подпись).
class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.iconColor,
    this.labelColor,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? iconColor;
  final Color? labelColor;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        child: Row(
          children: [
            Icon(icon, size: 21, color: iconColor ?? AppColors.textSecondary),
            const SizedBox(width: 14),
            Text(
              label,
              style: AppTypography.body.copyWith(color: labelColor),
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
/// Тап по чипу — toggle этой реакции. Эмодзи крупные (как в Telegram).
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
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: mine
                  ? AppColors.terracotta.withOpacity(0.12)
                  : AppColors.surfaceLight,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: mine ? AppColors.terracotta : AppColors.border,
                width: mine ? 1.4 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(r.emoji, style: const TextStyle(fontSize: 16)),
                const SizedBox(width: 5),
                Text(
                  '${r.count}',
                  style: AppTypography.small.copyWith(
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
      child: CachedNetworkImage(
        imageUrl: avatarUrl!,
        width: _size,
        height: _size,
        fit: BoxFit.cover,
        errorWidget: (_, __, ___) => fallback,
      ),
    );
  }
}

/// Содержимое: текст (с подсветкой @упоминаний), голосовое (VoicePlayer).
/// Картинка рендерится в build напрямую (особый layout).
class _MessageContent extends StatelessWidget {
  const _MessageContent({
    required this.message,
    required this.textColor,
    required this.isMine,
  });
  final ChatMessage message;
  final Color textColor;
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    switch (message.type) {
      case ChatMessageType.text:
      case ChatMessageType.unknown:
        return buildMentionText(
          message.text,
          baseColor: textColor,
          isMine: isMine,
        );

      case ChatMessageType.image:
        return buildMentionText(
          message.text,
          baseColor: textColor,
          isMine: isMine,
        );

      case ChatMessageType.voice:
        // 4.12 — реальный плеер голосового (play/pause + waveform).
        return VoicePlayer(
          url: message.voiceUrl ?? '',
          durationSec: message.voiceDurationSec ?? 0,
          waveform: message.voiceWaveform,
          isMine: isMine,
        );
    }
  }
}

/// Картинка в bubble. Тап открывает полноэкранный просмотр (зум).
///
/// fullWidth=true — картинка тянется на всю ширину bubble (режим «с подписью»).
/// fullWidth=false — ограничена констрейнтами (режим «без подписи»),
/// скруглена по [borderRadius] (= радиус bubble).
///
/// Кэшируется на диск (CachedNetworkImage): после первого скачивания картинка
/// берётся локально, мгновенно, без сети — даже после перезахода в приложение
/// (как в Telegram). Работает благодаря фиксированному (стабильному) signed URL
/// картинок: URL один и тот же → кэш по нему попадает.
///
/// Скачок размера (placeholder → картинка) убран: загрузка показывается через
/// progressIndicatorBuilder ПОВЕРХ области картинки в тех же констрейнтах, а не
/// отдельным контейнером другого размера. Поэтому блок сразу занимает место и
/// не «прыгает» с маленького окна на большое.
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

    final img = CachedNetworkImage(
      imageUrl: imageUrl,
      fit: BoxFit.cover,
      // fadeIn — плавное появление картинки (мягче, чем резкое возникновение).
      fadeInDuration: const Duration(milliseconds: 200),
      // progressIndicatorBuilder вместо placeholder: индикатор рисуется ПОВЕРХ
      // области картинки в её констрейнтах (не отдельным контейнером другого
      // размера), поэтому нет скачка «маленькое окно → большое». На время
      // загрузки место занимает нейтральный фон с маленьким спиннером по центру.
      progressIndicatorBuilder: (context, url, progress) => Container(
        color: AppColors.surfaceMedium,
        alignment: Alignment.center,
        child: const SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.terracotta,
          ),
        ),
      ),
      errorWidget: (_, __, ___) => Container(
        color: AppColors.surfaceMedium,
        alignment: Alignment.center,
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
                    constraints: const BoxConstraints(
                      maxHeight: 320,
                      minHeight: 160,
                    ),
                    child: img,
                  ),
                )
              : ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: 260,
                    maxHeight: 320,
                    minWidth: 200,
                    minHeight: 150,
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
                  child: CachedNetworkImage(
                    imageUrl: imageUrl,
                    fit: BoxFit.contain,
                    errorWidget: (_, __, ___) => const Icon(
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

/// Бейдж «АВТОР КЛУБА» рядом с именем Анны (автор-админ) в чужом сообщении.
/// Терракотовый текст на бледно-терракотовой подложке — выделяет ведущую
/// клуба, не перетягивая внимание (редизайн чата 28.06).
class _AuthorBadge extends StatelessWidget {
  const _AuthorBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: AppColors.terracotta.withOpacity(0.10),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        'АВТОР КЛУБА',
        style: AppTypography.micro.copyWith(
          color: AppColors.terracotta,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
          fontSize: 9,
        ),
      ),
    );
  }
}
