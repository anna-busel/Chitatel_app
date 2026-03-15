import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'design_system_showcase.dart';

void main() {
  runApp(const ChitatelApp());
}

class ChitatelApp extends StatelessWidget {
  const ChitatelApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ЧИТАТЕЛЬ',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      // Временно показываем DesignSystemShowcase для проверки компонентов.
      // Заменится на GoRouter в задаче 1.6.
      home: const DesignSystemShowcase(),
    );
  }
}
