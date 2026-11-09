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

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp'
]);

function fileToDataUri(file) {
  if (!file || !file.buffer || !ALLOWED_IMAGE_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
    return '';
  }
  const mime = file.mimetype.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.mimetype.toLowerCase();
  return `data:${mime};base64,${file.buffer.toString('base64')}`;
}

function sanitizeMediaUrl(value, maxLength = 3 * 1024 * 1024) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > maxLength) return '';
  if (raw.startsWith('/uploads/')) return raw;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(raw)) return raw;
  if (/^data:image\/(jpeg|jpg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw)) return raw;
  return '';
}

const WHATSAPP_HOSTS = new Set([
  'chat.whatsapp.com',
  'wa.me',
  'api.whatsapp.com',
  'whatsapp.com',
  'www.whatsapp.com'
]);

/**
 * Normalizes and validates optional WhatsApp invite/chat links.
 * Returns '' if blank, valid normalized HTTPS URL string if valid, or null if unsafe/invalid.
 */
function sanitizeWhatsAppUrl(value) {
  const cleaned = sanitizePlainText(value, 500);
  if (!cleaned) return '';

  const candidate = /^(chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com|whatsapp\.com|www\.whatsapp\.com)\//i.test(cleaned)
    ? `https://${cleaned}`
    : cleaned;

  try {
    const parsed = new URL(candidate);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    if (protocol !== 'https:' || !WHATSAPP_HOSTS.has(host)) {
      return null;
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeEmailAddress(value) {
  const cleaned = sanitizePlainText(value, 254).toLowerCase();
  if (!cleaned) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return '';
  return cleaned;
}

module.exports = {
  sanitizePlainText,
  sanitizeTags,
  slugify,
  escapeRegex,
  ALLOWED_IMAGE_MIME_TYPES,
  fileToDataUri,
  sanitizeMediaUrl,
  sanitizeWhatsAppUrl,
  sanitizeEmailAddress
};

