import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../club/services/block_service.dart';

/// Экран «Заблокированные» (Профиль → Заблокированные участницы).
///
/// Apple Guideline 1.2 требует не только возможность заблокировать, но и
/// возможность отменить блокировку — иначе она необратима. Блокировка делается
/// в чате (шторка жалобы), снимается здесь.
///
/// Список берём с сервера при каждом открытии (могли блокировать с другого
/// устройства), локальный блок-лист (blockedIdsProvider) синхронизируем — чтобы
/// чат сразу перестал прятать разблокированную участницу.
class BlockedUsersScreen extends ConsumerStatefulWidget {
  const BlockedUsersScreen({super.key});

  @override
  ConsumerState<BlockedUsersScreen> createState() => _BlockedUsersScreenState();
}

class _BlockedUsersScreenState extends ConsumerState<BlockedUsersScreen> {
  List<BlockedUser> _users = const [];
  bool _isLoading = true;
  bool _hasError = false;
  final Set<String> _busyIds = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final users = await ref.read(blockServiceProvider).fetchBlocked();
      if (!mounted) return;
      setState(() {
        _users = users;
        _isLoading = false;
        _hasError = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _hasError = true;
      });
    }
  }

  Future<void> _unblock(BlockedUser user) async {
    if (_busyIds.contains(user.id)) return;
    setState(() => _busyIds.add(user.id));

    try {
      // Через нотифаер — он же обновит локальный блок-лист, и чат сразу
      // перестанет прятать сообщения этой участницы.
      await ref.read(blockedIdsProvider.notifier).unblock(user.id);
      if (!mounted) return;
      setState(() {
        _users = _users.where((u) => u.id != user.id).toList();
        _busyIds.remove(user.id);
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${user.name} разблокирована'),
        backgroundColor: AppColors.textPrimary,
      ));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busyIds.remove(user.id));
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Не удалось разблокировать. Попробуйте ещё раз'),
        backgroundColor: AppColors.error,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('Заблокированные', style: AppTypography.screenTitle),
      ),
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(
          color: AppColors.terracotta,
          strokeWidth: 2.5,
        ),
      );
    }

    if (_hasError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Не удалось загрузить список',
                style: AppTypography.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () {
                  setState(() => _isLoading = true);
                  _load();
                },
                child: Text(
                  'Повторить',
                  style: AppTypography.bodyMedium.copyWith(
                    color: AppColors.terracotta,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_users.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.block_outlined,
                size: 48,
                color: AppColors.textTertiary,
              ),
              const SizedBox(height: 12),
              Text(
                'Нет заблокированных',
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text(
                'Заблокировать участницу можно в чате клуба — '
                'долгое нажатие на сообщение → «Пожаловаться»',
                style: AppTypography.caption,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.terracotta,
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: _users.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (_, i) {
          final user = _users[i];
          final busy = _busyIds.contains(user.id);
          return ListTile(
            leading: CircleAvatar(
              backgroundColor: AppColors.surfaceMedium,
              backgroundImage: (user.avatarUrl != null &&
                      user.avatarUrl!.isNotEmpty)
                  ? NetworkImage(user.avatarUrl!)
                  : null,
              child: (user.avatarUrl == null || user.avatarUrl!.isEmpty)
                  ? Text(
                      user.name.isNotEmpty
                          ? user.name.characters.first.toUpperCase()
                          : '?',
                      style: AppTypography.bodyMedium,
                    )
                  : null,
            ),
            title: Text(user.name, style: AppTypography.body),
            subtitle: Text(
              'Её сообщения скрыты в чате',
              style: AppTypography.caption,
            ),
            trailing: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.terracotta,
                    ),
                  )
                : TextButton(
                    onPressed: () => _unblock(user),
                    child: Text(
                      'Разблокировать',
                      style: AppTypography.captionMedium.copyWith(
                        color: AppColors.terracotta,
                      ),
                    ),
                  ),
          );
        },
      ),
    );
  }
}
