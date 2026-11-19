import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';

class NavItem {
  const NavItem(this.icon, this.selectedIcon, this.label);

  final IconData icon;
  final IconData selectedIcon;
  final String Function(AppLocalizations l10n) label;
}

/// Bottom-navigation scaffold shared by the three roles; only the items differ.
class RoleShell extends StatelessWidget {
  const RoleShell({super.key, required this.shell, required this.items});

  final StatefulNavigationShell shell;
  final List<NavItem> items;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: [
          for (final item in items)
            NavigationDestination(
              icon: Icon(item.icon),
              selectedIcon: Icon(item.selectedIcon),
              label: item.label(l10n),
            ),
        ],
      ),
    );
  }
}

const customerNav = [
  NavItem(Icons.sports_soccer_outlined, Icons.sports_soccer, _home),
  NavItem(Icons.explore_outlined, Icons.explore, _explore),
  NavItem(Icons.event_available_outlined, Icons.event_available, _bookings),
  NavItem(Icons.notifications_none, Icons.notifications, _notifications),
  NavItem(Icons.person_outline, Icons.person, _profile),
];

const managerNav = [
  NavItem(Icons.grid_view_outlined, Icons.grid_view, _mgrHome),
  NavItem(Icons.calendar_month_outlined, Icons.calendar_month, _mgrBookings),
  NavItem(Icons.verified_outlined, Icons.verified, _mgrBank),
  NavItem(Icons.sports_soccer_outlined, Icons.sports_soccer, _mgrPitch),
  NavItem(Icons.manage_accounts_outlined, Icons.manage_accounts, _mgrAccount),
];

const adminNav = [
  NavItem(Icons.dashboard_outlined, Icons.dashboard, _adminHome),
  NavItem(Icons.approval_outlined, Icons.approval, _adminApprovals),
  NavItem(Icons.people_outline, Icons.people, _adminUsers),
  NavItem(Icons.event_note_outlined, Icons.event_note, _adminBookings),
  NavItem(Icons.settings_outlined, Icons.settings, _adminSettings),
];

String _home(AppLocalizations l) => l.tabHome;
String _explore(AppLocalizations l) => l.tabExplore;
String _bookings(AppLocalizations l) => l.tabBookings;
String _notifications(AppLocalizations l) => l.tabNotifications;
String _profile(AppLocalizations l) => l.tabProfile;
String _mgrHome(AppLocalizations l) => l.mgrHome;
String _mgrBookings(AppLocalizations l) => l.mgrBookings;
String _mgrBank(AppLocalizations l) => l.mgrBankCheck;
String _mgrPitch(AppLocalizations l) => l.mgrPitch;
String _mgrAccount(AppLocalizations l) => l.mgrAccount;
String _adminHome(AppLocalizations l) => l.adminHome;
String _adminApprovals(AppLocalizations l) => l.adminApprovals;
String _adminUsers(AppLocalizations l) => l.adminUsers;
String _adminBookings(AppLocalizations l) => l.adminBookings;
String _adminSettings(AppLocalizations l) => l.adminSettings;
