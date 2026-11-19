import 'package:dio/dio.dart';

/// Normalised API failure. Mirrors the backend envelope:
/// { "error": { "code": "...", "message": "...", "details": ... } }
class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.statusCode,
    this.details,
  });

  final String code;
  final String message;
  final int? statusCode;
  final Object? details;

  bool get isNetwork => code == 'NETWORK';
  bool get isUnauthorized => statusCode == 401;
  bool get isSlotTaken => code == 'SLOT_TAKEN';

  factory ApiException.fromDio(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      final err = data['error'] as Map;
      return ApiException(
        code: (err['code'] ?? 'UNKNOWN').toString(),
        message: (err['message'] ?? '').toString(),
        statusCode: e.response?.statusCode,
        details: err['details'],
      );
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.connectionError:
        return const ApiException(code: 'NETWORK', message: 'Network error');
      default:
        return ApiException(
          code: 'UNKNOWN',
          message: e.message ?? 'Unexpected error',
          statusCode: e.response?.statusCode,
        );
    }
  }

  @override
  String toString() => 'ApiException($code, $statusCode): $message';
}
