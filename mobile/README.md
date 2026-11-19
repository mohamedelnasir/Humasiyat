# Humasiyat mobile (Flutter)

Arabic-first (RTL) Flutter app for customers, pitch managers and super admins.
Stack: Riverpod, Dio, GoRouter, flutter_secure_storage.

## Run
```bash
cd mobile
flutter pub get
flutter gen-l10n            # generated automatically by `flutter run`, shown for clarity
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1   # Android emulator -> host backend
flutter test
```
iOS simulator can use `http://localhost:4000/api/v1`; a physical device needs your computer's LAN IP.

## Structure
```
lib/
  core/{config,constants,network,router,theme,utils,widgets}
  features/<feature>/{presentation,application,domain,data}   # added per phase
  l10n/                    # app_ar.arb (template, default) and app_en.arb
```
Design tokens live in `core/theme/app_colors.dart` (sampled from the approved Stitch screens).
The typeface is one line in `core/theme/app_theme.dart`.

## Navigation
One app, role-based shells chosen from the session role. Route guards here are a convenience only; the backend authorizes every request.

## Before release
- Bundle the Arabic font as an asset (instead of `google_fonts` runtime download) so text renders offline.
- Add Firebase (FCM) in Phase 6; `firebase_core`/`firebase_messaging` are intentionally not added yet.
