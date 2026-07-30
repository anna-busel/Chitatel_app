import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../shared/models/package_model.dart';

/// Провайдер сервиса пакетов.
final packagesServiceProvider = Provider<PackagesService>((ref) {
  return PackagesService(ref.read(apiClientProvider));
});

/// Сервис пакетов разборов. Запросы: GET /api/packages и /api/packages/:id.
class PackagesService {
  PackagesService(this._api);
  final ApiClient _api;

  /// GET /api/packages — список опубликованных пакетов.
  Future<List<PackageModel>> fetchPackages() async {
    final response = await _api.dio.get(ApiEndpoints.packages);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final items = data['packages'] as List<dynamic>? ?? const [];

    return items
        .whereType<Map<String, dynamic>>()
        .map(PackageModel.fromJson)
        .toList(growable: false);
  }

  /// GET /api/packages/:id — детали пакета (с populated разборами).
  Future<PackageModel> fetchPackage(String id) async {
    final response = await _api.dio.get('${ApiEndpoints.packages}/$id');
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final pkg = data['package'] as Map<String, dynamic>? ?? const {};

    return PackageModel.fromJson(pkg);
  }
}
