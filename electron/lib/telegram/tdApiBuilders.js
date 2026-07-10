const EXOTIC = new Set(['.cbz', '.cbr', '.cb7', '.epub', '.mobi', '.azw3']);

function shouldDisableContentTypeDetection(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return false;
  return EXOTIC.has(filePath.slice(dot).toLowerCase());
}

function inputMessageDocument({ filePath, captionText, legacyApi = false, disableContentTypeDetection = false }) {
  const caption = { _: 'formattedText', text: captionText };
  if (legacyApi) {
    return {
      _: 'inputMessageDocument',
      document: { _: 'inputFileLocal', path: filePath },
      caption,
    };
  }
  return {
    _: 'inputMessageDocument',
    document: {
      _: 'inputDocument',
      document: { _: 'inputFileLocal', path: filePath },
      disable_content_type_detection: disableContentTypeDetection,
    },
    caption,
  };
}

module.exports = { inputMessageDocument, shouldDisableContentTypeDetection };
