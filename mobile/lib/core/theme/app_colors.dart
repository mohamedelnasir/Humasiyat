import 'package:flutter/material.dart';

/// Design tokens sampled from the approved Humasiyat Stitch designs.
class AppColors {
  const AppColors._();

  // Brand
  static const Color primary = Color(0xFF013A16); // deep football green
  static const Color primaryContainer = Color(0xFF0B4A1F); // filled buttons, hero cards
  static const Color onPrimary = Colors.white;
  static const Color lime = Color(0xFFACF847); // "available now" accents

  // Secondary (manager / warning accent)
  static const Color amber = Color(0xFFFDC425);
  static const Color onAmber = Color(0xFF6D5200);
  static const Color amberContainer = Color(0xFFFFDF9A);
  static const Color amberSoft = Color(0xFFFEE5B3);
  static const Color pendingText = Color(0xFF785A00);

  // Surfaces (lavender-tinted neutrals)
  static const Color background = Color(0xFFFAF8FF);
  static const Color surfaceLowest = Colors.white;
  static const Color surfaceLow = Color(0xFFF2F3FF);
  static const Color surface = Color(0xFFEAEDFF);
  static const Color surfaceHigh = Color(0xFFE2E7FF);
  static const Color greenTint = Color(0xFFE7EEE9);

  // Text
  static const Color ink = Color(0xFF131B2E);
  static const Color inkMuted = Color(0xFF5B6275);
  static const Color navy = Color(0xFF283044); // super-admin card

  // Status
  static const Color danger = Color(0xFFBA1A1A);
  static const Color dangerContainer = Color(0xFFFFDAD6);
  static const Color outline = Color(0xFFC4C8D6);
}
