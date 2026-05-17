import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../services/club_api_service.dart';
import 'voice_recorder.dart';

/// Поле ввода чата клуба.
///
/// Поведение:
/// - canPost=true (активная подписка, не мьют) → поле + кнопка фото + send
/// - canPost=false:
///   - kind=archive → серая полоска «Архив — чтение разрешено»
///   - isMuted=true → «Вы заблокированы в чате до DD.MM HH:mm»
///   - иначе → пустой контейнер (не должно случаться, но защитно)
///
/// Лимит на сервере — 1000 символов; counter показываем когда осталось ≤50.
///
/// onAttachImage вызывается при тапе на кнопку-скрепку (выбор фото).
/// Сам выбор/загрузку делает родитель (ChatTab) — инпут только сигналит.
///
/// Reply (4.8): когда replyToName != null — над полем показывается
/// компактная плашка «Ответ на <имя>: <текст>» с крестиком отмены
/// (как в Telegram). onCancelReply сбрасывает reply в родителе.
///
/// Mentions (4.9): при вводе '@' появляется оверлей со списком кого можно
/// упомянуть (mentionable — обычно одна Анна). Фильтруется по тексту после
/// '@'. Тап вставляет '@Имя ' и запоминает userId. onSend отдаёт текст +
/// список userId реально упомянутых (чьё '@Имя' осталось в тексте).
///
/// Voice (4.12): если isAdmin && onSendVoice != null — рядом со скрепкой
/// кнопка-микрофон (VoiceRecorder). Когда идёт запись — VoiceRecorder
/// растягивается на ВСЮ строку (Expanded), скрепка/текстфилд/кнопка
/// отправки скрыты. Состояние записи приходит из VoiceRecorder через
/// onRecordingStateChanged. Только Анна-admin — для остальных кнопки нет.
class ChatInput extends StatefulWidget {
  const ChatInput({
    super.key,
    required this.canPost,
    required this.isMuted,
    required this.isArchive,
    required this.onSend,
    required this.onAttachImage,
    this.mentionable = const [],
    this.isAdmin = false,
    this.onSendVoice,
    this.mutedUntil,
    this.replyToName,
    this.replyToText,
    this.onCancelReply,
  });

  final bool canPost;
  final bool isMuted;
  final bool isArchive;
  final DateTime? mutedUntil;

  /// Текст + userId упомянутых (4.9). Родитель шлёт mentions на бэк.
  final void Function(String text, List<String> mentions) onSend;
  final VoidCallback onAttachImage;

  /// Кого можно упомянуть через @ (обычно одна Анна). Пусто — автокомплита нет.
  final List<MentionableUser> mentionable;

  /// Текущий юзер — админ (Анна). Только тогда показываем запись голосовых.
  final bool isAdmin;

  /// Колбэк отправки голосового (4.12): путь к .m4a, длительность, waveform.
  /// null или !isAdmin → кнопки записи нет (правило: только Анна).
  final void Function(String filePath, int durationSec, List<int> waveform)?
      onSendVoice;

  /// Имя автора сообщения на которое отвечаем (null = не в режиме ответа).
  final String? replyToName;

  /// Краткий текст/тип сообщения на которое отвечаем (для плашки).
  final String? replyToText;

  /// Сброс режима ответа (крестик на плашке).
  final VoidCallback? onCancelReply;

  @override
  State<ChatInput> createState() => _ChatInputState();
}

