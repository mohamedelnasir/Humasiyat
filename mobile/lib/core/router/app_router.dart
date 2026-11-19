import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/authentication/application/session_controller.dart';
import '../../features/authentication/domain/session_state.dart';
import '../../l10n/app_localizations.dart';
import '../widgets/placeholder_screen.dart';
import 'role_shell.dart';
import 'routes.dart';

class _RouterRefresh extends ChangeNotifier {
  void notify() => notifyListeners();
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh();
  ref.listen<SessionState>(sessionProvider, (_, __) => refresh.notify());
  ref.onDispose(refresh.dispose);

  String? redirect(BuildContext context, GoRouterState state) {
    final session = ref.read(sessionProvider);
    final location = state.matchedLocation;

    switch (session.status) {
      case SessionStatus.unknown:
        return location == Routes.splash ? null : Routes.splash;
      case SessionStatus.unauthenticated:
        return Routes.publicPaths.contains(location) ? null : Routes.roleSelect;
      case SessionStatus.authenticated:
        final role = session.user!.role;
        if (location == Routes.splash || Routes.publicPaths.contains(location)) {
          return role.homePath;
        }
        return role.canAccess(location) ? null : role.homePath;
    }
  }

  // Screens are placeholders until Phase 7, where each is built from the approved designs.
  Widget screen(BuildContext context, String Function(AppLocalizations) title) =>
      PlaceholderScreen(title: title(AppLocalizations.of(context)));

  StatefulShellBranch branch(String path, String Function(AppLocalizations) title) =>
      StatefulShellBranch(routes: [
        GoRoute(path: path, builder: (context, _) => screen(context, title)),
      ]);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: redirect,
    routes: [
      GoRoute(
        path: Routes.splash,
        builder: (context, _) => const _SplashScreen(),
      ),
      GoRoute(path: Routes.roleSelect, builder: (context, _) => screen(context, (l) => l.appName)),
      GoRoute(path: Routes.login, builder: (context, _) => screen(context, (l) => l.appName)),
      GoRoute(path: Routes.register, builder: (context, _) => screen(context, (l) => l.appName)),
      GoRoute(path: Routes.forgotPassword, builder: (context, _) => screen(context, (l) => l.appName)),

      // Customer
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => RoleShell(shell: shell, items: customerNav),
        branches: [
          branch(Routes.home, (l) => l.tabHome),
          branch(Routes.explore, (l) => l.tabExplore),
          branch(Routes.bookings, (l) => l.tabBookings),
          branch(Routes.notifications, (l) => l.tabNotifications),
          branch(Routes.profile, (l) => l.tabProfile),
        ],
      ),
      GoRoute(path: Routes.pitchDetails, builder: (context, _) => screen(context, (l) => l.tabExplore)),

      // Manager
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => RoleShell(shell: shell, items: managerNav),
        branches: [
          branch(Routes.managerHome, (l) => l.mgrHome),
          branch(Routes.managerBookings, (l) => l.mgrBookings),
          branch(Routes.managerPayments, (l) => l.mgrBankCheck),
          branch(Routes.managerPitch, (l) => l.mgrPitch),
          branch(Routes.managerAccount, (l) => l.mgrAccount),
        ],
      ),

      // Super admin
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => RoleShell(shell: shell, items: adminNav),
        branches: [
          branch(Routes.adminHome, (l) => l.adminHome),
          branch(Routes.adminApprovals, (l) => l.adminApprovals),
          branch(Routes.adminUsers, (l) => l.adminUsers),
          branch(Routes.adminBookings, (l) => l.adminBookings),
          branch(Routes.adminSettings, (l) => l.adminSettings),
        ],
      ),
    ],
  );
});

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.sports_soccer, size: 72, color: theme.colorScheme.primary),
            const SizedBox(height: 12),
            Text(l10n.appName, style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(l10n.appTagline, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 24),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
