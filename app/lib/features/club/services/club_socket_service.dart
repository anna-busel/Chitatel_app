import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
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

/// Сообщение отредактировано (4.8). Приходит обновлённое сообщение —
/// клиент заменяет его в списке (новый text + editedAt).
class ChatMessageEditedEvent extends ClubSocketEvent {
  const ChatMessageEditedEvent(this.message);
  final ChatMessage message;
}

/// Сообщение удалено (4.8, soft delete). Клиент перерисовывает bubble
/// как «Сообщение удалено» — НЕ убирает из ленты (reply-контекст
/// должен сохраниться, как в Telegram).
class ChatMessageDeletedEvent extends ClubSocketEvent {
  const ChatMessageDeletedEvent(this.messageId);
  final String messageId;
}

/// Закреплённое сообщение изменилось (или сброшено null).
class ChatPinChangedEvent extends ClubSocketEvent {
  const ChatPinChangedEvent(this.pinnedMessageId);

  /// null если закреп снят.
  final String? pinnedMessageId;
}

/// Реакции на сообщение изменились (4.7). Приходит полный массив reactions —
/// клиент заменяет локальные реакции этого сообщения целиком.
class ChatReactionUpdatedEvent extends ClubSocketEvent {
  const ChatReactionUpdatedEvent({
    required this.messageId,
    required this.reactions,
  });
  final String messageId;
  final List<MessageReaction> reactions;
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
///
/// ВОССТАНОВЛЕНИЕ СВЯЗИ (баг 25.09.2026). Соединение на телефоне рвётся само:
/// сеть моргнула, Wi-Fi переключился, экран погас. Раньше после разрыва оно
/// не восстанавливалось никогда — экран чата выглядел обычно, но новые
/// сообщения переставали приходить до тех пор, пока не зайдёшь на экран
/// заново. По логам сервера: разрыв в 17:18, ни одной попытки подключения до
/// 17:47, когда пользователь вернулся на экран вручную.
///
/// Теперь: после разрыва сервис сам переподключается с нарастающими паузами
/// (1, 2, 5, 10, 20, 30 секунд), и КАЖДЫЙ раз заново читает токен из
/// хранилища. Последнее важно: токен доступа живёт 15 минут, а стандартное
/// переподключение библиотеки отправило бы тот же самый, уже протухший —
/// сервер отверг бы его молча.
///
/// Плюс подписка на жизненный цикл приложения: при возврате из фона
/// соединение проверяется и восстанавливается сразу, не дожидаясь паузы.
///
/// Осознанный разрыв (`disconnect()` при уходе с экрана или выходе из
/// аккаунта) переподключение НЕ запускает — за это отвечает `_manualClose`.
class ClubSocketService {
  ClubSocketService(this._storage);

  final SecureStorage _storage;

  io.Socket? _socket;
  final _eventsController = StreamController<ClubSocketEvent>.broadcast();
  String? _currentClubMonthId;

  /// Паузы между попытками переподключения. Дальше последней — повтор 30 сек.
  static const List<int> _retryDelaysSeconds = [1, 2, 5, 10, 20, 30];

  Timer? _retryTimer;
  int _retryAttempt = 0;

  /// true — соединение закрыли намеренно, переподключаться не нужно.
  bool _manualClose = false;

  /// Наблюдатель за возвратом приложения из фона (создаётся при первом
  /// подключении, снимается в [disconnect]).
  _AppResumeWatcher? _resumeWatcher;

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

    // Намеренный разрыв отменяется: пользователь снова хочет быть на связи.
    _manualClose = false;
    _retryTimer?.cancel();

