import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/chat_message.dart';

/// Баннер закреплённого сообщения. Показывается над списком чата.
///
/// Один на клуб (см. AI-CONTEXT v5 — закрепляет только Анна, ровно 1 шт).
///
/// При тапе вызывает `onTap`, который должен проскроллить к сообщению
/// в ленте. Если callback не передан — тап игнорируется.
class PinnedMessageBanner extends StatelessWidget {
  const PinnedMessageBanner({
    super.key,
    required this.message,
    this.onTap,
  });

  final ChatMessage message;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    String preview;
    if (message.isDeleted) {
      preview = 'Сообщение удалено';
    } else if (message.type == ChatMessageType.image) {
      preview = 'Картинка';
    } else if (message.type == ChatMessageType.voice) {
      preview = 'Голосовое сообщение';
    } else {
      preview = message.text;
    }

    return Material(
      color: AppColors.cardBackground,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: AppColors.border)),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Row(
              children: [
                const Icon(Icons.push_pin, size: 16, color: AppColors.terracotta),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Закреплено · ${message.author.name}',
                        style: AppTypography.micro.copyWith(
                          color: AppColors.terracotta,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        preview,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
                if (onTap != null)
                  const Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: AppColors.textTertiary,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
