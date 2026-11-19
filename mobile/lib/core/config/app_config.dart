/// Build-time configuration. Override with:
/// flutter run --dart-define=API_BASE_URL=https://api.example.com/api/v1
///
/// Only public values belong here. Never put the Supabase service role key,
/// JWT secrets or any server credential in the mobile app.
class AppConfig {
  const AppConfig._();

  /// 10.0.2.2 reaches the host machine from the Android emulator.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000/api/v1',
  );
}
