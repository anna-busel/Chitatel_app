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
///
/// Дизайн (редизайн чата 28.06): кофейная плашка (lightCoffee #3A2018) —
/// тёмный служебный якорь сверху, максимальный контраст с белыми пузырями и
/// светлым фоном чата, чтобы закреп НЕ сливался (главный прежний недостаток —
/// белый баннер на почти белом фоне терялся). Кофейный — фирменный тёмный цвет
/// приложения (обложки/плеер/заголовки), используется в чате ТОЛЬКО здесь
/// (в пузыри не тащим — там один акцент, терракота). Квадрат-пин терракотовый,
/// подпись «Закреплено · Имя» коралловая (светлее терракоты, читается на тёмном),
/// текст превью белый, chevron приглушённо-светлый.
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
      color: AppColors.lightCoffee,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 9, 16, 9),
            child: Row(
              children: [
                // Терракотовый квадрат-пин (скруглённый), белая иконка внутри.
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: AppColors.terracotta,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.push_pin,
                    size: 16,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Закреплено · ${message.author.name}',
                        style: AppTypography.micro.copyWith(
                          color: AppColors.coral,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        preview,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
                if (onTap != null)
                  Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: Colors.white.withOpacity(0.55),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
