import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/club_meeting.dart';

/// Карточка встречи с Анной для Тарифа 2 (UPDATES-PLAN M, 28.10.2026).
///
/// Показывается под шапкой клуба ТОЛЬКО участницам с Тарифом 2 на этот клуб
/// (сервер отдаёт встречи только им) — решение о показе принимает
/// club_screen. Здесь:
/// - есть ближайшая встреча → «Встреча с Анной · 12 ноября, 19:00» и
///   «Подключиться» (открывает ссылку Zoom во внешнем приложении);
/// - встреч ещё не назначено → «дата появится здесь»;
/// - все встречи месяца прошли → карточки нет.
class ClubMeetingCard extends StatelessWidget {
  const ClubMeetingCard({super.key, required this.meetings});

  final List<ClubMeeting> meetings;

  static const List<String> _monthsGenitive = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];

  static String _when(DateTime d) {
    final hh = d.hour.toString().padLeft(2, '0');
    final mm = d.minute.toString().padLeft(2, '0');
    return '${d.day} ${_monthsGenitive[d.month - 1]}, $hh:$mm';
  }

  Future<void> _join(BuildContext context, ClubMeeting meeting) async {
    final uri = Uri.tryParse(meeting.zoomUrl);
    final ok = uri != null &&
        await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось открыть ссылку на встречу')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final next = ClubMeeting.nextOf(meetings, now);
    if (meetings.isNotEmpty && next == null) return const SizedBox.shrink();

    final title = next?.title ?? 'Встреча с Анной';
    final subtitle = next == null
        ? 'Дата появится здесь'
        : (now.isAfter(next.startsAt) ? 'Уже идёт · ' : '') + _when(next.startsAt);

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(20, 4, 20, 4),
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
      decoration: BoxDecoration(
        color: AppColors.terracotta.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.terracotta.withOpacity(0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.videocam_outlined,
              size: 20, color: AppColors.terracotta),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.captionMedium
                      .copyWith(color: AppColors.textPrimary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: AppTypography.caption
                      .copyWith(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          if (next != null) ...[
            const SizedBox(width: 8),
            TextButton(
              onPressed: () => _join(context, next),
              style: TextButton.styleFrom(
                backgroundColor: AppColors.terracotta,
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                minimumSize: const Size(0, 36),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: const Text('Подключиться'),
            ),
          ],
        ],
      ),
    );
  }
}
