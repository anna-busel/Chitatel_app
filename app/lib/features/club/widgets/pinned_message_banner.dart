import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/chat_message.dart';

/// Баннер закреплённого сообщения. Показывается над списком чата.
///
/// Один на клуб (закрепляет только Анна, ровно 1 шт).
/// Тап → скролл к оригиналу в ленте (onTap).
///
/// ⚠️ 21.07.2026 — РЕДИЗАЙН ПОД БРЕНД САЙТА. Была кофейная (коричневая)
/// тёмная плашка — но коричневого в бренде нет. Теперь ЗАКРЕП — СВЕТЛАЯ
/// БЕЖЕВАЯ карточка: винный квадрат-пин, винная подпись «Закреплено · Имя»,
/// чёрный текст превью. На бежевом фоне чата закреп не сливается за счёт
/// винного акцента и тени, а не тёмной плиты.
///
/// Скруглены НИЖНИЕ углы (14px) + мягкая тень вниз: «карточка поверх ленты»
/// в одном языке с пузырями (18px). Сверху не скругляем — упирается в шапку.
class PinnedMessageBanner extends StatelessWidget {
  const PinnedMessageBanner({
    super.key,
    required this.message,
    this.onTap,
  });

  final ChatMessage message;
  final VoidCallback? onTap;

  static const double _bottomRadius = 14;

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

    const radius = BorderRadius.only(
      bottomLeft: Radius.circular(_bottomRadius),
      bottomRight: Radius.circular(_bottomRadius),
    );

    return DecoratedBox(
      decoration: const BoxDecoration(
        borderRadius: radius,
        boxShadow: [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Material(
          color: AppColors.beige,
          child: InkWell(
            onTap: onTap,
            child: SizedBox(
              width: double.infinity,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 9, 16, 11),
                child: Row(
                  children: [
                    // Винный квадрат-пин (скруглённый), белая иконка внутри.
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
                        color: AppColors.textSecondary,
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
