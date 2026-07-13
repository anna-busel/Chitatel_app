import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/chat_message.dart';

/// Баннер закреплённого сообщения. Показывается над списком чата.
///
/// Один на клуб (закрепляет только Анна, ровно 1 шт).
/// Тап → скролл к оригиналу в ленте (onTap).
///
/// Дизайн (редизайн чата 28.06): кофейная плашка (lightCoffee #3A2018) —
/// тёмный служебный якорь сверху, максимальный контраст с белыми пузырями и
/// светлым фоном чата, чтобы закреп НЕ сливался (прежний недостаток — белый
/// баннер на почти белом фоне терялся). Кофейный — фирменный тёмный цвет
/// приложения, в чате используется ТОЛЬКО здесь. Квадрат-пин терракотовый,
/// подпись «Закреплено · Имя» коралловая, текст превью белый.
///
/// ⚠️ 13.07.2026 — СКРУГЛЕНИЕ СНИЗУ. Плашка была прямоугольной и читалась как
/// системная полоса, приклеенная к шапке. Скруглены НИЖНИЕ углы (14px) + мягкая
/// тень вниз: закреп становится «карточкой, лежащей поверх ленты», в одном
/// языке с пузырями (18px) и мини-плеером (14px сверху).
/// Сверху НЕ скругляем — там он упирается в шапку клуба, скруглять нечего.
/// Боковые отступы НЕ добавляем: «плавающая» плашка спорила бы с пузырями и
/// съедала ширину превью.
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
          color: AppColors.lightCoffee,
          child: InkWell(
            onTap: onTap,
            child: SizedBox(
              width: double.infinity,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 9, 16, 11),
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
        ),
      ),
    );
  }
}
