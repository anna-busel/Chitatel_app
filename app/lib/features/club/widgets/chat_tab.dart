import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/error_view.dart';
import '../models/chat_message.dart';
import '../models/club_access.dart';
import '../models/club_month.dart';
import '../services/club_api_service.dart';
import '../services/club_socket_service.dart';
import 'chat_message_bubble.dart';
import 'chat_input.dart';
import 'pinned_message_banner.dart';

/// Таб «Чат» клуба.
///
/// Navigation к закрепу/reply (как в Telegram): тап по баннеру закрепа или
/// reply-превью → _jumpToMessage. Если в окне — скролл+подсветка; если нет —
/// fetchChatContext, замена ленты, скролл+подсветка. Кнопка «вниз».
///
/// Real-time через Socket.io (singleton-провайдер; виджет не рвёт сокет в
/// dispose — урок #16).
///
/// 4.9 mentions: при @ в инпуте — автокомплит mentionable (Анна). Упомянутые
/// userId уходят на бэк, в bubble @имя подсвечено. 4.10 закреп: у админа в
/// меню «Закрепить»/«Открепить». 4.11 read: видимые сообщения батчем в markRead.
/// 4.12 voice: у Анны-admin кнопка записи в инпуте → _sendVoice.
class ChatTab extends ConsumerStatefulWidget {
  const ChatTab({super.key, required this.club, required this.access});
  final ClubMonth club;
  final ClubAccess access;

  @override
  ConsumerState<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends ConsumerState<ChatTab> {
  final List<ChatMessage> _messages = [];
  final Map<String, GlobalKey> _messageKeys = {};

  String? _currentUserId;
  String? _pinnedMessageId;
  ChatMessage? _replyingTo;

  /// Кого можно упомянуть через @ (4.9). Обычно одна Анна.
  List<MentionableUser> _mentionable = const [];

  /// Текущий юзер — админ (Анна). Тогда в меню есть «Закрепить» (4.10).
  /// Вычисляем: _currentUserId есть в списке mentionable (там только админы).
  bool _isAdmin = false;

  /// Уже отправленные в markRead id — чтобы не слать повторно (4.11).
  final Set<String> _readSent = {};
  Timer? _readDebounce;

  String? _highlightedMessageId;
  Timer? _highlightTimer;

  bool _isLoading = true;
  bool _hasError = false;

  bool _isLoadingMore = false;
  bool _hasMoreBefore = false;

  bool _hasMoreAfter = false;
  bool _isLoadingAfter = false;

  bool _showJumpDown = false;
  bool _isJumping = false;
  bool _isUploadingImage = false;

  /// Идёт отправка голосового (4.12) — показываем полоску, блокируем повтор.
  bool _isUploadingVoice = false;

  ClubSocketService? _socketService;
  final ImagePicker _imagePicker = ImagePicker();
  StreamSubscription<ClubSocketEvent>? _socketSub;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _pinnedMessageId = widget.club.pinnedMessageId;
    _scrollController.addListener(_onScroll);
    _bootstrap();
  }

  @override
  void dispose() {
    _highlightTimer?.cancel();
    _readDebounce?.cancel();
    // НЕ рвём сокет (singleton, управляется провайдером). Урок #16.
    _socketSub?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    try {
      final storage = ref.read(secureStorageProvider);
      _currentUserId = await storage.getUserId();

      final api = ref.read(clubApiServiceProvider);
      final history = await api.fetchChatHistory(
        clubMonthId: widget.club.id,
        limit: 20,
      );
      if (!mounted) return;

      // Список упоминаемых (Анна). Не критично — пустой при ошибке.
      final mentionable =
          await api.fetchMentionable(widget.club.id);

      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(history.messages);
        _hasMoreBefore = history.hasMore;
        _hasMoreAfter = false;
        _mentionable = mentionable;
        _isAdmin = _currentUserId != null &&
            mentionable.any((m) => m.id == _currentUserId && m.isAdmin);
        _isLoading = false;
      });

      _socketService = ref.read(clubSocketServiceProvider);
      _socketSub = _socketService!.events.listen(_onSocketEvent);
      await _socketService!.connect(widget.club.id);

