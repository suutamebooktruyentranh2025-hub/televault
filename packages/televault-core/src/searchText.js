const FROM =
  'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
const TO = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';
const COMBINING = /[\u0300-\u036f]/;
const INVISIBLE = /[\u00AD\u200B-\u200D\uFEFF\u2060]/;

function normalizeForSearch(input) {
  const lower = input.replaceAll('Đ', 'd').replaceAll('đ', 'd').toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (COMBINING.test(ch) || INVISIBLE.test(ch)) continue;
    const idx = FROM.indexOf(ch);
    out += idx >= 0 ? TO[idx] : ch;
  }
  return out;
}

function searchTextMatches(haystack, needle) {
  const q = normalizeForSearch(needle.trim());
  if (!q) return true;
  return normalizeForSearch(haystack).includes(q);
}

function entryMatchesSearch(path, tags, query) {
  if (searchTextMatches(path, query)) return true;
  return tags.some((t) => searchTextMatches(t, query));
}

module.exports = { normalizeForSearch, searchTextMatches, entryMatchesSearch };
