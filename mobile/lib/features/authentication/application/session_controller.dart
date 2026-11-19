import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import '../domain/session_state.dart';

final sessionProvider = NotifierProvider<SessionController, SessionState>(SessionController.new);

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    Future.microtask(bootstrap);
    return const SessionState.unknown();
  }

  /// Restores a previous session: no stored token -> signed out, otherwise the
  /// profile (and therefore the role) is loaded from the backend (`GET /users/me`, Phase 2).
  Future<void> bootstrap() async {
    final tokens = ref.read(tokenStorageProvider);
    if (await tokens.readAccess() == null) {
      state = const SessionState.unauthenticated();
      return;
    }
    try {
      final res = await ref.read(dioProvider).get<Map<String, dynamic>>('/users/me');
      state = SessionState.authenticated(SessionUser.fromJson(res.data!));
    } on DioException {
      await tokens.clear();
      state = const SessionState.unauthenticated();
    }
  }

  void signedIn(SessionUser user) => state = SessionState.authenticated(user);

  Future<void> signOut() async {
    await ref.read(tokenStorageProvider).clear();
    state = const SessionState.unauthenticated();
  }

  /// Called by the HTTP layer when the refresh token is rejected.
  void expire() => state = const SessionState.unauthenticated();
}
