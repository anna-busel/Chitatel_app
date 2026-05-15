import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../core/network/api_endpoints.dart';
import '../../../core/storage/secure_storage.dart';
import '../models/chat_message.dart';

/// Провайдер socket-сервиса. Singleton на всё приложение —
/// один Socket.io подключение на сессию пользователя.
final clubSocketServiceProvider = Provider<ClubSocketService>((ref) {
  final service = ClubSocketService(ref.read(secureStorageProvider));
  ref.onDispose(service.disconnect);
  return service;
});

/// События от сервера Socket.io.
/// Соответствуют событиям эмитимым из server/src/socket/index.js и routes/club.js.
sealed class ClubSocketEvent {
  const ClubSocketEvent();
}

/// Новое сообщение пришло в чат (после POST /api/club/.../chat).
class ChatNewMessageEvent extends ClubSocketEvent {
  const ChatNewMessageEvent(this.message);
  final ChatMessage message;
}

/// Модератор скрыл сообщение — клиент должен убрать его из ленты.
class ChatMessageHiddenEvent extends ClubSocketEvent {
  const ChatMessageHiddenEvent(this.messageId);
  final String messageId;
}

/// Закреплённое сообщение изменилось (или сброшено null).
class ChatPinChangedEvent extends ClubSocketEvent {
  const ChatPinChangedEvent(this.pinnedMessageId);

  /// null если закреп снят.
  final String? pinnedMessageId;
}

/// Кто-то печатает (broadcast, без сохранения).
class ChatUserTypingEvent extends ClubSocketEvent {
  const ChatUserTypingEvent(this.userId);
  final String userId;
}

/// Сокет успешно подключился к комнате клуба.
class ConnectedEvent extends ClubSocketEvent {
  const ConnectedEvent({required this.clubMonthId, required this.canPost});
  final String clubMonthId;
  final bool canPost;
}

/// Ошибка от сервера (UNAUTHORIZED / SUBSCRIPTION_REQUIRED / NOT_FOUND).
class ClubSocketErrorEvent extends ClubSocketEvent {
  const ClubSocketErrorEvent({required this.code, required this.message});
  final String code;
  final String message;
}

/// Сокет потерял соединение (любая причина — сеть, сервер, disconnect).
class DisconnectedEvent extends ClubSocketEvent {
  const DisconnectedEvent(this.reason);
  final String reason;
}

/// Сервис подключения к Socket.io для чата клуба.
///
/// Использование:
/// 1. `connect(clubMonthId)` — открыть подключение к комнате клуба
/// 2. слушать `events` стрим — получать [ClubSocketEvent]
/// 3. `emitTyping()` — сказать серверу что юзер печатает
/// 4. `disconnect()` — закрыть соединение (при уходе с экрана клуба)
///
/// JWT-токен берётся из SecureStorage. Если токена нет — connect ничего
/// не делает (сервер всё равно отвергнет).
///
/// Подключение **одно на сервис**. При смене клуба — disconnect + connect.
class ClubSocketService {
  ClubSocketService(this._storage);

  final SecureStorage _storage;

  io.Socket? _socket;
  final _eventsController = StreamController<ClubSocketEvent>.broadcast();
  String? _currentClubMonthId;

  /// Стрим событий чата. Один stream broadcast — можно слушать из нескольких мест.
  Stream<ClubSocketEvent> get events => _eventsController.stream;

  /// Сейчас подключены к комнате?
  bool get isConnected => _socket?.connected == true;

  /// ID клуба к которому сейчас подключены (null если disconnect).
  String? get currentClubMonthId => _currentClubMonthId;

  /// Подключиться к комнате клуба.
  /// Если уже подключены к этому клубу — no-op.
  /// Если подключены к другому — сначала disconnect.
  Future<void> connect(String clubMonthId) async {
    if (_currentClubMonthId == clubMonthId && isConnected) {
      return; // уже там
    }

    if (_socket != null) {
      await disconnect();
    }

    final token = await _storage.getAccessToken();
    if (token == null || token.isEmpty) {
      if (kDebugMode) {
        debugPrint('[ClubSocketService] no JWT, skipping connect');
      }
      _eventsController.add(const ClubSocketErrorEvent(
        code: 'UNAUTHORIZED',
        message: 'Нет токена авторизации',
      ));
      return;
    }

    _currentClubMonthId = clubMonthId;

    // Создаём подключение. autoConnect=false чтобы навесить обработчики до connect.
    _socket = io.io(
      ApiEndpoints.socketBaseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .setQuery({'clubMonthId': clubMonthId})
          .build(),
    );

    _socket!.onConnect((_) {
      if (kDebugMode) {
        debugPrint('[ClubSocketService] connected to $clubMonthId');
      }
    });

    _socket!.onConnectError((err) {
      if (kDebugMode) {
        debugPrint('[ClubSocketService] connect error: $err');
      }
      _eventsController.add(ClubSocketErrorEvent(
        code: 'CONNECT_ERROR',
        message: err?.toString() ?? 'Ошибка подключения',
      ));
    });

    _socket!.onDisconnect((reason) {
      if (kDebugMode) {
        debugPrint('[ClubSocketService] disconnected: $reason');
      }
      _eventsController.add(DisconnectedEvent(reason?.toString() ?? 'unknown'));
    });

    // — События от сервера —

    _socket!.on('connected', (data) {
      if (data is Map) {
        _eventsController.add(ConnectedEvent(
          clubMonthId: (data['clubMonthId'] ?? '').toString(),
          canPost: data['canPost'] == true,
        ));
      }
    });

    _socket!.on('error', (data) {
      if (data is Map) {
        _eventsController.add(ClubSocketErrorEvent(
          code: (data['code'] ?? 'UNKNOWN').toString(),
          message: (data['message'] ?? '').toString(),
        ));
      }
    });

    _socket!.on('chat:new_message', (data) {
      if (data is Map && data['message'] is Map) {
        try {
          final msg = ChatMessage.fromJson(
            (data['message'] as Map).cast<String, dynamic>(),
          );
          _eventsController.add(ChatNewMessageEvent(msg));
        } catch (e) {
          if (kDebugMode) {
            debugPrint('[ClubSocketService] failed to parse chat:new_message: $e');
          }
        }
      }
    });

    _socket!.on('chat:message_hidden', (data) {
      if (data is Map && data['messageId'] is String) {
        _eventsController.add(
          ChatMessageHiddenEvent((data['messageId']).toString()),
        );
      }
    });

    _socket!.on('chat:pin_changed', (data) {
      if (data is Map) {
        final id = data['pinnedMessageId'];
        _eventsController.add(
          ChatPinChangedEvent(id is String && id.isNotEmpty ? id : null),
        );
      }
    });

    _socket!.on('chat:user_typing', (data) {
      if (data is Map && data['userId'] != null) {
        _eventsController.add(
          ChatUserTypingEvent(data['userId'].toString()),
        );
      }
    });

    _socket!.connect();
  }

  /// Сказать серверу «я печатаю». Сервер раз-broadcast'ит остальным
  /// (без сохранения в БД, эфемерное событие). В архиве сервер игнорирует.
  void emitTyping() {
    final s = _socket;
    if (s != null && s.connected) {
      s.emit('chat:typing');
    }
  }

  /// Отключиться. Вызывать при уходе с экрана клуба или logout.
  Future<void> disconnect() async {
    final s = _socket;
    _socket = null;
    _currentClubMonthId = null;
    if (s != null) {
      s.dispose();
    }
  }
}
