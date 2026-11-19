import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// Temporary body for screens that are implemented in later phases.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Text(l10n.comingSoon, style: theme.textTheme.titleMedium),
      ),
    );
  }
}