class _ChatInputState extends State<ChatInput> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  bool _hasText = false;

  /// Идёт запись голосового — приходит из VoiceRecorder через колбэк.
  /// В этом режиме строка ввода полностью отдана VoiceRecorder (Expanded),
  /// скрепка/текстфилд/кнопка скрыты (иначе Spacer в VoiceRecorder падал
  /// на unbounded width — RenderFlex assertion).
  bool _isRecordingVoice = false;

  /// Кого юзер реально упомянул (имя → userId). При отправке оставляем
  /// только тех, чьё «@Имя» осталось в тексте (вдруг стёр).
  final Map<String, String> _mentionedByName = {};

  /// Текущий фильтр автокомплита (текст после '@'), null = оверлей скрыт.
  String? _mentionQuery;

  static const int _maxChars = 1000;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onTextChanged);
  }

  void _onTextChanged() {
    final has = _controller.text.trim().isNotEmpty;
    if (has != _hasText) setState(() => _hasText = has);
    _updateMentionQuery();
  }

  /// Определяем, печатает ли юзер сейчас @-упоминание: ищем последний '@'
  /// перед курсором, за которым идут только буквы (без пробела).
  void _updateMentionQuery() {
    if (widget.mentionable.isEmpty) return;
    final sel = _controller.selection;
    if (!sel.isValid || sel.start < 0) {
      _setMentionQuery(null);
      return;
    }
    final textBefore = _controller.text.substring(0, sel.start);
    final at = textBefore.lastIndexOf('@');
    if (at == -1) {
      _setMentionQuery(null);
      return;
    }
    final after = textBefore.substring(at + 1);
    // Прерываем если после @ есть пробел/перевод строки (упоминание кончилось).
    if (after.contains(RegExp(r'\s'))) {
      _setMentionQuery(null);
      return;
    }
    _setMentionQuery(after);
  }

  void _setMentionQuery(String? q) {
    if (q != _mentionQuery) {
      setState(() => _mentionQuery = q);
    }
  }

  /// Вставка выбранного упоминания: заменяем «@частичный_ввод» на «@Имя ».
  void _pickMention(MentionableUser u) {
    final sel = _controller.selection;
    final fullText = _controller.text;
    final caret = sel.isValid ? sel.start : fullText.length;
    final textBefore = fullText.substring(0, caret);
    final at = textBefore.lastIndexOf('@');
    if (at == -1) return;

    final newBefore = '${textBefore.substring(0, at)}@${u.name} ';
    final newText = newBefore + fullText.substring(caret);
    _controller.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: newBefore.length),
    );
    _mentionedByName[u.name] = u.id;
    _setMentionQuery(null);
  }

  /// userId реально упомянутых: тех, чьё «@Имя» осталось в финальном тексте.
  List<String> _resolveMentions(String text) {
    final ids = <String>[];
    _mentionedByName.forEach((name, id) {
      if (text.contains('@$name')) ids.add(id);
    });
    return ids;
  }

  @override
  void didUpdateWidget(covariant ChatInput old) {
    super.didUpdateWidget(old);
    if (widget.replyToName != null && old.replyToName == null) {
      _focusNode.requestFocus();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _handleSend() {
    final text = _controller.text.trim();
    if (text.isEmpty || text.length > _maxChars) return;
    final mentions = _resolveMentions(text);
    widget.onSend(text, mentions);
    _controller.clear();
    _mentionedByName.clear();
    _setMentionQuery(null);
  }

  /// Отфильтрованный список для автокомплита по текущему _mentionQuery.
  List<MentionableUser> get _filteredMentionable {
    final q = _mentionQuery;
    if (q == null) return const [];
    if (q.isEmpty) return widget.mentionable;
    final lower = q.toLowerCase();
    return widget.mentionable
        .where((m) => m.name.toLowerCase().contains(lower))
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.canPost) {
      return _ReadOnlyBanner(
        isArchive: widget.isArchive,
        isMuted: widget.isMuted,
        mutedUntil: widget.mutedUntil,
      );
    }

    final remaining = _maxChars - _controller.text.length;
    final showCounter = remaining <= 50 && !_isRecordingVoice;
    final isReplying = widget.replyToName != null;
    final suggestions = _isRecordingVoice ? const <MentionableUser>[] : _filteredMentionable;

    // Запись голосовых — только Анна-admin (продуктовое правило 4.12).
    final canRecordVoice =
        widget.isAdmin && widget.onSendVoice != null;

    // Единый инстанс VoiceRecorder — чтобы при перестройке layout
    // (свёрнут ↔ запись) не пересоздавался State и не терялась запись.
    final voiceRecorder = canRecordVoice
        ? VoiceRecorder(
            onSend: widget.onSendVoice!,
            onRecordingStateChanged: (rec) {
              if (rec != _isRecordingVoice) {
                setState(() => _isRecordingVoice = rec);
              }
            },
          )
        : null;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // — Оверлей автокомплита @упоминаний —
            if (suggestions.isNotEmpty)
              Container(
                constraints: const BoxConstraints(maxHeight: 180),
                decoration: BoxDecoration(
                  color: AppColors.cardBackground,
                  border: Border(
                    bottom: BorderSide(color: AppColors.border),
                  ),
                ),
                child: ListView.builder(
                  shrinkWrap: true,
                  padding: EdgeInsets.zero,
                  itemCount: suggestions.length,
                  itemBuilder: (ctx, i) {
                    final u = suggestions[i];
                    return ListTile(
                      dense: true,
                      leading: CircleAvatar(
                        radius: 16,
                        backgroundColor: AppColors.terracotta,
                        child: Text(
                          u.name.isNotEmpty
                              ? u.name.characters.first.toUpperCase()
                              : '?',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      title: Text(u.name, style: AppTypography.bodyMedium),
                      subtitle: u.isAdmin
                          ? Text(
                              'Ведущая клуба',
                              style: AppTypography.micro.copyWith(
                                color: AppColors.terracotta,
                              ),
                            )
                          : null,
                      onTap: () => _pickMention(u),
                    );
                  },
                ),
              ),

            // — Плашка «Ответ на …» — (скрыта во время записи голосового)
            if (isReplying && !_isRecordingVoice)
              Container(
                padding: const EdgeInsets.fromLTRB(12, 8, 8, 4),
                child: Row(
                  children: [
                    Container(
                      width: 3,
                      height: 32,
                      decoration: BoxDecoration(
                        color: AppColors.terracotta,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Ответ ${widget.replyToName}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.micro.copyWith(
                              color: AppColors.terracotta,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            widget.replyToText ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.small.copyWith(
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      color: AppColors.textTertiary,
                      onPressed: widget.onCancelReply,
                    ),
                  ],
                ),
              ),

            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (showCounter)
                    Padding(
                      padding: const EdgeInsets.only(right: 60, bottom: 4),
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          '$remaining',
                          style: AppTypography.micro.copyWith(
                            color: remaining < 0
                                ? AppColors.error
                                : AppColors.textTertiary,
                          ),
                        ),
                      ),
                    ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: _isRecordingVoice && voiceRecorder != null
                        // — Режим записи: VoiceRecorder занимает всю строку —
                        ? [Expanded(child: voiceRecorder)]
                        // — Обычный режим: скрепка + поле + (микрофон/отправка) —
                        : [
                            _AttachButton(onTap: widget.onAttachImage),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Container(
                                constraints:
                                    const BoxConstraints(maxHeight: 120),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceLight,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: TextField(
                                  controller: _controller,
                                  focusNode: _focusNode,
                                  minLines: 1,
                                  maxLines: 5,
                                  maxLength: _maxChars,
                                  textInputAction: TextInputAction.newline,
                                  style: AppTypography.body,
                                  decoration: InputDecoration(
                                    hintText: 'Сообщение...',
                                    hintStyle: AppTypography.body.copyWith(
                                      color: AppColors.textPlaceholder,
                                    ),
                                    border: InputBorder.none,
                                    counterText: '',
                                    contentPadding:
                                        const EdgeInsets.symmetric(
                                      horizontal: 14,
                                      vertical: 10,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            // Голосовое (4.12) — только Анна-admin. Пусто —
                            // микрофон; есть текст — кнопка отправки текста.
                            if (canRecordVoice &&
                                !_hasText &&
                                voiceRecorder != null)
                              voiceRecorder
                            else
                              _SendButton(
                                enabled: _hasText,
                                onTap: _handleSend,
                              ),
                          ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Кнопка-скрепка для прикрепления фото. Открывает выбор источника
/// (галерея/камера) — реализовано в родителе через onAttachImage.
class _AttachButton extends StatelessWidget {
  const _AttachButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: const SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            Icons.add_photo_alternate_outlined,
            size: 24,
            color: AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

/// Круглая кнопка отправки. Серая когда нет текста, terracotta когда есть.
class _SendButton extends StatelessWidget {
  const _SendButton({required this.enabled, required this.onTap});
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: enabled ? AppColors.terracotta : AppColors.surfaceMedium,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: enabled ? onTap : null,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            Icons.arrow_upward,
            size: 22,
            color: enabled ? Colors.white : AppColors.textTertiary,
          ),
        ),
      ),
    );
  }
}

/// Read-only баннер вместо поля ввода.
class _ReadOnlyBanner extends StatelessWidget {
  const _ReadOnlyBanner({
    required this.isArchive,
    required this.isMuted,
    required this.mutedUntil,
  });
  final bool isArchive;
  final bool isMuted;
  final DateTime? mutedUntil;

  @override
  Widget build(BuildContext context) {
    String message;
    IconData icon;

    if (isMuted && mutedUntil != null) {
      final local = mutedUntil!.toLocal();
      final dd = local.day.toString().padLeft(2, '0');
      final mm = local.month.toString().padLeft(2, '0');
      final hh = local.hour.toString().padLeft(2, '0');
      final min = local.minute.toString().padLeft(2, '0');
      message = 'Вы заблокированы в чате до $dd.$mm $hh:$min';
      icon = Icons.volume_off_outlined;
    } else if (isArchive) {
      message = 'Архивный режим — отправка сообщений недоступна';
      icon = Icons.archive_outlined;
    } else {
      message = 'Отправка сообщений недоступна';
      icon = Icons.lock_outline;
    }

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          child: Row(
            children: [
              Icon(icon, size: 18, color: AppColors.textTertiary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(message, style: AppTypography.caption),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
