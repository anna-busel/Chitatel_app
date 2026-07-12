import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';

/// Поддержка (экран 4.40, задача 6.2).
///
/// Apple требует рабочий Support URL и живой канал связи. Здесь: короткий FAQ
/// по вопросам, из-за которых чаще всего пишут (подписка, доступ, ИИ, удаление),
/// кнопка «Написать в поддержку» и ссылки на политику и условия.
///
/// ⚠️ Почта поддержки — единственный контакт. Если она не заведена, письма
/// уйдут в никуда, а Apple проверяет Support URL и связь.
class SupportScreen extends StatelessWidget {
  const SupportScreen({super.key});

  static const String supportEmail = 'support@chitatel.app';
  static const String privacyUrl = 'https://api.chitatel.app/legal/privacy';
  static const String termsUrl = 'https://api.chitatel.app/legal/terms';

  Future<void> _writeSupport(BuildContext context) async {
    final uri = Uri(
      scheme: 'mailto',
      path: supportEmail,
      query: 'subject=${Uri.encodeComponent('Вопрос из приложения ЧИТАТЕЛЬ')}',
    );

    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Почта: $supportEmail'),
        backgroundColor: AppColors.textPrimary,
      ));
    }
  }

  Future<void> _open(String url) async {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
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
        title: Text('Поддержка', style: AppTypography.screenTitle),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          children: [
            Text('Частые вопросы', style: AppTypography.sectionHeader),
            const SizedBox(height: 10),
            const _Faq(
              question: 'Как отменить подписку?',
              answer:
                  'Настройки iPhone → ваш Apple ID → Подписки → ЧИТАТЕЛЬ → '
                  'Отменить. Доступ сохранится до конца оплаченного периода.',
            ),
            const _Faq(
              question: 'Оплатила, но клуб не открылся',
              answer:
                  'Откройте Профиль → Подписка → «Восстановить покупки». Если '
                  'не помогло — напишите нам, разберёмся.',
            ),
            const _Faq(
              question: 'Что происходит с моими цитатами?',
              answer:
                  'Они видны только вам. Разбор делает ИИ (OpenAI) — и только '
                  'если вы включили ИИ-анализ. Выключить можно в профиле.',
            ),
            const _Faq(
              question: 'Как удалить аккаунт?',
              answer:
                  'Профиль → «Удалить аккаунт». Цитаты, отчёты и прогресс '
                  'удаляются, сообщения в чате остаются без вашего имени.',
            ),
            const _Faq(
              question: 'Участница ведёт себя грубо',
              answer:
                  'Долгое нажатие на сообщение → «Пожаловаться». Там же можно '
                  'заблокировать её — вы перестанете видеть её сообщения.',
            ),

            const SizedBox(height: 24),
            Text('Не нашли ответ?', style: AppTypography.sectionHeader),
            const SizedBox(height: 8),
            Text(
              'Напишите нам — отвечаем в течение суток.',
              style: AppTypography.body.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.terracotta,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: () => _writeSupport(context),
                icon: const Icon(Icons.mail_outline, size: 18),
                label: const Text('Написать в поддержку'),
              ),
            ),
            const SizedBox(height: 6),
            Center(
              child: Text(supportEmail, style: AppTypography.caption),
            ),

            const SizedBox(height: 28),
            const Divider(height: 1),
            const SizedBox(height: 12),
            _LinkRow(
              title: 'Политика конфиденциальности',
              onTap: () => _open(privacyUrl),
            ),
            _LinkRow(
              title: 'Условия использования',
              onTap: () => _open(termsUrl),
            ),
          ],
        ),
      ),
    );
  }
}

class _Faq extends StatelessWidget {
  const _Faq({required this.question, required this.answer});
  final String question;
  final String answer;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(
          dividerColor: Colors.transparent,
          splashColor: Colors.transparent,
        ),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          iconColor: AppColors.terracotta,
          collapsedIconColor: AppColors.textSecondary,
          title: Text(question, style: AppTypography.bodyMedium),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                answer,
                style: AppTypography.body.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({required this.title, required this.onTap});
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(title, style: AppTypography.body),
      trailing: const Icon(
        Icons.open_in_new,
        size: 18,
        color: AppColors.textSecondary,
      ),
      onTap: onTap,
    );
  }
}
