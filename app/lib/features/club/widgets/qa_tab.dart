import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/network/network_error.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/error_view.dart';
import '../models/club_access.dart';
import '../models/club_month.dart';
import '../models/qa_question.dart';
import '../services/block_service.dart';
import '../services/club_api_service.dart';
import '../services/club_socket_service.dart';
import '../services/qa_admin_service.dart';
import 'ask_question_sheet.dart';

/// Таб «Вопросы» (бывший «Q&A») — вопросы к Анне.
///
/// Это ОТДЕЛЬНАЯ рубрика, не чат: вопрос задаётся кнопкой внизу (или
/// «Вопрос Анне» в чате), ответ Анны появляется внутри карточки вопроса.
/// В чат ответы не попадают и не должны.
///
/// Раздел «Вопросы» (UPDATES-PLAN D7/D8, 11.2026):
/// - участница задаёт до 3 вопросов в неделю — под кнопкой «осталось N из 3»,
///   на нуле кнопка неактивна «Новые вопросы — с понедельника»;
/// - все видят вопросы месяца и жмут «Тоже интересно · N» (оптимистично,
///   откат при ошибке; число у всех синхронно — сокет qa:updated);
/// - статус на карточке: «Анна ответила» (+ ответ);
/// - у АННЫ (access.kind == admin): «Популярные / Новые», фильтр по статусу,
///   на карточке «Ответить» → POST /api/club/qa/:id/status.
class QATab extends ConsumerStatefulWidget {
  const QATab({super.key, required this.club, required this.access});
  final ClubMonth club;
  final ClubAccess access;

  @override
  ConsumerState<QATab> createState() => _QATabState();
}

/// Фильтр статуса у Анны: null = «Все».
const List<(QAStatus?, String)> _statusFilters = [
  (null, 'Все'),
  (QAStatus.open, 'Ждут'),
  (QAStatus.answered, 'Ответила'),
];

class _QATabState extends ConsumerState<QATab> {
  List<QAQuestion> _questions = [];
  bool _isLoading = true;
  bool _hasError = false;

  /// Мой userId — чтобы не показывать «Пожаловаться» на свой же вопрос.
  String? _currentUserId;

  /// Сколько ещё вопросов можно задать на этой неделе. null — у Анны (без
  /// лимита) или старый сервер — подпись под кнопкой не показываем.
  int? _remainingThisWeek;
  int _weeklyLimit = 3;

  /// Анна: сортировка ('interest' | 'new') и фильтр статуса (null — все).
  String _sort = 'interest';
  QAStatus? _statusFilter;

  /// Номер последнего запроса списка — ответ старого запроса (после быстрого
  /// переключения фильтров) не должен затирать новый.
  int _loadSeq = 0;

  /// Вопросы, по которым сейчас летит «Тоже интересно» / смена статуса.
  final Set<String> _interestInFlight = {};
  final Set<String> _statusInFlight = {};

  StreamSubscription<ClubSocketEvent>? _socketSub;

  /// Анна — ведущая клуба. Только у неё сортировка/фильтр и кнопки статуса.
  bool get _isAdmin => widget.access.kind == ClubAccessKind.admin;

  @override
  void initState() {
    super.initState();
    _loadCurrentUserId();
    _load();
    _subscribeSocket();
  }

  @override
  void dispose() {
    _socketSub?.cancel();
    super.dispose();
  }

  Future<void> _loadCurrentUserId() async {
    final id = await ref.read(secureStorageProvider).getUserId();
    if (!mounted) return;
    setState(() => _currentUserId = id);
  }

  /// qa:updated приходит в комнату клуба — тот же сокет, что у чата.
  /// Если чат ещё не открывали (сразу пришли на «Вопросы») — подключаемся
  /// сами; уже подключённый к этому клубу сокет не трогаем.
  void _subscribeSocket() {
    final socket = ref.read(clubSocketServiceProvider);
    _socketSub = socket.events.listen(_onSocketEvent);
    if (socket.currentClubMonthId != widget.club.id) {
      socket.connect(widget.club.id);
    }
  }

  void _onSocketEvent(ClubSocketEvent event) {
    if (!mounted || event is! QAUpdatedEvent) return;
    if (event.clubMonthId.isNotEmpty && event.clubMonthId != widget.club.id) {
      return;
    }
    final index = _questions.indexWhere((q) => q.id == event.questionId);
    if (index == -1) return;
    if (_questions[index].interestCount == event.interestCount) return;
    _replaceQuestion(
      _questions[index].copyWith(interestCount: event.interestCount),
    );
  }