      _scheduleMarkRead();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _hasError = true;
      });
    }
  }

  void _onSocketEvent(ClubSocketEvent event) {
    if (!mounted) return;

    if (event is ChatNewMessageEvent) {
      if (_messages.any((m) => m.id == event.message.id)) return;
      setState(() {
        _messages.insert(0, event.message);
      });
      _scheduleMarkRead();
    } else if (event is ChatMessageHiddenEvent) {
      setState(() {
        _messages.removeWhere((m) => m.id == event.messageId);
      });
    } else if (event is ChatPinChangedEvent) {
      setState(() => _pinnedMessageId = event.pinnedMessageId);
    } else if (event is ChatReactionUpdatedEvent) {
      final idx = _messages.indexWhere((m) => m.id == event.messageId);
      if (idx != -1) {
        setState(() {
          _messages[idx] =
              _messages[idx].copyWith(reactions: event.reactions);
        });
      }
    } else if (event is ChatMessageEditedEvent) {
      final idx = _messages.indexWhere((m) => m.id == event.message.id);
      if (idx != -1) {
        setState(() => _messages[idx] = event.message);
      }
    } else if (event is ChatMessageDeletedEvent) {
      final idx = _messages.indexWhere((m) => m.id == event.messageId);
      if (idx != -1) {
        setState(() {
          _messages[idx] =
              _messages[idx].copyWith(deletedAt: DateTime.now());
        });
      }
    }
  }

  /// 4.11: отметить видимые сообщения прочитанными (батч с дебаунсом).
  /// Шлём все ещё не отправленные id из текущей ленты — для книжного чата
  /// (не бесконечная лента) этого достаточно и проще, чем считать пиксели.
  void _scheduleMarkRead() {
    _readDebounce?.cancel();
    _readDebounce = Timer(const Duration(seconds: 2), () {
      final ids = _messages
          .map((m) => m.id)
          .where((id) => !_readSent.contains(id))
          .toList();
      if (ids.isEmpty) return;
      _readSent.addAll(ids);
      final api = ref.read(clubApiServiceProvider);
      api.markRead(clubMonthId: widget.club.id, messageIds: ids);
    });
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;

    final notAtBottom = pos.pixels > 300 || _hasMoreAfter;
    if (notAtBottom != _showJumpDown) {
      setState(() => _showJumpDown = notAtBottom);
    }

    if (!_isLoadingMore &&
        _hasMoreBefore &&
        pos.pixels >= pos.maxScrollExtent - 200) {
      _loadMoreBefore();
    }

    if (!_isLoadingAfter && _hasMoreAfter && pos.pixels <= 80) {
      _loadMoreAfter();
    }
  }

  Future<void> _loadMoreBefore() async {
    if (_messages.isEmpty) return;
    setState(() => _isLoadingMore = true);
    try {
      final api = ref.read(clubApiServiceProvider);
      final history = await api.fetchChatHistory(
        clubMonthId: widget.club.id,
        limit: 20,
        before: _messages.last.createdAt,
      );
      if (!mounted) return;
      setState(() {
        final existing = _messages.map((m) => m.id).toSet();
        _messages.addAll(
          history.messages.where((m) => !existing.contains(m.id)),
        );
        _hasMoreBefore = history.hasMore;
        _isLoadingMore = false;
      });
      _scheduleMarkRead();
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoadingMore = false);
    }
  }

  Future<void> _loadMoreAfter() async {
    setState(() => _isLoadingAfter = true);
    try {
      final api = ref.read(clubApiServiceProvider);
      final history = await api.fetchChatHistory(
        clubMonthId: widget.club.id,
        limit: 20,
      );
      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(history.messages);
        _hasMoreBefore = history.hasMore;
        _hasMoreAfter = false;
        _isLoadingAfter = false;
        _showJumpDown = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.jumpTo(0);
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoadingAfter = false);
    }
  }

  Future<void> _jumpToBottom() async {
    if (_hasMoreAfter) {
      await _loadMoreAfter();
      return;
    }
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOut,
      );
    }
  }

  void _scrollToPinned() => _jumpToMessage(_pinnedMessageId);

  Future<void> _jumpToMessage(String? id) async {
    if (id == null || id.isEmpty || _isJumping) return;

    final ctx = _messageKeys[id]?.currentContext;
    if (ctx != null) {
      await Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
        alignment: 0.3,
      );
      _highlight(id);
      return;
    }

    setState(() => _isJumping = true);
    try {
      final api = ref.read(clubApiServiceProvider);
      final ctxResult = await api.fetchChatContext(
        clubMonthId: widget.club.id,
        messageId: id,
        radius: 15,
      );
      if (!mounted) return;

      setState(() {
        _messages
          ..clear()
          ..addAll(ctxResult.messages);
        _hasMoreBefore = ctxResult.hasMoreBefore;
        _hasMoreAfter = ctxResult.hasMoreAfter;
        _isJumping = false;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        final c = _messageKeys[id]?.currentContext;
        if (c != null) {
          Scrollable.ensureVisible(
            c,
            duration: const Duration(milliseconds: 400),
            curve: Curves.easeInOut,
            alignment: 0.3,
          );
        }
        _highlight(id);
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _isJumping = false);
      final code = ClubApiService.errorCodeFromException(e);
      final msg = code == 'NOT_FOUND'
          ? 'Сообщение не найдено или удалено'
          : 'Не удалось перейти к сообщению';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    } catch (_) {
      if (!mounted) return;
      setState(() => _isJumping = false);
    }
  }

  void _highlight(String id) {
    _highlightTimer?.cancel();
    setState(() => _highlightedMessageId = id);
    _highlightTimer = Timer(const Duration(milliseconds: 1800), () {
      if (mounted) setState(() => _highlightedMessageId = null);
    });
  }

  void _startReply(ChatMessage m) {
    setState(() => _replyingTo = m);
  }

  void _cancelReply() {
    setState(() => _replyingTo = null);
  }

  String _replyPreviewText(ChatMessage m) {
    if (m.type == ChatMessageType.image) return '🖼 Картинка';
    if (m.type == ChatMessageType.voice) return '🎤 Голосовое сообщение';
    return m.text;
  }

  /// Отправка текста. mentions — userId упомянутых через @ (из chat_input).
  Future<void> _sendMessage(String text, List<String> mentions) async {
    if (text.trim().isEmpty) return;
    final replyId = _replyingTo?.id;
    try {
      final api = ref.read(clubApiServiceProvider);
      await api.sendTextMessage(
        clubMonthId: widget.club.id,
        text: text.trim(),
        replyToId: replyId,
        mentions: mentions,
      );
      if (mounted) _cancelReply();
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      String msg;
      if (code == 'LINK_NOT_ALLOWED') {
        msg = 'Ссылки в чате запрещены. Уберите ссылку из сообщения';
      } else if (code == 'CLUB_BLOCKED') {
        msg = 'Ваш аккаунт заблокирован';
      } else if (code == 'FORBIDDEN') {
        msg = 'В архиве нельзя отправлять сообщения';
      } else {
        msg = 'Не удалось отправить. Попробуйте ещё раз';
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    }
  }

  /// 4.12: отправка голосового (только Анна-admin — кнопка записи показана
  /// лишь ей). Параметры приходят из VoiceRecorder через ChatInput.onSendVoice.
  Future<void> _sendVoice(
    String filePath,
    int durationSec,
    List<int> waveform,
  ) async {
    if (_isUploadingVoice) return;
    setState(() => _isUploadingVoice = true);
    final replyId = _replyingTo?.id;
    try {
      final api = ref.read(clubApiServiceProvider);
      await api.sendVoiceMessage(
        clubMonthId: widget.club.id,
        filePath: filePath,
        durationSec: durationSec,
        waveform: waveform,
        replyToId: replyId,
      );
      if (mounted) _cancelReply();
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      String msg;
      if (code == 'VOICE_ADMIN_ONLY') {
        msg = 'Голосовые может отправлять только ведущая клуба';
      } else if (code == 'VALIDATION') {
        msg = 'Запись не прошла проверку. Попробуйте записать ещё раз';
      } else if (code == 'CLUB_BLOCKED') {
        msg = 'Ваш аккаунт заблокирован';
      } else if (code == 'FORBIDDEN') {
        msg = 'В архиве нельзя отправлять сообщения';
      } else {
        msg = 'Не удалось отправить голосовое. Попробуйте ещё раз';
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    } finally {
      if (mounted) setState(() => _isUploadingVoice = false);
    }
  }

  Future<void> _editMessage(ChatMessage m) async {
    final controller = TextEditingController(text: m.text);
    final newText = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.background,
        title: Text('Изменить сообщение', style: AppTypography.sectionHeader),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 1000,
          minLines: 1,
          maxLines: 6,
          style: AppTypography.body,
          decoration: InputDecoration(
            counterText: '',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
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
            child: const Text('Сохранить'),
          ),
        ],
      ),
    );

    if (newText == null || newText.isEmpty || !mounted) return;
    if (newText == m.text) return;

    try {
      final api = ref.read(clubApiServiceProvider);
      await api.editMessage(messageId: m.id, text: newText);
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      String msg;
      if (code == 'LINK_NOT_ALLOWED') {
        msg = 'Ссылки в чате запрещены. Уберите ссылку из сообщения';
      } else if (code == 'EDIT_WINDOW_EXPIRED') {
        msg = 'Прошло больше 15 минут — сообщение нельзя изменить';
      } else if (code == 'FORBIDDEN') {
        msg = 'Это сообщение нельзя редактировать';
      } else if (code == 'NOT_FOUND') {
        msg = 'Сообщение не найдено';
      } else {
        msg = 'Не удалось изменить сообщение';
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    }
  }

  Future<void> _deleteMessage(String messageId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.background,
        title: Text('Удалить сообщение?', style: AppTypography.sectionHeader),
        content: Text(
          'Сообщение будет удалено для всех участников. Это действие нельзя отменить.',
          style: AppTypography.body,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(
              'Отмена',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.error,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    try {
      final api = ref.read(clubApiServiceProvider);
      await api.deleteMessage(messageId);
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      final msg = code == 'FORBIDDEN'
          ? 'Это сообщение нельзя удалить'
          : 'Не удалось удалить сообщение';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    }
  }

  /// 4.10: закрепить/открепить (только админ — кнопка показывается лишь ему).
  /// Баннер закрепа обновится по WS (ChatPinChangedEvent).
  Future<void> _togglePin(String messageId, bool pin) async {
    try {
      final api = ref.read(clubApiServiceProvider);
      await api.pinMessage(
        clubMonthId: widget.club.id,
        messageId: messageId,
        pinned: pin,
      );
      // Локально сразу (WS придёт и подтвердит/синхронизирует).
      if (mounted) {
        setState(() => _pinnedMessageId = pin ? messageId : null);
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      final msg = code == 'FORBIDDEN'
          ? 'Закреплять может только ведущая клуба'
          : 'Не удалось изменить закреп';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    }
  }

  Future<void> _toggleReaction(String messageId, String emoji) async {
    final uid = _currentUserId;
    if (uid == null) return;

    final idx = _messages.indexWhere((m) => m.id == messageId);
    if (idx == -1) return;
    final original = _messages[idx];

    final reactions = original.reactions
        .map((r) => MessageReaction(
              emoji: r.emoji,
              userIds: List<String>.from(r.userIds),
            ))
        .toList();

    bool hadThisEmoji = false;
    for (final r in reactions) {
      if (r.userIds.remove(uid) && r.emoji == emoji) {
        hadThisEmoji = true;
      }
    }
    if (!hadThisEmoji) {
      final existing = reactions.where((r) => r.emoji == emoji).toList();
      if (existing.isNotEmpty) {
        existing.first.userIds.add(uid);
      } else {
        reactions.add(MessageReaction(emoji: emoji, userIds: [uid]));
      }
    }
    final cleaned = reactions.where((r) => r.userIds.isNotEmpty).toList();

    setState(() {
      _messages[idx] = original.copyWith(reactions: cleaned);
    });
    HapticFeedback.selectionClick();

    try {
      final api = ref.read(clubApiServiceProvider);
      await api.toggleReaction(messageId: messageId, emoji: emoji);
    } on DioException catch (e) {
      if (!mounted) return;
      final curIdx = _messages.indexWhere((m) => m.id == messageId);
      if (curIdx != -1) {
        setState(() => _messages[curIdx] = original);
      }
      final code = ClubApiService.errorCodeFromException(e);
      final msg = code == 'NOT_FOUND'
          ? 'Сообщение не найдено'
          : 'Не удалось поставить реакцию';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    }
  }

  Future<void> _onAttachImage() async {
    final source = await _showImageSourceSheet();
    if (source == null || !mounted) return;

    XFile? picked;
    try {
      picked = await _imagePicker.pickImage(
        source: source,
        maxWidth: 2000,
        maxHeight: 2000,
        imageQuality: 85,
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Не удалось открыть фото'),
        backgroundColor: AppColors.error,
      ));
      return;
    }

    if (picked == null || !mounted) return;

    final caption = await _showImagePreviewDialog(File(picked.path));
    if (caption == null || !mounted) return;

    await _uploadImage(picked.path, caption);
  }

  Future<ImageSource?> _showImageSourceSheet() {
    return showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: AppColors.cardBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined,
                  color: AppColors.terracotta),
              title: Text('Выбрать из галереи', style: AppTypography.body),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined,
                  color: AppColors.terracotta),
              title: Text('Сделать фото', style: AppTypography.body),
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<String?> _showImagePreviewDialog(File file) {
    final captionController = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: AppColors.background,
        insetPadding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(8)),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 360),
                child: Image.file(file, fit: BoxFit.contain),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: TextField(
                controller: captionController,
                maxLength: 1000,
                minLines: 1,
                maxLines: 3,
                style: AppTypography.body,
                decoration: InputDecoration(
                  hintText: 'Добавить подпись (необязательно)',
                  hintStyle: AppTypography.body.copyWith(
                    color: AppColors.textPlaceholder,
                  ),
                  counterText: '',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () => Navigator.of(ctx).pop(),
                      child: Text(
                        'Отмена',
                        style: AppTypography.bodyMedium.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.terracotta,
                      ),
                      onPressed: () =>
                          Navigator.of(ctx).pop(captionController.text.trim()),
                      child: const Text('Отправить'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _uploadImage(String filePath, String caption) async {
    setState(() => _isUploadingImage = true);
    final replyId = _replyingTo?.id;
    try {
      final api = ref.read(clubApiServiceProvider);
      await api.sendImageMessage(
        clubMonthId: widget.club.id,
        filePath: filePath,
        caption: caption,
        replyToId: replyId,
      );
      if (mounted) _cancelReply();
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      String msg;
      if (code == 'LINK_NOT_ALLOWED') {
        msg = 'Ссылки в чате запрещены. Уберите ссылку из подписи';
      } else if (code == 'VALIDATION') {
        msg = 'Файл слишком большой или неподдерживаемый формат';
      } else if (code == 'CLUB_BLOCKED') {
        msg = 'Ваш аккаунт заблокирован';
      } else if (code == 'FORBIDDEN') {
        msg = 'В архиве нельзя отправлять сообщения';
      } else {
        msg = 'Не удалось отправить фото. Попробуйте ещё раз';
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    } finally {
      if (mounted) setState(() => _isUploadingImage = false);
    }
  }

  Future<void> _reportMessage(String messageId) async {
    final reason = await _showReportSheet();
    if (reason == null || !mounted) return;

    try {
      final api = ref.read(clubApiServiceProvider);
      await api.reportMessage(messageId: messageId, reason: reason);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Жалоба отправлена. Мы рассмотрим её в ближайшее время'),
        backgroundColor: AppColors.success,
      ));
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      final msg = code == 'DUPLICATE_KEY'
          ? 'Вы уже жаловались на это сообщение'
          : 'Не удалось отправить жалобу';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    }
  }

  Future<String?> _showReportSheet() {
    const reasons = <Map<String, String>>[
      {'code': 'spam', 'label': 'Спам'},
      {'code': 'inappropriate', 'label': 'Неуместный контент'},
      {'code': 'offensive', 'label': 'Оскорбления'},
      {'code': 'copyright', 'label': 'Нарушение авторских прав'},
      {'code': 'other', 'label': 'Другое'},
    ];

    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.cardBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                child: Text(
                  'Причина жалобы',
                  style: AppTypography.sectionHeader,
                ),
              ),
              ...reasons.map(
                (r) => ListTile(
                  title: Text(r['label']!, style: AppTypography.body),
                  onTap: () => Navigator.of(ctx).pop(r['code']),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  GlobalKey _keyForMessage(String id) {
    return _messageKeys.putIfAbsent(id, () => GlobalKey());
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
        message: 'Не удалось загрузить чат',
        onRetry: () {
          setState(() {
            _isLoading = true;
            _hasError = false;
          });
          _bootstrap();
        },
      );
    }

    ChatMessage? pinned;
    if (_pinnedMessageId != null) {
      for (final m in _messages) {
        if (m.id == _pinnedMessageId) {
          pinned = m;
          break;
        }
      }
    }

    return Container(
      color: AppColors.background,
      child: Column(
        children: [
          if (pinned != null)
            PinnedMessageBanner(
              message: pinned,
              onTap: _scrollToPinned,
            ),
          Expanded(
            child: Stack(
              children: [
                _messages.isEmpty
                    ? _EmptyChat()
                    : ListView.builder(
                        controller: _scrollController,
                        reverse: true,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        itemCount:
                            _messages.length + (_isLoadingMore ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (_isLoadingMore && index == _messages.length) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16),
                              child: Center(
                                child: SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppColors.terracotta,
                                  ),
                                ),
                              ),
                            );
                          }
                          final m = _messages[index];
                          final isMine = m.isMine(_currentUserId);
                          return KeyedSubtree(
                            key: _keyForMessage(m.id),
                            child: ChatMessageBubble(
                              message: m,
                              currentUserId: _currentUserId,
                              isHighlighted:
                                  _highlightedMessageId == m.id,
                              isAdmin: _isAdmin,
                              onReactionTap: (emoji) =>
                                  _toggleReaction(m.id, emoji),
                              onReply: () => _startReply(m),
                              onEdit:
                                  isMine ? () => _editMessage(m) : null,
                              onDelete: isMine
                                  ? () => _deleteMessage(m.id)
                                  : null,
                              onReplyTap: m.hasReply
                                  ? () => _jumpToMessage(m.replyToId)
                                  : null,
                              onReport: isMine
                                  ? null
                                  : () => _reportMessage(m.id),
                              onPinToggle: _isAdmin
                                  ? (pin) => _togglePin(m.id, pin)
                                  : null,
                            ),
                          );
                        },
                      ),

                if (_isJumping)
                  const Positioned.fill(
                    child: ColoredBox(
                      color: Color(0x11000000),
                      child: Center(
                        child: SizedBox(
                          width: 28,
                          height: 28,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: AppColors.terracotta,
                          ),
                        ),
                      ),
                    ),
                  ),

                if (_showJumpDown)
                  Positioned(
                    right: 16,
                    bottom: 16,
                    child: _JumpDownButton(
                      onTap: _jumpToBottom,
                      hasNewer: _hasMoreAfter,
                    ),
                  ),
              ],
            ),
          ),
          if (_isUploadingImage)
            Container(
              width: double.infinity,
              color: AppColors.surfaceLight,
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.terracotta,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text('Отправка фото...', style: AppTypography.caption),
                ],
              ),
            ),
          if (_isUploadingVoice)
            Container(
              width: double.infinity,
              color: AppColors.surfaceLight,
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.terracotta,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text('Отправка голосового...',
                      style: AppTypography.caption),
                ],
              ),
            ),
          ChatInput(
            canPost: widget.access.canPost,
            isMuted: widget.access.isMuted,
            mutedUntil: widget.access.mutedUntil,
            isArchive: widget.access.kind == ClubAccessKind.archive,
            mentionable: _mentionable,
            isAdmin: _isAdmin,
            onSend: _sendMessage,
            onSendVoice: _isAdmin ? _sendVoice : null,
            onAttachImage: _onAttachImage,
            replyToName: _replyingTo?.author.name,
            replyToText: _replyingTo == null
                ? null
                : _replyPreviewText(_replyingTo!),
            onCancelReply: _replyingTo == null ? null : _cancelReply,
          ),
        ],
      ),
    );
  }
}

/// Плавающая кнопка «вниз» — возврат к свежим сообщениям (как в Telegram).
/// Если есть более новые за окном (hasNewer) — маленькая точка-индикатор.
class _JumpDownButton extends StatelessWidget {
  const _JumpDownButton({required this.onTap, required this.hasNewer});
  final VoidCallback onTap;
  final bool hasNewer;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.cardBackground,
      shape: const CircleBorder(),
      elevation: 3,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Stack(
            alignment: Alignment.center,
            children: [
              const Icon(
                Icons.keyboard_arrow_down,
                color: AppColors.textSecondary,
                size: 26,
              ),
              if (hasNewer)
                Positioned(
                  top: 6,
                  right: 6,
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: const BoxDecoration(
                      color: AppColors.terracotta,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Пустой чат — пока никто не написал в клубе.
class _EmptyChat extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.chat_bubble_outline,
              size: 48,
              color: AppColors.textTertiary,
            ),
            const SizedBox(height: 12),
            Text(
              'Пока никто не написал',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              'Будьте первой — поделитесь впечатлениями от книги',
              style: AppTypography.caption,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
