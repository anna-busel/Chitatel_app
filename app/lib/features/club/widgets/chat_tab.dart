import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
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
/// Архитектура:
/// 1. При init — загружаем историю через REST (последние 20 сообщений).
/// 2. Подключаемся к Socket.io комнате клуба (JWT + clubMonthId).
/// 3. Подписываемся на стрим событий — добавляем новые сообщения в state.
/// 4. При отправке — POST через REST. Сервер сам эмитит chat:new_message
///    через WS, наш сокет получит и добавит в список (включая своё сообщение).
/// 5. При уходе с экрана — disconnect socket + dispose контроллеров.
///
/// Состояние храним локально (StatefulWidget) — для real-time чата это
/// уместнее чем Riverpod, поскольку поток событий специфичен для текущего экрана
/// и не должен переживать его (в отличие от глобальных данных типа профиля).
class ChatTab extends ConsumerStatefulWidget {
  const ChatTab({super.key, required this.club, required this.access});
  final ClubMonth club;
  final ClubAccess access;

  @override
  ConsumerState<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends ConsumerState<ChatTab> {
  /// Сообщения в порядке DESC (новые в начале списка).
  /// ListView рендерим с reverse=true — визуально новые внизу, как в Telegram.
  final List<ChatMessage> _messages = [];

  /// ID текущего юзера (для отличения «свой/чужой» в bubble).
  String? _currentUserId;

  /// ID закреплённого сообщения. Обновляется через chat:pin_changed.
  String? _pinnedMessageId;

  bool _isLoading = true;
  bool _hasError = false;
  bool _isLoadingMore = false;
  bool _hasMore = false;

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
    _socketSub?.cancel();
    _scrollController.dispose();
    // Disconnect socket — клиент уходит с экрана клуба.
    // Не делаем await, т.к. dispose синхронный; service сам отключится в фоне.
    final socket = ref.read(clubSocketServiceProvider);
    socket.disconnect();
    super.dispose();
  }

  /// Начальная загрузка: userId из storage + история чата + WS-подключение.
  Future<void> _bootstrap() async {
    try {
      // 1. Текущий юзер (для определения "своих" сообщений).
      final storage = ref.read(secureStorageProvider);
      _currentUserId = await storage.getUserId();

      // 2. История REST.
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
        _hasMore = history.hasMore;
        _isLoading = false;
      });

      // 3. Socket — подключаемся к комнате.
      final socket = ref.read(clubSocketServiceProvider);
      _socketSub = socket.events.listen(_onSocketEvent);
      await socket.connect(widget.club.id);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _hasError = true;
      });
    }
  }

  /// Обработчик событий Socket.io.
  void _onSocketEvent(ClubSocketEvent event) {
    if (!mounted) return;

    if (event is ChatNewMessageEvent) {
      // Анти-дубль: если сообщение уже в списке (от REST после нашего POST),
      // не добавляем повторно.
      if (_messages.any((m) => m.id == event.message.id)) return;
      setState(() {
        _messages.insert(0, event.message);
      });
    } else if (event is ChatMessageHiddenEvent) {
      setState(() {
        _messages.removeWhere((m) => m.id == event.messageId);
      });
    } else if (event is ChatPinChangedEvent) {
      setState(() => _pinnedMessageId = event.pinnedMessageId);
    }
    // ChatUserTypingEvent, ConnectedEvent, ClubSocketErrorEvent, DisconnectedEvent —
    // в 4.5 игнорируем. typing-индикатор и оффлайн-баннер — задачи 4.10/4.11.
  }

  /// При скролле к верху списка (а с reverse=true это `maxScrollExtent`) —
  /// подгружаем старые сообщения.
  void _onScroll() {
    if (!_scrollController.hasClients || _isLoadingMore || !_hasMore) return;
    final pos = _scrollController.position;
    if (pos.pixels >= pos.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
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
        _messages.addAll(history.messages);
        _hasMore = history.hasMore;
        _isLoadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoadingMore = false);
    }
  }

  /// Отправка текстового сообщения.
  /// Server вернёт сообщение + эмитит chat:new_message по WS. Когда событие
  /// придёт — оно добавится в список через _onSocketEvent.
  Future<void> _sendMessage(String text) async {
    if (text.trim().isEmpty) return;

    try {
      final api = ref.read(clubApiServiceProvider);
      await api.sendTextMessage(
        clubMonthId: widget.club.id,
        text: text.trim(),
      );
      // Сообщение придёт по WS — UI обновится сам.
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      String msg;
      if (code == 'CLUB_BLOCKED') {
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

  /// Жалоба на чужое сообщение (через ChatMessageBubble.onReport).
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

  /// Bottom sheet выбора причины жалобы.
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

    // Ищем закреплённое сообщение в текущем списке (если оно подгружено).
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
          if (pinned != null) PinnedMessageBanner(message: pinned),
          Expanded(
            child: _messages.isEmpty
                ? _EmptyChat()
                : ListView.builder(
                    controller: _scrollController,
                    reverse: true,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    itemCount: _messages.length + (_isLoadingMore ? 1 : 0),
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
                      // Поиск сообщения для reply preview.
                      ChatMessage? replyTo;
                      if (m.hasReply) {
                        for (final candidate in _messages) {
                          if (candidate.id == m.replyToId) {
                            replyTo = candidate;
                            break;
                          }
                        }
                      }
                      return ChatMessageBubble(
                        message: m,
                        replyTo: replyTo,
                        currentUserId: _currentUserId,
                        onLongPress: m.isMine(_currentUserId)
                            ? null
                            : () {
                                HapticFeedback.lightImpact();
                                _reportMessage(m.id);
                              },
                      );
                    },
                  ),
          ),
          ChatInput(
            canPost: widget.access.canPost,
            isMuted: widget.access.isMuted,
            mutedUntil: widget.access.mutedUntil,
            isArchive: widget.access.kind == ClubAccessKind.archive,
            onSend: _sendMessage,
          ),
        ],
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
