import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/authentication/application/session_controller.dart';
import '../config/app_config.dart';
import 'auth_interceptor.dart';
import 'token_storage.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => SecureTokenStorage());

BaseOptions _baseOptions() => BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: const {'Accept': 'application/json'},
    );

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(_baseOptions());
  dio.interceptors.add(
    AuthInterceptor(
      tokens: ref.watch(tokenStorageProvider),
      dio: dio,
      refreshDio: Dio(_baseOptions()),
      // Read lazily to avoid a provider cycle with the session controller.
      onSessionExpired: () => ref.read(sessionProvider.notifier).expire(),
    ),
  );
  return dio;
});
