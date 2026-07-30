import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/package_model.dart';
import '../services/packages_service.dart';

/// Список пакетов — для фильтра «Пакеты» в каталоге.
final packagesProvider = FutureProvider<List<PackageModel>>((ref) async {
  final service = ref.read(packagesServiceProvider);
  return service.fetchPackages();
});

/// Детали одного пакета по id — для экрана пакета.
final packageDetailProvider =
    FutureProvider.family<PackageModel, String>((ref, id) async {
  final service = ref.read(packagesServiceProvider);
  return service.fetchPackage(id);
});
