const path = require('path');

/**
 * Generate a conflict filename with date suffix.
 * @param {string} relPath - relative path like "docs/readme.md"
 * @param {Date} [date]
 * @param {string[]} [existingPaths] - already existing paths to avoid collision
 * @returns {string}
 */
function conflictName(relPath, date = new Date(), existingPaths = []) {
  const dir = path.dirname(relPath);
  const ext = path.extname(relPath);
  const base = path.basename(relPath, ext);
  const dateStr = date.toISOString().slice(0, 10);
  const prefix = dir !== '.' ? `${dir}/` : '';

  let candidate = `${prefix}${base} (conflict ${dateStr})${ext}`;
  if (!existingPaths.includes(candidate)) return candidate;

  let counter = 2;
  while (existingPaths.includes(candidate)) {
    candidate = `${prefix}${base} (conflict ${dateStr} ${counter})${ext}`;
    counter += 1;
  }
  return candidate;
}

module.exports = { conflictName };
