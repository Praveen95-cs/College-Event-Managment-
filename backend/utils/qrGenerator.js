const QRCode = require('qrcode');

/**
 * Generates a crisp vector SVG QR code compliant with ISO/IEC 18004
 * for YouPI-PG UPI payment URIs.
 *
 * @param {string} text
 * @param {{ boxSize?: number, errorCorrection?: 'L'|'M'|'Q'|'H' }} [options]
 * @returns {Promise<string>}
 */
async function generateQrSvg(text, options = {}) {
  const value = String(text || '').trim();
  if (!value) {
    throw new Error('QR payload text cannot be empty');
  }
  const boxSize = Number(options.boxSize) > 0 ? Number(options.boxSize) : 220;
  const errorCorrectionLevel = ['L', 'M', 'Q', 'H'].includes(options.errorCorrection)
    ? options.errorCorrection
    : 'M';

  const rawSvg = await QRCode.toString(value, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  if (!/\bwidth=/.test(rawSvg)) {
    return rawSvg.replace(/<svg\b([^>]*)>/i, `<svg$1 width="${boxSize}" height="${boxSize}">`);
  }
  return rawSvg;
}

/**
 * Generates an inline PNG data URI fallback for legacy renderers.
 * @param {string} text
 * @param {{ boxSize?: number, errorCorrection?: 'L'|'M'|'Q'|'H' }} [options]
 * @returns {Promise<string>}
 */
async function generateQrDataUrl(text, options = {}) {
  const value = String(text || '').trim();
  if (!value) {
    throw new Error('QR payload text cannot be empty');
  }
  const boxSize = Number(options.boxSize) > 0 ? Number(options.boxSize) : 220;
  const errorCorrectionLevel = ['L', 'M', 'Q', 'H'].includes(options.errorCorrection)
    ? options.errorCorrection
    : 'M';

  return QRCode.toDataURL(value, {
    width: boxSize,
    margin: 2,
    errorCorrectionLevel,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });
}

module.exports = {
  generateQrSvg,
  generateQrDataUrl
};