    // Старый сокет закрываем БЕЗ disconnect() — тот пометил бы закрытие
    // намеренным и выключил переподключение.
    _closeSocket();

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
      // Связь есть — счётчик попыток обнуляем, чтобы следующий разрыв
      // начинал отсчёт заново с одной секунды.
      _retryAttempt = 0;
      _retryTimer?.cancel();
    });

    _socket!.onConnectError((err) {
      if (kDebugMode) {
        debugPrint('[ClubSocketService] connect error: $err');
      }
      _eventsController.add(ClubSocketErrorEvent(
        code: 'CONNECT_ERROR',
        message: err?.toString() ?? 'Ошибка подключения',
      ));
      _scheduleRetry();
    });

    _socket!.onDisconnect((reason) {
      if (kDebugMode) {
        debugPrint('[ClubSocketService] disconnected: $reason');
      }
      _eventsController.add(DisconnectedEvent(reason?.toString() ?? 'unknown'));
      _scheduleRetry();
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

    _socket!.on('chat:message_edited', (data) {
      if (data is Map && data['message'] is Map) {
        try {
          final msg = ChatMessage.fromJson(
            (data['message'] as Map).cast<String, dynamic>(),
          );
          _eventsController.add(ChatMessageEditedEvent(msg));
        } catch (e) {
          if (kDebugMode) {
            debugPrint(
                '[ClubSocketService] failed to parse chat:message_edited: $e');
          }
        }
      }
    });

    _socket!.on('chat:message_deleted', (data) {
      if (data is Map && data['messageId'] != null) {
        _eventsController.add(
          ChatMessageDeletedEvent(data['messageId'].toString()),
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

    _socket!.on('chat:reaction_updated', (data) {
      if (data is Map && data['messageId'] != null) {
        try {
          final raw = data['reactions'];
          final reactions = raw is List
              ? raw
                  .whereType<Map>()
                  .map((m) =>
                      MessageReaction.fromJson(m.cast<String, dynamic>()))
                  .toList(growable: false)
              : const <MessageReaction>[];
          _eventsController.add(ChatReactionUpdatedEvent(
            messageId: data['messageId'].toString(),
            reactions: reactions,
          ));
        } catch (e) {
          if (kDebugMode) {
            debugPrint(
                '[ClubSocketService] failed to parse chat:reaction_updated: $e');
          }
        }
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

    // Следим за возвратом приложения из фона (один наблюдатель на сервис).
    _ensureResumeWatcher();
  }

  /// Запланировать попытку переподключения.
  ///
  /// Паузы нарастают, чтобы при долгом отсутствии сети не жечь батарею:
  /// 1, 2, 5, 10, 20, дальше каждые 30 секунд. Если таймер уже заведён —
  /// ничего не делаем (разрыв и ошибка подключения приходят парой).
  void _scheduleRetry() {
    if (_manualClose) return;
    final clubMonthId = _currentClubMonthId;
    if (clubMonthId == null) return;
    if (_retryTimer?.isActive == true) return;

    final index = _retryAttempt < _retryDelaysSeconds.length
        ? _retryAttempt
        : _retryDelaysSeconds.length - 1;
    _retryAttempt++;

    _retryTimer = Timer(Duration(seconds: _retryDelaysSeconds[index]), () {
      if (_manualClose || isConnected) return;
      // connect() заново читает токен из хранилища — в этом весь смысл.
      connect(clubMonthId);
    });
  }

  /// Приложение вернулось из фона: если связи нет — восстанавливаем сразу,
  /// не дожидаясь очередной паузы.
  void _onAppResumed() {
    if (_manualClose || isConnected) return;
    final clubMonthId = _currentClubMonthId;
    if (clubMonthId == null) return;
    _retryTimer?.cancel();
    _retryAttempt = 0;
    connect(clubMonthId);
  }

  void _ensureResumeWatcher() {
    if (_resumeWatcher != null) return;
    final watcher = _AppResumeWatcher(_onAppResumed);
    _resumeWatcher = watcher;
    WidgetsBinding.instance.addObserver(watcher);
  }

  void _removeResumeWatcher() {
    final watcher = _resumeWatcher;
    _resumeWatcher = null;
    if (watcher != null) {
      WidgetsBinding.instance.removeObserver(watcher);
    }
  }

  /// Закрыть текущий сокет, НЕ трогая признак намеренного закрытия и
  /// текущий клуб — используется и при переподключении.
  void _closeSocket() {
    final s = _socket;
    _socket = null;
    if (s != null) {
      s.dispose();
    }
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
  ///
  /// Закрытие намеренное: переподключение выключается, таймер снимается,
  /// наблюдатель за возвратом из фона отписывается.
  Future<void> disconnect() async {
    _manualClose = true;
    _retryTimer?.cancel();
    _retryTimer = null;
    _retryAttempt = 0;
    _removeResumeWatcher();
    _closeSocket();
    _currentClubMonthId = null;
  }
}

/// Наблюдатель за жизненным циклом приложения: дёргает колбэк, когда
/// приложение возвращается на передний план.
class _AppResumeWatcher extends WidgetsBindingObserver {
  _AppResumeWatcher(this.onResumed);

  final VoidCallback onResumed;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      onResumed();
    }
  }
}
