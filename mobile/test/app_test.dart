import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:humasiyat/app.dart';
import 'package:humasiyat/core/network/dio_client.dart';
import 'package:humasiyat/core/network/token_storage.dart';
import 'package:humasiyat/core/theme/app_theme.dart';
import 'package:humasiyat/features/authentication/application/session_controller.dart';
import 'package:humasiyat/features/authentication/domain/session_state.dart';
import 'package:humasiyat/features/authentication/domain/user_role.dart';

class _MemoryTokens implements TokenStorage {
  String? access;
  String? refresh;
  @override
  Future<String?> readAccess() async => access;
  @override
  Future<String?> readRefresh() async => refresh;
  @override
  Future<void> save({required String access, required String refresh}) async {
    this.access = access;
    this.refresh = refresh;
  }

  @override
  Future<void> clear() async {
    access = null;
    refresh = null;
  }
}

Widget _app(_MemoryTokens tokens) => ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(tokens),
        appThemeProvider.overrideWithValue(AppTheme.light(useGoogleFonts: false)),
      ],
      child: const HumasiyatApp(),
    );

void main() {
  test('role navigation guards', () {
    expect(UserRole.customer.canAccess('/home'), isTrue);
    expect(UserRole.customer.canAccess('/manager/payments'), isFalse);
    expect(UserRole.manager.canAccess('/manager'), isTrue);
    expect(UserRole.manager.canAccess('/home'), isFalse);
    expect(UserRole.superAdmin.canAccess('/admin/users'), isTrue);
    expect(UserRole.parse('super_admin'), UserRole.superAdmin);
  });

  testWidgets('signed-out users land on the Arabic RTL entry screen', (tester) async {
    await tester.pumpWidget(_app(_MemoryTokens()));
    await tester.pumpAndSettle();

    final context = tester.element(find.byType(Scaffold).first);
    expect(Directionality.of(context), TextDirection.rtl);
    expect(find.text('خماسيات'), findsWidgets);
  });

  testWidgets('a signed-in manager is routed to the manager shell', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(_MemoryTokens()),
      appThemeProvider.overrideWithValue(AppTheme.light(useGoogleFonts: false)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const HumasiyatApp()));
    await tester.pumpAndSettle();

    container.read(sessionProvider.notifier).signedIn(
          const SessionUser(id: '1', fullName: 'Manager', role: UserRole.manager),
        );
    await tester.pumpAndSettle();

    expect(find.text('تدقيق بنكك'), findsWidgets); // manager bottom-nav item
    expect(find.text('استكشاف'), findsNothing); // customer item absent
  });
}
