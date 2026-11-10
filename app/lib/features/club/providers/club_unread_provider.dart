import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/storage/secure_storage.dart';
import '../../auth/providers/auth_provider.dart';
import '../services/block_service.dart';
import '../services/club_api_service.dart';
import '../services/club_socket_service.dart';

/// Непрочитанные в чатах клубов (UPDATES-PLAN V2/V4, 1.0.5).
///
/// [byClub] — clubMonthId → число новых (сервер считает не больше 99).
/// [total] — сумма; на «Клубе» в нижнем меню горит точка, если total > 0.
class ClubUnreadState {
  const ClubUnreadState({this.byClub = const {}});

  final Map<String, int> byClub;

  int get total => byClub.values.fold(0, (sum, n) => sum + n);

  int forClub(String clubMonthId) => byClub[clubMonthId] ?? 0;
}

/// Подпись бейджа: сервер отдаёт не больше 99, поэтому 99 = «99 и больше».
String unreadBadgeLabel(int n) => n >= 99 ? '99+' : '$n';

/// Счётчики непрочитанных (V2 — вкладка «Чат», V4 — точка на «Клубе»).
///
/// Обновляется:
/// - при старте (первое чтение провайдера — нижнее меню) и входе в аккаунт;
/// - при возврате приложения на передний план (свой наблюдатель жизненного
///   цикла);
/// - при открытии клуба (ClubScreen зовёт [refresh]);
/// - +1 локально на новое сообщение из сокета, если чат этого клуба не открыт;
/// - после отметки прочитанного в чате ([setClub]).
///
/// Гостю ничего не запрашиваем. Если сервер ответил «клубов нет» — дальше
/// по возврату в приложение не спрашиваем, пока не откроется клуб
/// ([refresh] с force) или не сменится аккаунт. Ошибки сети — молча.
final clubUnreadProvider =
    StateNotifierProvider<ClubUnreadNotifier, ClubUnreadState>((ref) {
  final notifier = ClubUnreadNotifier(ref);
  ref.listen<AuthState>(authProvider, (prev, next) {
    if (prev?.status == next.status) return;
    if (next.status == AuthStatus.authenticated) {
      notifier.refresh(force: true);
    } else if (next.status == AuthStatus.guest) {
      notifier.clear();
    }
  });
  return notifier;
});

class ClubUnreadNotifier extends StateNotifier<ClubUnreadState> {
  ClubUnreadNotifier(this._ref) : super(const ClubUnreadState()) {
    _lifecycle = _UnreadResumeWatcher(() => refresh());
    WidgetsBinding.instance.addObserver(_lifecycle);
    _socketSub = _ref
        .read(clubSocketServiceProvider)
        .events
        .listen(_onSocketEvent, onError: (_) {});
    // Старт: первый, кто прочитал провайдер, — нижнее меню.
    Future.microtask(() => refresh());
  }

  final Ref _ref;
  late final _UnreadResumeWatcher _lifecycle;
  StreamSubscription<ClubSocketEvent>? _socketSub;
  bool _inFlight = false;
  bool _noClubs = false;
  String? _myUserId;

  /// Чат какого клуба сейчас открыт на экране и кто его открыл (ClubScreen).
  /// Обычные поля, не состояние провайдера: их меняют и из dispose().
  String? _openChatClubId;
  Object? _openChatOwner;

  bool isChatOpen(String clubMonthId) => _openChatClubId == clubMonthId;

  /// ClubScreen: вкладка «Чат» клуба [clubMonthId] открыта (или null — нет).
  void setChatOpen(Object owner, String? clubMonthId) {
    _openChatOwner = owner;
    _openChatClubId = clubMonthId;
  }

  /// ClubScreen.dispose: снимаем отметку, только если её ставил этот экран
  /// (новый экран клуба мог уже поставить свою).
  void releaseChatOpen(Object owner) {
    if (_openChatOwner != owner) return;
    _openChatOwner = null;
    _openChatClubId = null;
  }

  bool get _isAuthenticated =>
      _ref.read(authProvider).status == AuthStatus.authenticated;

  /// Перечитать счётчики с сервера. [force] — даже если раньше сервер
  /// сказал, что клубов нет (клуб открылся / сменился аккаунт).
  Future<void> refresh({bool force = false}) async {
    if (!mounted) return;
    if (!_isAuthenticated) {
      clear();
      return;
    }
    if (_noClubs && !force) return;
    if (_inFlight) return;
    _inFlight = true;
    try {
      _myUserId ??= await _ref.read(secureStorageProvider).getUserId();
      final result = await _ref.read(clubApiServiceProvider).fetchUnread();
      if (!mounted || result == null) return;
      _noClubs = result.isEmpty;
      final next = Map<String, int>.from(result);
      // Открытый сейчас чат читается — его счётчик ведёт сам чат.
      final open = _openChatClubId;
      if (open != null) {
        next[open] = state.forClub(open);
      }
      next.removeWhere((_, n) => n <= 0);
      state = ClubUnreadState(byClub: next);
    } catch (_) {
      // Молча: без бейджей.
    } finally {
      _inFlight = false;
    }
  }

  /// Чат отметил прочитанное: осталось [unread] новых ниже видимого.
  void setClub(String clubMonthId, int unread) {
    if (!mounted) return;
    if (state.forClub(clubMonthId) == unread) return;
    final next = Map<String, int>.from(state.byClub);
    if (unread <= 0) {
      next.remove(clubMonthId);
    } else {
      next[clubMonthId] = unread;
    }
    state = ClubUnreadState(byClub: next);
  }

  void clear() {
    _noClubs = false;
    _myUserId = null;
    _openChatClubId = null;
    _openChatOwner = null;
    if (!mounted || state.byClub.isEmpty) return;
    state = const ClubUnreadState();
  }

  void _onSocketEvent(ClubSocketEvent event) {
    if (!mounted || event is! ChatNewMessageEvent) return;
    final m = event.message;
    final clubId = m.clubMonthId;
    if (clubId.isEmpty || isChatOpen(clubId)) return;
    if (_myUserId != null && m.isMine(_myUserId)) return;
    if (m.isDeleted) return;
    if (_ref.read(blockedIdsProvider).contains(m.author.id)) return;
    final next = Map<String, int>.from(state.byClub);
    next[clubId] = (next[clubId] ?? 0) + 1;
    state = ClubUnreadState(byClub: next);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(_lifecycle);
    _socketSub?.cancel();
    super.dispose();
  }
}

/// Возврат приложения на передний план → перечитать счётчики.
class _UnreadResumeWatcher extends WidgetsBindingObserver {
  _UnreadResumeWatcher(this.onResume);
  final VoidCallback onResume;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) onResume();
  }
}
