import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

enum StatusTone { success, pending, info, danger, neutral }

/// Small rounded status pill used for booking/payment states across all roles.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, this.tone = StatusTone.neutral, this.icon});

  final String label;
  final StatusTone tone;
  final IconData? icon;

  (Color, Color) get _colors => switch (tone) {
        StatusTone.success => (AppColors.lime, AppColors.primary),
        StatusTone.pending => (AppColors.amberSoft, AppColors.pendingText),
        StatusTone.info => (AppColors.surfaceHigh, AppColors.navy),
        StatusTone.danger => (AppColors.dangerContainer, AppColors.danger),
        StatusTone.neutral => (AppColors.surfaceLow, AppColors.inkMuted),
      };

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = _colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 14, color: foreground), const SizedBox(width: 4)],
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: foreground,
                  fontWeight: FontWeight.w800,
                ),
          ),
        ],
      ),
    );
  }
}
