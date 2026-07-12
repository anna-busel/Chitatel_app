import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/app_button.dart';
import '../providers/profile_provider.dart';
import '../services/profile_service.dart';

/// Редактирование профиля (экран 4.46, задача 6.2).
///
/// Меняем имя и фото. Почта только для чтения: у входа через Apple/Google она
/// приходит от провайдера, у email-входа это логин.
///
/// Фото попадает не только сюда: сервер хранит ссылку в User.avatarUrl, а этот
/// же документ подставляется автором в каждое сообщение чата — значит после
/// загрузки фото появляется напротив реплик участницы в клубе.
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final TextEditingController _nameController = TextEditingController();
  final ImagePicker _picker = ImagePicker();

  bool _initialized = false;
  bool _isSaving = false;
  bool _isUploadingAvatar = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: AppColors.cardBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined,
                  color: AppColors.terracotta),
              title: Text('Выбрать из галереи', style: AppTypography.body),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined,
                  color: AppColors.terracotta),
              title: Text('Сделать фото', style: AppTypography.body),
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (source == null || !mounted) return;

    XFile? picked;
    try {
      picked = await _picker.pickImage(
        source: source,
        maxWidth: 1000,
        maxHeight: 1000,
        imageQuality: 85,
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Не удалось открыть фото'),
        backgroundColor: AppColors.error,
      ));
      return;
    }

    if (picked == null || !mounted) return;

    setState(() => _isUploadingAvatar = true);
    try {
      await ref.read(profileProvider.notifier).uploadAvatar(picked.path);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Фото обновлено'),
        backgroundColor: AppColors.textPrimary,
      ));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Не удалось загрузить фото'),
        backgroundColor: AppColors.error,
      ));
    } finally {
      if (mounted) setState(() => _isUploadingAvatar = false);
    }
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Имя не может быть пустым'),
        backgroundColor: AppColors.error,
      ));
      return;
    }

    setState(() => _isSaving = true);
    try {
      await ref.read(profileProvider.notifier).updateProfile(name: name);
      if (!mounted) return;
      Navigator.of(context).maybePop();
    } catch (_) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Не удалось сохранить'),
        backgroundColor: AppColors.error,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(profileProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('Профиль', style: AppTypography.screenTitle),
      ),
      body: profileAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: AppColors.terracotta,
            strokeWidth: 2.5,
          ),
        ),
        error: (_, __) => Center(
          child: Text('Не удалось загрузить профиль', style: AppTypography.body),
        ),
        data: (profile) {
          if (!_initialized) {
            _nameController.text = profile.name;
            _initialized = true;
          }
          return _buildForm(profile);
        },
      ),
    );
  }

  Widget _buildForm(UserProfile profile) {
    final hasAvatar =
        profile.avatarUrl != null && profile.avatarUrl!.isNotEmpty;

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenPadding),
        children: [
          Center(
            child: Stack(
              alignment: Alignment.bottomRight,
              children: [
                ClipOval(
                  child: SizedBox(
                    width: 96,
                    height: 96,
                    child: _isUploadingAvatar
                        ? Container(
                            color: AppColors.surfaceMedium,
                            alignment: Alignment.center,
                            child: const CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.terracotta,
                            ),
                          )
                        : hasAvatar
                            ? CachedNetworkImage(
                                imageUrl: profile.avatarUrl!,
                                fit: BoxFit.cover,
                                errorWidget: (_, __, ___) =>
                                    _Fallback(name: profile.name),
                              )
                            : _Fallback(name: profile.name),
                  ),
                ),
                Material(
                  color: AppColors.terracotta,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: _isUploadingAvatar ? null : _pickAvatar,
                    child: const Padding(
                      padding: EdgeInsets.all(6),
                      child: Icon(
                        Icons.photo_camera_outlined,
                        size: 18,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: _isUploadingAvatar ? null : _pickAvatar,
              child: Text(
                'Изменить фото',
                style: AppTypography.captionMedium.copyWith(
                  color: AppColors.terracotta,
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),

          Text('Имя', style: AppTypography.captionMedium),
          const SizedBox(height: 6),
          TextField(
            controller: _nameController,
            maxLength: 100,
            style: AppTypography.body,
            decoration: InputDecoration(
              counterText: '',
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
          const SizedBox(height: 16),

          Text('Почта', style: AppTypography.captionMedium),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
            decoration: BoxDecoration(
              color: AppColors.surfaceLight,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Text(
              profile.email ?? 'Скрыта провайдером входа',
              style: AppTypography.body.copyWith(color: AppColors.textSecondary),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Почта не меняется — это ваш способ входа',
            style: AppTypography.caption,
          ),
          const SizedBox(height: 28),

          AppButton(
            text: 'Сохранить',
            isLoading: _isSaving,
            onPressed: _isSaving ? null : _save,
          ),
        ],
      ),
    );
  }
}

class _Fallback extends StatelessWidget {
  const _Fallback({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final letter = name.isNotEmpty ? name.characters.first.toUpperCase() : '?';
    return Container(
      color: AppColors.surfaceMedium,
      alignment: Alignment.center,
      child: Text(letter, style: AppTypography.serifSectionTitle),
    );
  }
}
