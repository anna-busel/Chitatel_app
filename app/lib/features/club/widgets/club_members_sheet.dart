import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/plural.dart';

/// Участницы клуба в шапке (UPDATES-PLAN E2, 15.11.2026).
///
/// В шапке клуба — строка «N участниц» + до 5 аватаров внахлёст
/// ([ClubMembersRow]); тап → шторка со списком ([ClubMembersSheet]) с
/// догрузкой страниц при прокрутке; тап по участнице → мини-карточка (аватар,
/// имя). «Написать» не делаем; чужой профиль (F5) подключим позже.
///
/// Сервер: GET /api/club/:clubMonthId/members?page=1 →
/// { count, members: [{ id, name, avatarUrl, isAdmin }], hasMore }, по 50.
/// Путь держим здесь, чтобы не трогать общий api_endpoints.dart.
String _membersPath(String clubMonthId) => '/club/$clubMonthId/members';

/// «участница / участницы / участниц» по числу.
String membersWord(int n) => plural(n, 'участница', 'участницы', 'участниц');

class ClubMember {
  const ClubMember({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.isAdmin = false,
  });

  final String id;
  final String name;
  final String? avatarUrl;

  /// Ведущая клуба (Анна) — бейдж «Ведущая».
  final bool isAdmin;

  factory ClubMember.fromJson(Map<String, dynamic> j) {
    final avatar = j['avatarUrl']?.toString();
    final name = (j['name'] ?? '').toString().trim();
    return ClubMember(
      id: (j['id'] ?? j['_id'] ?? '').toString(),
      name: name.isEmpty ? 'Участница' : name,
      avatarUrl: (avatar == null || avatar.isEmpty) ? null : avatar,
      isAdmin: j['isAdmin'] == true,
    );
  }
}

class ClubMembersPage {
  const ClubMembersPage({
    required this.count,
    required this.members,
    required this.hasMore,
  });

  final int count;
  final List<ClubMember> members;
  final bool hasMore;
}

/// Одна страница участниц. Бросает исключение при ошибке сети/формата.
Future<ClubMembersPage> fetchClubMembersPage(
  ApiClient api,
  String clubMonthId,
  int page,
) async {
  final response = await api.dio.get(
    _membersPath(clubMonthId),
    queryParameters: {'page': page},
  );
  final body = response.data;
  if (body is! Map) {
    throw const FormatException('members: bad body');
  }
  // Обычно ответ в обёртке { success, data: {...} }; на всякий случай
  // принимаем и плоский объект.
  final rawData = body['data'];
  final Map data = rawData is Map ? rawData : body;

  final rawMembers = data['members'];
  final members = <ClubMember>[];
  if (rawMembers is List) {
    for (final m in rawMembers) {
      if (m is Map) {
        members.add(ClubMember.fromJson(
          m.map((k, v) => MapEntry(k.toString(), v)),
        ));
      }
    }
  }
  final count = (data['count'] as num?)?.toInt() ?? members.length;
  return ClubMembersPage(
    count: count,
    members: members,
    hasMore: data['hasMore'] == true,
  );
}

/// Первая страница участниц для шапки. Ошибка → null (шапка без строки),
/// загрузку клуба не блокирует. autoDispose: при каждом входе в клуб
/// перечитываем (сервер кэширует счётчик сам).
final clubMembersPreviewProvider = FutureProvider.autoDispose
    .family<ClubMembersPage?, String>((ref, clubMonthId) async {
  if (clubMonthId.isEmpty) return null;
  try {
    return await fetchClubMembersPage(
      ref.read(apiClientProvider),
      clubMonthId,
      1,
    );
  } catch (e) {
    if (kDebugMode) {
      debugPrint('[ClubMembers] preview failed: $e');
    }
    return null;
  }
});

/// Строка в шапке клуба: аватары внахлёст + «N участниц» + chevron.
/// Пока грузится, при ошибке или если участниц 0 — ничего не рисует.
class ClubMembersRow extends ConsumerWidget {
  const ClubMembersRow({super.key, required this.clubMonthId});

  final String clubMonthId;

