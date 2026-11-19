import 'package:dio/dio.dart';

import 'token_storage.dart';

const String skipAuthKey = 'skipAuth';
const String _retriedKey = 'authRetried';

/// Attaches the access token and, on a 401, performs ONE shared token refresh
/// (rotating refresh token) and replays the failed request.
///
/// Contract with the backend (implemented in Phase 2):
///   POST /auth/refresh  { "refreshToken": "..." }
///   -> 200 { "accessToken": "...", "refreshToken": "..." }
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.tokens,
    required this.dio,
    required this.refreshDio,
    required this.onSessionExpired,
  });

  final TokenStorage tokens;
  final Dio dio; // the main client, used to replay requests
  final Dio refreshDio; // bare client without this interceptor
  final void Function() onSessionExpired;

  Future<bool>? _refreshing;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (options.extra[skipAuthKey] != true) {
      final token = await tokens.readAccess();
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final request = err.requestOptions;
    final shouldRefresh = err.response?.statusCode == 401 &&
        request.extra[skipAuthKey] != true &&
        request.extra[_retriedKey] != true;
    if (!shouldRefresh) return handler.next(err);

    // Parallel 401s share a single refresh so the rotating token is used once.
    final refreshed = await (_refreshing ??= _refresh().whenComplete(() => _refreshing = null));
    if (!refreshed) return handler.next(err);

    try {
      request.extra[_retriedKey] = true;
      final access = await tokens.readAccess();
      if (access != null) request.headers['Authorization'] = 'Bearer $access';
      handler.resolve(await dio.fetch<dynamic>(request));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  Future<bool> _refresh() async {
    final refreshToken = await tokens.readRefresh();
    if (refreshToken == null) {
      onSessionExpired();
      return false;
    }
    try {
      final res = await refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {skipAuthKey: true}),
      );
      final body = res.data ?? const {};
      await tokens.save(
        access: body['accessToken'] as String,
        refresh: body['refreshToken'] as String,
      );
      return true;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      // Only an explicit rejection ends the session; a network blip must not log the user out.
      if (status == 400 || status == 401 || status == 403) {
        await tokens.clear();
        onSessionExpired();
      }
      return false;
    }
  }
}
