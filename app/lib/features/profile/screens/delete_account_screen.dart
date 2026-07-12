import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../auth/providers/auth_provider.dart';
import '../services/profile_service.dart';

/// Удаление аккаунта (экран 4.34, задача 6.2 / блок A2 аудита).
///
/// 🔴 Apple Guideline 5.1.1(v): если в приложении можно завести аккаунт, его
/// должно быть можно удалить прямо из приложения. Экран существовал заглушкой,
/// серверного флоу не было вовсе — теперь есть DELETE /api/auth/account.
///
/// Защита от случайного удаления: нужно вручную ввести слово «УДАЛИТЬ»
/// (сервер тоже требует это слово в теле запроса — одной кнопкой не снести).
///
/// Что удаляется, честно перечислено на экране: цитаты, разборы ИИ, недельные
/// отчёты, прогресс. Сообщения в чате остаются, но становятся анонимными —
/// иначе у других участниц рассыпались бы ответы на них.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() =>
      _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  static const String _confirmWord = 'УДАЛИТЬ';

  final TextEditingController _controller = TextEditingController();
  bool _isDeleting = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _canDelete =>
      _controller.text.trim().toUpperCase() == _confirmWord && !_isDeleting;

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.background,
        title: Text('Удалить аккаунт?', style: AppTypography.sectionHeader),
        content: Text(
          'Это действие необратимо. Восстановить цитаты и разборы будет нельзя.',
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
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _isDeleting = true);
    try {
      await ref.read(profileServiceProvider).deleteAccount();
      // Локальные токены больше не действуют — выходим и уводим на вход.
      await ref.read(authProvider.notifier).logout();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Аккаунт удалён'),
        backgroundColor: AppColors.textPrimary,
      ));
      context.go(Routes.login);
    } catch (_) {
      if (!mounted) return;
      setState(() => _isDeleting = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Не удалось удалить аккаунт. Попробуйте позже'),
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
        title: Text('Удаление аккаунта', style: AppTypography.screenTitle),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.warning_amber_rounded,
                        color: AppColors.error,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Что будет удалено',
                        style: AppTypography.bodyMedium,
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const _Bullet('Все ваши цитаты и разборы ИИ'),
                  const _Bullet('Недельные отчёты'),
                  const _Bullet('Прогресс прослушивания'),
                  const _Bullet('Имя, почта и фото профиля'),
                  const SizedBox(height: 10),
                  Text(
                    'Сообщения в чате клуба останутся, но будут показаны без '
                    'вашего имени — на них ссылаются ответы других участниц.',
                    style: AppTypography.caption,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            Text(
              'Подписка не отменяется автоматически. Если она активна, отмените '
              'её в Настройках iPhone → ваш Apple ID → Подписки, иначе списания '
              'продолжатся.',
              style: AppTypography.caption.copyWith(color: AppColors.error),
            ),
            const SizedBox(height: 24),

            Text(
              'Чтобы подтвердить, введите слово $_confirmWord',
              style: AppTypography.bodyMedium,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _controller,
              textCapitalization: TextCapitalization.characters,
              style: AppTypography.body,
              decoration: InputDecoration(
                hintText: _confirmWord,
                hintStyle: AppTypography.body.copyWith(
                  color: AppColors.textPlaceholder,
                ),
                filled: true,
                fillColor: AppColors.cardBackground,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppColors.border),
                ),
              ),
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.error,
                  disabledBackgroundColor: AppColors.surfaceMedium,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                onPressed: _canDelete ? _delete : null,
                child: _isDeleting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Удалить аккаунт навсегда'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('• ', style: AppTypography.body),
          Expanded(child: Text(text, style: AppTypography.body)),
        ],
      ),
    );
  }
}