  static const int _maxAvatars = 5;
  static const double _avatarSize = 26;
  static const double _overlap = 8;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final page =
        ref.watch(clubMembersPreviewProvider(clubMonthId)).valueOrNull;
    if (page == null || page.count <= 0) return const SizedBox.shrink();

    final shown = page.members.take(_maxAvatars).toList(growable: false);
    final step = _avatarSize - _overlap;
    final stackWidth =
        shown.isEmpty ? 0.0 : _avatarSize + step * (shown.length - 1);

    return Material(
      color: AppColors.background,
      child: InkWell(
        onTap: () => showClubMembersSheet(
          context,
          clubMonthId: clubMonthId,
          initial: page,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 16, 8),
          child: Row(
            children: [
              if (shown.isNotEmpty) ...[
                SizedBox(
                  width: stackWidth,
                  height: _avatarSize,
                  child: Stack(
                    children: [
                      for (var i = 0; i < shown.length; i++)
                        Positioned(
                          left: step * i,
                          top: 0,
                          child: Container(
                            width: _avatarSize,
                            height: _avatarSize,
                            padding: const EdgeInsets.all(1.5),
                            decoration: const BoxDecoration(
                              color: AppColors.background,
                              shape: BoxShape.circle,
                            ),
                            child: MemberAvatar(
                              name: shown[i].name,
                              avatarUrl: shown[i].avatarUrl,
                              isAdmin: shown[i].isAdmin,
                              size: _avatarSize - 3,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  '${page.count} ${membersWord(page.count)}',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.textSecondary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const Icon(
                Icons.chevron_right,
                size: 18,
                color: AppColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Открыть шторку со списком участниц. `initial` — уже загруженная первая
/// страница (из шапки), чтобы не запрашивать её второй раз.
Future<void> showClubMembersSheet(
  BuildContext context, {
  required String clubMonthId,
  ClubMembersPage? initial,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.background,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => ClubMembersSheet(
      clubMonthId: clubMonthId,
      initial: initial,
    ),
  );
}

/// Шторка «Участницы»: список с догрузкой страниц по 50 при прокрутке.
class ClubMembersSheet extends ConsumerStatefulWidget {
  const ClubMembersSheet({
    super.key,
    required this.clubMonthId,
    this.initial,
  });

  final String clubMonthId;
  final ClubMembersPage? initial;

  @override
  ConsumerState<ClubMembersSheet> createState() => _ClubMembersSheetState();
}

class _ClubMembersSheetState extends ConsumerState<ClubMembersSheet> {
  final List<ClubMember> _members = [];
  int _count = 0;
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    final initial = widget.initial;
    if (initial != null) {
      _members.addAll(initial.members);
      _count = initial.count;
      _page = 1;
      _hasMore = initial.hasMore;
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadMore());
    }
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final next = await fetchClubMembersPage(
        ref.read(apiClientProvider),
        widget.clubMonthId,
        _page + 1,
      );
      if (!mounted) return;
      setState(() {
        // Защита от дублей, если список сдвинулся между страницами.
        final known = _members.map((m) => m.id).toSet();
        _members.addAll(next.members.where((m) => !known.contains(m.id)));
        _count = next.count;
        _page += 1;
        _hasMore = next.hasMore && next.members.isNotEmpty;
        _loading = false;
      });
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ClubMembers] page ${_page + 1} failed: $e');
      }
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = true;
      });
    }
  }

  bool _onScroll(ScrollNotification n) {
    if (n.metrics.pixels >= n.metrics.maxScrollExtent - 300 &&
        !_loading &&
        !_error &&
        _hasMore) {
      _loadMore();
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      builder: (ctx, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              // — Drag handle —
              Container(
                margin: const EdgeInsets.only(top: 8, bottom: 4),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // — Заголовок —
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 8, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _count > 0
                            ? '$_count ${membersWord(_count)}'
                            : 'Участницы',
                        style: AppTypography.serifSectionTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close,
                          color: AppColors.textTertiary),
                      onPressed: () => Navigator.of(ctx).pop(),
                    ),
                  ],
                ),
              ),

              Expanded(child: _buildList(scrollController)),
            ],
          ),
        );
      },
    );
  }

  Widget _buildList(ScrollController scrollController) {
    if (_members.isEmpty) {
      if (_error) {
        return _RetryView(onRetry: _loadMore);
      }
      if (_loading || _hasMore) {
        return const Center(
          child: CircularProgressIndicator(
            color: AppColors.terracotta,
            strokeWidth: 2.5,
          ),
        );
      }
      return Center(
        child: Text(
          'Пока никого нет',
          style: AppTypography.body.copyWith(color: AppColors.textSecondary),
        ),
      );
    }

    // Последняя строка — индикатор догрузки / «Повторить» при ошибке.
    final showFooter = _hasMore || _error;
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: ListView.builder(
        controller: scrollController,
        padding: const EdgeInsets.only(bottom: 24),
        itemCount: _members.length + (showFooter ? 1 : 0),
        itemBuilder: (context, i) {
          if (i >= _members.length) {
            if (_error) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: _RetryView(onRetry: _loadMore),
              );
            }
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    color: AppColors.terracotta,
                    strokeWidth: 2,
                  ),
                ),
              ),
            );
          }
          final m = _members[i];
          return ListTile(
            onTap: () => _showMemberCard(context, m),
            contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            leading: MemberAvatar(
              name: m.name,
              avatarUrl: m.avatarUrl,
              isAdmin: m.isAdmin,
              size: 40,
            ),
            title: Row(
              children: [
                Flexible(
                  child: Text(
                    m.name,
                    style: AppTypography.body,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (m.isAdmin) ...[
                  const SizedBox(width: 8),
                  const _HostBadge(),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Мини-карточка участницы: аватар и имя. «Написать» не делаем (E2).
void _showMemberCard(BuildContext context, ClubMember m) {
  showDialog<void>(
    context: context,
    builder: (ctx) => Dialog(
      backgroundColor: AppColors.cardBackground,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            MemberAvatar(
              name: m.name,
              avatarUrl: m.avatarUrl,
              isAdmin: m.isAdmin,
              size: 88,
            ),
            const SizedBox(height: 14),
            Text(
              m.name,
              style: AppTypography.serifSectionTitle,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            if (m.isAdmin) ...[
              const SizedBox(height: 8),
              const _HostBadge(),
            ],
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(
                'Закрыть',
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.terracotta,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Бейдж «Ведущая».
class _HostBadge extends StatelessWidget {
  const _HostBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.terracotta.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        'Ведущая',
        style: AppTypography.small.copyWith(color: AppColors.terracotta),
      ),
    );
  }
}

class _RetryView extends StatelessWidget {
  const _RetryView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Не удалось загрузить список',
            style: AppTypography.body.copyWith(color: AppColors.textSecondary),
          ),
          TextButton(
            onPressed: onRetry,
            child: Text(
              'Повторить',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.terracotta,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Круглый аватар участницы: фото или винный круг с инициалом (как в чате).
class MemberAvatar extends StatelessWidget {
  const MemberAvatar({
    super.key,
    required this.name,
    this.avatarUrl,
    this.isAdmin = false,
    this.size = 32,
  });

  final String name;
  final String? avatarUrl;
  final bool isAdmin;
  final double size;

  // Палитра инициалов — только бренд (как _Avatar в chat_message_bubble).
  static const List<Color> _palette = [
    AppColors.terracotta,
    AppColors.coral,
  ];

  Color _color() {
    if (isAdmin || name.isEmpty) return _palette[0];
    var sum = 0;
    for (final c in name.codeUnits) {
      sum = (sum + c) & 0x7fffffff;
    }
    return _palette[sum % _palette.length];
  }

  String _initial() {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '?';
    return trimmed.characters.first.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: _color(), shape: BoxShape.circle),
      child: Text(
        _initial(),
        style: TextStyle(
          color: Colors.white,
          fontSize: size * 0.42,
          fontWeight: FontWeight.w700,
        ),
      ),
    );

    final url = avatarUrl;
    if (url == null || url.isEmpty) return fallback;

    return ClipOval(
      child: CachedNetworkImage(
        imageUrl: url,
        width: size,
        height: size,
        fit: BoxFit.cover,
        placeholder: (_, __) => fallback,
        errorWidget: (_, __, ___) => fallback,
      ),
    );
  }
}
