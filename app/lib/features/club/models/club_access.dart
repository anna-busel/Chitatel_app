/// Уровень доступа юзера к конкретному клубу.
/// Соответствует req.clubAccess в server/src/middleware/subscription.js.
///
/// Возвращается сервером вместе с клубом в /api/club/current и /api/club/:id.
/// UI использует это чтобы решить — показывать ли поле ввода в чате, баннер
/// «архив», предупреждение о мьюте, и т.д.
enum ClubAccessKind {
  /// Активная подписка (basic или premium) — полный доступ.
  active,

  /// Подписка истекла, но клуб ещё в архивном окне (21 день после endsAt).
  /// Чтение разрешено, отправка сообщений запрещена.
  archive,

  /// Админ (Анна) — везде полный доступ.
  admin,

  /// Неизвестное значение (на случай рассинхрона с бэком).
  unknown,
}

class ClubAccess {
  const ClubAccess({
    required this.kind,
    required this.canPost,
    this.tier,
    this.isMuted = false,
    this.mutedUntil,
  });

  /// Тип доступа.
  final ClubAccessKind kind;

  /// Можно ли отправлять сообщения / задавать Q&A / эмитить typing.
  /// false в архиве и при мьюте.
  final bool canPost;

  /// Уровень подписки: 'basic' | 'premium' | 'expired' | 'admin' | null.
  final String? tier;

  /// Юзер замьючен в чате.
  final bool isMuted;

  /// До какого времени действует мьют (если isMuted=true).
  final DateTime? mutedUntil;

  factory ClubAccess.fromJson(Map<String, dynamic> json) {
    final kindRaw = (json['kind'] ?? '').toString();
    final kind = switch (kindRaw) {
      'active' => ClubAccessKind.active,
      'archive' => ClubAccessKind.archive,
      'admin' => ClubAccessKind.admin,
      _ => ClubAccessKind.unknown,
    };

    final mutedRaw = json['mutedUntil'];
    DateTime? mutedUntil;
    if (mutedRaw is String && mutedRaw.isNotEmpty) {
      mutedUntil = DateTime.tryParse(mutedRaw);
    }

    return ClubAccess(
      kind: kind,
      canPost: json['canPost'] == true,
      tier: json['tier']?.toString(),
      isMuted: json['isMuted'] == true,
      mutedUntil: mutedUntil,
    );
  }

  /// Read-only режим (архив либо мьют).
  bool get isReadOnly => !canPost;

  /// Дефолт при ошибке загрузки — заблокированный доступ.
  factory ClubAccess.empty() => const ClubAccess(
        kind: ClubAccessKind.unknown,
        canPost: false,
      );
}