  Future<void> _load() async {
    final seq = ++_loadSeq;
    try {
      final api = ref.read(clubApiServiceProvider);
      final result = await api.fetchQA(
        widget.club.id,
        sort: _isAdmin ? _sort : null,
        status: _isAdmin ? _statusFilter : null,
      );
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _questions = result.questions;
        _remainingThisWeek = result.remainingThisWeek;
        _weeklyLimit = result.weeklyLimit;
        _isLoading = false;
        _hasError = false;
      });
    } catch (_) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _isLoading = false;
        _hasError = true;
      });
    }
  }

  void _replaceQuestion(QAQuestion updated) {
    setState(() {
      _questions = _questions
          .map((q) => q.id == updated.id ? updated : q)
          .toList(growable: false);
    });
  }

  QAQuestion? _findQuestion(String id) {
    for (final q in _questions) {
      if (q.id == id) return q;
    }
    return null;
  }

  void _showSnack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: isError ? AppColors.error : AppColors.success,
    ));
  }

  // — Анна: сортировка и фильтр —

  void _setSort(String sort) {
    if (sort == _sort) return;
    setState(() {
      _sort = sort;
      _isLoading = true;
    });
    _load();
  }

  void _setStatusFilter(QAStatus? status) {
    if (status == _statusFilter) return;
    setState(() {
      _statusFilter = status;
      _isLoading = true;
    });
    _load();
  }

  // — Участница: задать вопрос —

  Future<void> _openAskSheet() async {
    final result = await showModalBottomSheet<QAAskResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AskQuestionSheet(
        clubMonthId: widget.club.id,
        remainingThisWeek: _remainingThisWeek,
        weeklyLimit: _weeklyLimit,
      ),
    );
    if (!mounted) return;
    if (result == null) {
      // Закрыли без вопроса — возможно, упёрлись в лимит. Тихо перечитываем
      // список и остаток (без спиннера).
      _load();
      return;
    }
    setState(() {
      _questions = [result.question, ..._questions];
      _remainingThisWeek = result.remainingThisWeek;
      _weeklyLimit = result.weeklyLimit;
    });
    // Порядок и остаток — как на сервере.
    _load();
  }

  // — «Тоже интересно» —

  /// Оптимистично: сразу меняем подсветку и число, при ошибке — откат.
  Future<void> _toggleInterest(QAQuestion question) async {
    if (_interestInFlight.contains(question.id)) return;
    _interestInFlight.add(question.id);

    final wasInterested = question.interestedByMe;
    final wasCount = question.interestCount;
    final nextCount = wasInterested
        ? (wasCount > 0 ? wasCount - 1 : 0)
        : wasCount + 1;
    _replaceQuestion(question.copyWith(
      interestedByMe: !wasInterested,
      interestCount: nextCount,
    ));

    try {
      final result = await ref
          .read(clubApiServiceProvider)
          .toggleQuestionInterest(question.id);
      if (!mounted) return;
      final current = _findQuestion(question.id);
      if (current != null) {
        _replaceQuestion(current.copyWith(
          interestedByMe: result.interested,
          interestCount: result.interestCount,
        ));
      }
    } catch (e) {
      if (!mounted) return;
      final current = _findQuestion(question.id);
      if (current != null) {
        _replaceQuestion(current.copyWith(
          interestedByMe: wasInterested,
          interestCount: wasCount,
        ));
      }
      _showSnack(
        userMessageFor(e, fallback: 'Не удалось отметить вопрос'),
        isError: true,
      );
    } finally {
      _interestInFlight.remove(question.id);
    }
  }

  // — Анна: статус —

  /// Применить обновлённый вопрос после смены статуса. Если он больше не
  /// подходит под выбранный фильтр — убираем из списка.
  void _applyStatusUpdate(QAQuestion updated) {
    final filter = _statusFilter;
    if (filter != null && updated.status != filter) {
      setState(() {
        _questions = _questions
            .where((q) => q.id != updated.id)
            .toList(growable: false);
      });
    } else {
      _replaceQuestion(updated);
    }
  }

  /// Ответить на вопрос (только Анна). Диалог с полем ответа → отправка →
  /// карточка перерисовывается уже с ответом.
  Future<void> _answerQuestion(QAQuestion question) async {
    final controller = TextEditingController();

    final answer = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.background,
        title: Text('Ответить', style: AppTypography.sectionHeader),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              question.questionText,
              style: AppTypography.caption,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              maxLength: 5000,
              minLines: 3,
              maxLines: 8,
              style: AppTypography.body,
              decoration: InputDecoration(
                hintText: 'Ваш ответ участнице',
                hintStyle: AppTypography.body.copyWith(
                  color: AppColors.textPlaceholder,
                ),
                counterText: '',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
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
            child: const Text('Опубликовать'),
          ),
        ],
      ),
    );

    if (answer == null || answer.isEmpty || !mounted) return;
    if (_statusInFlight.contains(question.id)) return;
    setState(() => _statusInFlight.add(question.id));

    try {
      final updated = await ref.read(qaAdminServiceProvider).setStatus(
            questionId: question.id,
            status: QAStatus.answered,
            answerText: answer,
          );
      if (!mounted) return;
      _applyStatusUpdate(updated);
      _showSnack('Ответ опубликован');
    } catch (e) {
      if (!mounted) return;
      _showSnack(
        userMessageFor(e, fallback: 'Не удалось отправить ответ'),
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() => _statusInFlight.remove(question.id));
      }
    }
  }

  /// Пожаловаться на автора чужого вопроса (Apple Guideline 1.2, UGC).
  /// Шторка чата завязана на ChatMessage, поэтому здесь минимальный диалог
  /// с теми же причинами; отправка — тем же сервисом POST /users/:id/report.
  Future<void> _reportQuestion(QAQuestion question) async {
    const reasons = <Map<String, String>>[
      {'code': 'spam', 'label': 'Спам'},
      {'code': 'inappropriate', 'label': 'Неуместный контент'},
      {'code': 'offensive', 'label': 'Оскорбления'},
      {'code': 'copyright', 'label': 'Нарушение авторских прав'},
      {'code': 'other', 'label': 'Другое'},
    ];

    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.background,
        title: Text('Пожаловаться', style: AppTypography.sectionHeader),
        contentPadding: const EdgeInsets.symmetric(vertical: 8),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final r in reasons)
              ListTile(
                title: Text(r['label']!, style: AppTypography.bodyMedium),
                onTap: () => Navigator.of(ctx).pop(r['code']),
              ),
          ],
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
        ],
      ),
    );
    if (reason == null || !mounted) return;

    try {
      await ref.read(blockServiceProvider).reportUser(
            userId: question.askedBy.id,
            reason: reason,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Жалоба отправлена. Мы рассмотрим её в ближайшее время'),
        backgroundColor: AppColors.success,
      ));
    } on DioException catch (e) {
      if (!mounted) return;
      final code = ClubApiService.errorCodeFromException(e);
      final msg = code == 'DUPLICATE_KEY'
          ? 'Вы уже отправляли жалобу на этого участника'
          : 'Не удалось отправить жалобу';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Первая загрузка у участницы — спиннер на весь таб (как раньше).
    // У Анны панель сортировки/фильтра остаётся видна и во время загрузки.
    if (_isLoading && !_isAdmin) {
      return _loader();
    }

    if (_hasError && !_isAdmin) {
      return ErrorView(
        message: 'Не удалось загрузить вопросы',
        onRetry: () {
          setState(() => _isLoading = true);
          _load();
        },
      );
    }

    return Container(
      color: AppColors.background,
      child: Column(
        children: [
          if (_isAdmin)
            _AdminControls(
              sort: _sort,
              statusFilter: _statusFilter,
              onSortChanged: _setSort,
              onStatusChanged: _setStatusFilter,
            ),
          Expanded(child: _listArea()),
          _bottomBar(),
        ],
      ),
    );
  }

  Widget _loader() {
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

  Widget _listArea() {
    if (_isLoading) return _loader();

    if (_hasError) {
      return ErrorView(
        message: 'Не удалось загрузить вопросы',
        onRetry: () {
          setState(() => _isLoading = true);
          _load();
        },
      );
    }

    if (_questions.isEmpty) {
      return _EmptyQA(filtered: _isAdmin && _statusFilter != null);
    }

    return RefreshIndicator(
      color: AppColors.terracotta,
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
        itemCount: _questions.length,
        itemBuilder: (_, i) {
          final q = _questions[i];
          final busy = _statusInFlight.contains(q.id);
          return _QuestionCard(
            question: q,
            isAdmin: _isAdmin,
            // Анна видит число, но «Тоже интересно» жмут участницы.
            onInterest: _isAdmin ? null : () => _toggleInterest(q),
            onAnswer: _isAdmin && q.status != QAStatus.answered && !busy
                ? () => _answerQuestion(q)
                : null,
            // Жалоба — только на ЧУЖОЙ вопрос (long-press).
            onReport: q.askedBy.id.isNotEmpty && q.askedBy.id != _currentUserId
                ? () => _reportQuestion(q)
                : null,
          );
        },
      ),
    );
  }

  Widget _bottomBar() {
    // — Кнопка «Задать вопрос» — только когда можно постить —
    if (widget.access.canPost) {
      final remaining = _remainingThisWeek;
      final limitReached = remaining != null && remaining <= 0;
      final String? caption = limitReached
          ? 'Новые вопросы — с понедельника'
          : remaining != null
              ? 'Осталось $remaining из $_weeklyLimit на этой неделе'
              : null;

      return SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Opacity(
                opacity: limitReached ? 0.5 : 1.0,
                child: AppButton(
                  text: 'Задать вопрос',
                  onPressed: limitReached ? null : _openAskSheet,
                ),
              ),
              if (caption != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    caption,
                    style: AppTypography.small,
                    textAlign: TextAlign.center,
                  ),
                ),
            ],
          ),
        ),
      );
    }

    return SafeArea(
      top: false,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
        decoration: BoxDecoration(
          color: AppColors.surfaceLight,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.archive_outlined,
              size: 18,
              color: AppColors.textTertiary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                widget.access.kind == ClubAccessKind.archive
                    ? 'В архивном режиме нельзя задавать вопросы'
                    : 'Задавать вопросы можно только с подпиской',
                style: AppTypography.caption,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Панель Анны (D8): «Популярные / Новые» и фильтр по статусу.
class _AdminControls extends StatelessWidget {
  const _AdminControls({
    required this.sort,
    required this.statusFilter,
    required this.onSortChanged,
    required this.onStatusChanged,
  });

  final String sort;
  final QAStatus? statusFilter;
  final ValueChanged<String> onSortChanged;
  final ValueChanged<QAStatus?> onStatusChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
      decoration: BoxDecoration(
        color: AppColors.background,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              _Pill(
                label: 'Популярные',
                selected: sort == 'interest',
                onTap: () => onSortChanged('interest'),
              ),
              const SizedBox(width: 8),
              _Pill(
                label: 'Новые',
                selected: sort == 'new',
                onTap: () => onSortChanged('new'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final f in _statusFilters) ...[
                  _Pill(
                    label: f.$2,
                    selected: statusFilter == f.$1,
                    outlined: true,
                    onTap: () => onStatusChanged(f.$1),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Переключатель-«таблетка». selected — залит винным; outlined — для
/// фильтра (светлая заливка вместо сплошной).
class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.selected,
    required this.onTap,
    this.outlined = false,
  });

  final String label;
  final bool selected;
  final bool outlined;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color fg;
    if (selected) {
      bg = outlined
          ? AppColors.terracotta.withValues(alpha: 0.08)
          : AppColors.terracotta;
      fg = outlined ? AppColors.terracotta : Colors.white;
    } else {
      bg = AppColors.surfaceMedium;
      fg = AppColors.textSecondary;
    }

    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: selected && outlined
                ? Border.all(color: AppColors.terracotta)
                : null,
          ),
          child: Text(
            label,
            style: AppTypography.smallMedium.copyWith(color: fg),
          ),
        ),
      ),
    );
  }
}

