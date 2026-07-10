/// JSON builders tương thích TDLib 1.8.0 (legacy) và ≥1.8.6 (modern).
Map<String, dynamic> inputMessageDocument({
  required String filePath,
  required String captionText,
  required bool legacyApi,
  bool disableContentTypeDetection = false,
}) {
  final caption = {'@type': 'formattedText', 'text': captionText};
  if (legacyApi) {
    return {
      '@type': 'inputMessageDocument',
      'document': {'@type': 'inputFileLocal', 'path': filePath},
      'caption': caption,
    };
  }
  return {
    '@type': 'inputMessageDocument',
    'document': {
      '@type': 'inputDocument',
      'document': {'@type': 'inputFileLocal', 'path': filePath},
      'disable_content_type_detection': disableContentTypeDetection,
    },
    'caption': caption,
  };
}

/// Bật khi extension không phải MIME chuẩn (cbz, cbr, epub...).
bool shouldDisableContentTypeDetection(String path) {
  const exotic = {'.cbz', '.cbr', '.cb7', '.epub', '.mobi', '.azw3'};
  final dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  return exotic.contains(path.substring(dot).toLowerCase());
}
