/// Roles as issued by the backend. The app uses the role only to choose which
/// navigation to show; every permission is enforced again on the server.
enum UserRole {
  customer,
  manager,
  superAdmin;

  static UserRole parse(String value) => switch (value) {
        'manager' => UserRole.manager,
        'super_admin' => UserRole.superAdmin,
        _ => UserRole.customer,
      };

  String get homePath => switch (this) {
        UserRole.customer => '/home',
        UserRole.manager => '/manager',
        UserRole.superAdmin => '/admin',
      };

  /// Convenience guard for navigation only (never a security boundary).
  bool canAccess(String location) => switch (this) {
        UserRole.manager => location.startsWith('/manager'),
        UserRole.superAdmin => location.startsWith('/admin'),
        UserRole.customer => !location.startsWith('/manager') && !location.startsWith('/admin'),
      };
}
