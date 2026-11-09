/**
 * Utilities for sanitizing user-generated content and normalizing slugs.
 */

function stripHtmlTags(input) {
  return String(input || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '');
}

function sanitizePlainText(input, maxLength = 2000) {
  const cleaned = stripHtmlTags(input)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function sanitizeTags(tagsInput, maxTags = 8) {
  const raw = Array.isArray(tagsInput)
    ? tagsInput
    : String(tagsInput || '').split(/,|\r?\n/);

  const seen = new Set();
  const clean = [];
  for (const item of raw) {
    const t = sanitizePlainText(item, 32).replace(/^#+/, '').trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      clean.push(t);
    }
    if (clean.length >= maxTags) break;
  }
  return clean;
}

function slugify(value, fallback = 'club') {
  const base = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || fallback;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  sanitizePlainText,
  sanitizeTags,
  slugify,
  escapeRegex
};

