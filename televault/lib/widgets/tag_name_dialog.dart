import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';

Future<String?> showTagNameDialog(
  BuildContext context, {
  required String title,
  String initial = '',
  String? hint,
}) {
  final settings = context.read<AppSettingsProvider>();
  final controller = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        decoration: InputDecoration(
          hintText: hint ?? settings.t('tag_name_hint'),
          border: const OutlineInputBorder(),
        ),
        onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(settings.t('action_cancel'))),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, controller.text.trim()),
          child: Text(settings.t('action_ok')),
        ),
      ],
    ),
  );
}