/// Карточка одного вопроса: статус, текст, автор, ответ Анны (если есть),
/// «Тоже интересно · N» и — у Анны — «Ответить».
class _QuestionCard extends StatelessWidget {
  const _QuestionCard({
    required this.question,
    required this.isAdmin,
    this.onInterest,
    this.onAnswer,
    this.onReport,
  });
  final QAQuestion question;
  final bool isAdmin;

  /// Тап «Тоже интересно». null — только число (у Анны).
  final VoidCallback? onInterest;

  /// Анна: «Ответить» (null — кнопки нет).
  final VoidCallback? onAnswer;

  /// Долгое нажатие → жалоба. null для своих вопросов.
  final VoidCallback? onReport;

  @override
  Widget build(BuildContext context) {
    final showBadge = question.status != QAStatus.open || isAdmin;

    return GestureDetector(
      onLongPress: onReport,
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: AppColors.cardBackground,
          borderRadius: BorderRadius.circular(14),
          boxShadow: AppColors.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showBadge) ...[
              _StatusBadge(status: question.status),
              const SizedBox(height: 8),
            ],
            Text(question.questionText, style: AppTypography.bodyMedium),
            const SizedBox(height: 4),
            Text(
              '${question.askedBy.name} · ${_fmtDate(question.createdAt)}',
              style: AppTypography.small,
            ),
            if (question.isAnswered) ...[
              const SizedBox(height: 10),
              _AnswerBlock(
                answer: question.answerText!,
                answeredAt: question.answeredAt,
                answeredBy: question.answeredBy?.name ?? 'Анна Бусел',
              ),
            ],
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                _InterestButton(
                  count: question.interestCount,
                  selected: question.interestedByMe,
                  onTap: onInterest,
                ),
                if (onAnswer != null)
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.terracotta,
                      visualDensity: VisualDensity.compact,
                    ),
                    onPressed: onAnswer,
                    icon: const Icon(Icons.reply, size: 18),
                    label: const Text('Ответить'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _fmtDate(DateTime dt) {
    final l = dt.toLocal();
    final dd = l.day.toString().padLeft(2, '0');
    final mm = l.month.toString().padLeft(2, '0');
    return '$dd.$mm';
  }
}

/// «Тоже интересно · N». Подсвечена, если я уже отметила.
class _InterestButton extends StatelessWidget {
  const _InterestButton({
    required this.count,
    required this.selected,
    this.onTap,
  });
  final int count;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final fg = selected ? AppColors.terracotta : AppColors.textSecondary;
    final bg = selected
        ? AppColors.terracotta.withValues(alpha: 0.08)
        : AppColors.surfaceLight;

    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? AppColors.terracotta : AppColors.border,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                selected ? Icons.favorite : Icons.favorite_border,
                size: 16,
                color: fg,
              ),
              const SizedBox(width: 6),
              Text(
                'Тоже интересно · $count',
                style: AppTypography.smallMedium.copyWith(color: fg),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Плашка статуса: «Анна ответила»; у Анны ещё «Ждёт».
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final QAStatus status;

  @override
  Widget build(BuildContext context) {
    final (String label, Color color, Color bg) = switch (status) {
      QAStatus.podcast => (
          'Ждёт ответа',
          AppColors.terracotta,
          AppColors.terracotta.withValues(alpha: 0.08),
        ),
      QAStatus.answered => (
          'Анна ответила',
          AppColors.success,
          const Color(0x1A2D7F5E),
        ),
      QAStatus.open => (
          'Ждёт',
          AppColors.textTertiary,
          AppColors.surfaceMedium,
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        label,
        style: AppTypography.micro.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// Блок ответа Анны внутри карточки.
/// Всегда во всю ширину карточки — короткий ответ не должен «съёживаться».
class _AnswerBlock extends StatelessWidget {
  const _AnswerBlock({
    required this.answer,
    required this.answeredBy,
    this.answeredAt,
  });
  final String answer;
  final String answeredBy;
  final DateTime? answeredAt;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(10),
        border: Border(left: BorderSide(color: AppColors.terracotta, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            answeredBy,
            style: AppTypography.smallMedium.copyWith(
              color: AppColors.terracotta,
            ),
          ),
          const SizedBox(height: 6),
          Text(answer, style: AppTypography.body),
        ],
      ),
    );
  }
}

/// Пустой раздел — пока никто не задал вопрос (или пусто по фильтру у Анны).
class _EmptyQA extends StatelessWidget {
  const _EmptyQA({this.filtered = false});
  final bool filtered;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.help_outline,
              size: 48,
              color: AppColors.textTertiary,
            ),
            const SizedBox(height: 12),
            Text(
              filtered ? 'Таких вопросов нет' : 'Пока нет вопросов',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
            if (!filtered) ...[
              const SizedBox(height: 4),
              Text(
                'Задайте Анне вопрос о книге',
                style: AppTypography.caption,
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
