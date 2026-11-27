import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/network/network_error.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../../club/services/club_api_service.dart';
import '../providers/profile_provider.dart';

/// Почта, с которой оплачивали (27.11.2026).
///
/// Профиль → «Привязать другую почту». Участница вводит почту, получает код
/// в письме, вводит его — сервер запоминает почту и открывает всё, что на неё
/// оплачено. Нужно, когда почта аккаунта другая (вход через Apple со «Скрыть
/// e-mail», оплата с рабочей почты).
///
/// Тексты нейтральные, без упоминания оплаты вне приложения: так можно и в
/// iOS (3.1.3(b)), и в Android-сборке (Payments policy).
///
/// GET  /api/profile/purchase-email → { emails }
/// POST /api/profile/purchase-email/request { email }
/// POST /api/profile/purchase-email/confirm { email, code }
class PurchaseEmailScreen extends ConsumerStatefulWidget {
  const PurchaseEmailScreen({super.key});

  @override
  ConsumerState<PurchaseEmailScreen> createState() =>
      _PurchaseEmailScreenState();
}

class _PurchaseEmailScreenState extends ConsumerState<PurchaseEmailScreen> {
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  List<String> _linked = const [];
  String? _sentTo;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadLinked();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _loadLinked() async {
    try {
      final res = await ref
          .read(apiClientProvider)
          .dio
          .get(ApiEndpoints.purchaseEmail);
      final data = (res.data is Map) ? res.data['data'] : null;
      final list = (data is Map && data['emails'] is List)
          ? (data['emails'] as List).map((e) => e.toString()).toList()
          : <String>[];
      if (mounted) setState(() => _linked = list);
    } catch (_) {
      // Список — подсказка, без него экран работает.
    }
  }

  void _snack(String text, {bool ok = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: ok ? AppColors.success : AppColors.error,
    ));
  }

  String _errorText(Object e, String fallback) {
    return switch (ClubApiService.errorCodeFromException(e)) {
      'ALREADY_LINKED' => 'Эта почта уже привязана к вашему аккаунту',
      'TOO_SOON' => 'Код уже отправлен. Повторно можно через минуту',
      'TOO_MANY_EMAILS' =>
        'Можно привязать не больше 5 почт. Напишите в поддержку',
      'MAIL_FAILED' => 'Не удалось отправить письмо. Попробуйте позже',
      'CODE_INVALID' => 'Неверный код',
      'CODE_EXPIRED' => 'Срок действия кода истёк. Запросите новый код',
      'TOO_MANY_ATTEMPTS' => 'Слишком много попыток. Запросите новый код',
      'VALIDATION_ERROR' => 'Проверьте, правильно ли введена почта',
      _ => userMessageFor(e, fallback: fallback),
    };
  }

  Future<void> _sendCode() async {
    final email = _emailController.text.trim().toLowerCase();
    if (!email.contains('@') || !email.contains('.')) {
      _snack('Введите почту');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref
          .read(apiClientProvider)
          .dio
          .post(ApiEndpoints.purchaseEmailRequest, data: {'email': email});
      if (!mounted) return;
      setState(() {
        _sentTo = email;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(_errorText(e, 'Не удалось отправить код. Попробуйте ещё раз'));
    }
  }

  Future<void> _confirm() async {
    final email = _sentTo;
    final code = _codeController.text.trim();
    if (email == null) return;
    if (code.isEmpty) {
      _snack('Введите код из письма');
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await ref.read(apiClientProvider).dio.post(
        ApiEndpoints.purchaseEmailConfirm,
        data: {'email': email, 'code': code},
      );
      if (!mounted) return;
      final data = (res.data is Map) ? res.data['data'] : null;
      final applied = (data is Map && data['applied'] is num)
          ? (data['applied'] as num).toInt()
          : 0;
      final conflicts = (data is Map && data['conflicts'] is num)
          ? (data['conflicts'] as num).toInt()
          : 0;
      // Доступы могли измениться — профиль и клуб перечитаются.
      ref.invalidate(profileProvider);
      _snack(
        conflicts > 0
            ? 'Почта подтверждена, но часть доступа уже привязана к другому '
                'аккаунту. Напишите в поддержку, мы поможем'
            : applied > 0
                ? 'Готово, доступ с этой почты открыт'
                : 'Почта подтверждена. Если доступ появится позже, '
                    'он откроется сам',
        ok: conflicts == 0,
      );
      context.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(_errorText(e, 'Не удалось подтвердить почту. Попробуйте ещё раз'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final sent = _sentTo != null;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppTopBar(backLabel: 'Профиль', onBack: () => context.pop()),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenPadding,
                  8,
                  AppSpacing.screenPadding,
                  32,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Привязать другую почту',
                      style: AppTypography.serifSectionTitle,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      sent
                          ? 'Мы отправили код на $_sentTo. Введите его ниже. '
                              'Если письма нет, проверьте папку «Спам».'
                          : 'Если доступ оформлен на другую почту, укажите её. '
                              'Мы пришлём на неё код, и после подтверждения '
                              'всё, что оформлено на эту почту, откроется в этом '
                              'аккаунте.',
                      style: AppTypography.body.copyWith(
                        color: AppColors.textTertiary,
                        height: 1.5,
                      ),
                    ),
                    if (_linked.isNotEmpty && !sent) ...[
                      const SizedBox(height: 16),
                      Text(
                        'Уже привязаны: ${_linked.join(', ')}',
                        style: AppTypography.body.copyWith(
                          color: AppColors.textTertiary,
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    if (!sent) ...[
                      AppTextField(
                        controller: _emailController,
                        placeholder: 'Почта',
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 16),
                      AppButton(
                        text: 'Получить код',
                        isLoading: _busy,
                        onPressed: _busy ? null : _sendCode,
                      ),
                    ] else ...[
                      AppTextField(
                        controller: _codeController,
                        placeholder: 'Код из письма',
                        keyboardType: TextInputType.number,
                      ),
                      const SizedBox(height: 16),
                      AppButton(
                        text: 'Подтвердить',
                        isLoading: _busy,
                        onPressed: _busy ? null : _confirm,
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _sentTo = null;
                                  _codeController.clear();
                                }),
                        child: const Text('Указать другую почту'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
