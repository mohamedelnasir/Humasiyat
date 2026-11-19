/// Central route table. Paths are grouped per role; the backend remains the
/// authority on who may call what.
class Routes {
  const Routes._();

  // Public
  static const splash = '/splash';
  static const roleSelect = '/role-select';
  static const login = '/login';
  static const register = '/register';
  static const forgotPassword = '/forgot-password';
  static const publicPaths = {roleSelect, login, register, forgotPassword};

  // Customer
  static const home = '/home';
  static const explore = '/explore';
  static const bookings = '/bookings';
  static const notifications = '/notifications';
  static const profile = '/profile';
  static const pitchDetails = '/pitches/:id';
  static const bookingDetails = '/bookings/:id';

  // Manager
  static const managerHome = '/manager';
  static const managerBookings = '/manager/bookings';
  static const managerPayments = '/manager/payments';
  static const managerPitch = '/manager/pitch';
  static const managerAccount = '/manager/account';

  // Super admin
  static const adminHome = '/admin';
  static const adminApprovals = '/admin/approvals';
  static const adminUsers = '/admin/users';
  static const adminBookings = '/admin/bookings';
  static const adminSettings = '/admin/settings';
}
