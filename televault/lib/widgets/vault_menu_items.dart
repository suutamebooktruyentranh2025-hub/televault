import 'package:flutter/material.dart';

PopupMenuItem<T> vaultPopupMenuItem<T>({
  required T value,
  required IconData icon,
  required String label,
}) {
  return PopupMenuItem(
    value: value,
    child: ListTile(
      leading: Icon(icon, size: 22),
      title: Text(label),
      contentPadding: EdgeInsets.zero,
      dense: true,
      visualDensity: VisualDensity.compact,
    ),
  );
}
