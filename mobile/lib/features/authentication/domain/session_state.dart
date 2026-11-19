import 'user_role.dart';

enum SessionStatus { unknown, unauthenticated, authenticated }

class SessionUser {
  const SessionUser({required this.id, required this.fullName, required this.role});

  final String id;
  final String fullName;
  final UserRole role;

  factory SessionUser.fromJson(Map<String, dynamic> json) => SessionUser(
        id: json['id'] as String,
        fullName: (json['fullName'] ?? json['full_name'] ?? '') as String,
        role: UserRole.parse(json['role'] as String),
      );
}

class SessionState {
  const SessionState._(this.status, this.user);

  const SessionState.unknown() : this._(SessionStatus.unknown, null);
  const SessionState.unauthenticated() : this._(SessionStatus.unauthenticated, null);
  const SessionState.authenticated(SessionUser user) : this._(SessionStatus.authenticated, user);

  final SessionStatus status;
  final SessionUser? user;
}
