/**
 * Optional custom Popular Times asset (Availability — general + client).
 * Supports PDF and common image formats (PNG, JPEG, GIF, WebP, SVG).
 * Default: bundled Front-End/images/Popular-Times-at-HBC.pdf
 * Custom: Front-End/uploads/popular-times/popular-times.<ext>
 * Admin Remove sets hidden=true so Availability pages show no asset until a new file is saved.
 */
const fs = require('fs');
const path = require('path');
const { parseDataUrlToBuffer, detectImageAssetFormat } = require('./detectImageAssetFormat');

const FRONT_END = path.join(__dirname, '..', '..', 'Front-End');
const UPLOAD_DIR = path.join(FRONT_END, 'uploads', 'popular-times');
const STATE_PATH = path.join(__dirname, '..', 'data', 'popular-times-state.json');
const BASE_NAME = 'popular-times';
const DEFAULT_URL = '/images/Popular-Times-at-HBC.pdf';

function readHiddenFlag() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const j = JSON.parse(raw);
    return j.hidden === true;
  } catch (e) {
    return false;
  }
}

function writeHiddenFlag(hidden) {
  const dir = path.dirname(STATE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify({ hidden: !!hidden }) + '\n', 'utf8');
}

/** @type {Record<string, string>} mime (lowercase) → file extension including dot */
const MIME_TO_EXT = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function ensureDirs() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function listCustomFiles() {
  ensureDirs();
  try {
    return fs.readdirSync(UPLOAD_DIR).filter(function (name) {
      return new RegExp('^' + BASE_NAME + '\\.', 'i').test(name) && !/\.json$/i.test(name);
    });
  } catch (e) {
    return [];
  }
}

function customFilePath() {
  const files = listCustomFiles();
  if (files.length === 0) return null;
  files.sort();
  return path.join(UPLOAD_DIR, files[0]);
}

function hasCustom() {
  try {
    const p = customFilePath();
    return p != null && fs.existsSync(p) && fs.statSync(p).size > 0;
  } catch (e) {
    return false;
  }
}

/** @returns {'pdf'|'image'} */
function getKindForPath(filePath) {
  if (!filePath) return 'pdf';
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.pdf' ? 'pdf' : 'image';
}

/**
 * Public URL path and whether the asset is rendered as PDF (pdf.js) or as an image.
 */
function getPublicPayload() {
  const p = customFilePath();
  if (!p || !fs.existsSync(p)) {
    const hidden = readHiddenFlag();
    return {
      url: DEFAULT_URL,
      hasCustom: false,
      kind: 'pdf',
      visible: !hidden,
    };
  }
  const name = path.basename(p);
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(p).mtimeMs;
  } catch (e) {}
  return {
    url: '/uploads/popular-times/' + name + (mtimeMs ? '?v=' + mtimeMs : ''),
    hasCustom: true,
    kind: getKindForPath(p),
    visible: true,
  };
}

function getPublicUrl() {
  return getPublicPayload().url;
}

function removeCustomFiles() {
  ensureDirs();
  for (const name of listCustomFiles()) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, name));
    } catch (e) {}
  }
}

function validateBuffer(mime, buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) {
    return { ok: false, error: 'File is empty or too small.' };
  }
  if (buf.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: 'File must be ' + Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024)) + ' MB or smaller.',
    };
  }
  const head = buf.slice(0, 12);
  const h = head.toString('latin1');
  const hUtf8 = buf.slice(0, Math.min(buf.length, 256)).toString('utf8').trim();

  if (mime === 'application/pdf') {
    if (h.slice(0, 5) !== '%PDF-') return { ok: false, error: 'Not a valid PDF file.' };
    return { ok: true };
  }
  if (mime === 'image/png') {
    if (head[0] !== 0x89 || head[1] !== 0x50) return { ok: false, error: 'Not a valid PNG file.' };
    return { ok: true };
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    if (head[0] !== 0xff || head[1] !== 0xd8) return { ok: false, error: 'Not a valid JPEG file.' };
    return { ok: true };
  }
  if (mime === 'image/gif') {
    if (h.slice(0, 6) !== 'GIF87a' && h.slice(0, 6) !== 'GIF89a') {
      return { ok: false, error: 'Not a valid GIF file.' };
    }
    return { ok: true };
  }
  if (mime === 'image/webp') {
    if (buf.length < 12 || h.slice(0, 4) !== 'RIFF' || buf.slice(8, 12).toString('ascii') !== 'WEBP') {
      return { ok: false, error: 'Not a valid WebP file.' };
    }
    return { ok: true };
  }
  if (mime === 'image/svg+xml') {
    if (!/^<\?xml|^<svg/i.test(hUtf8)) {
      return { ok: false, error: 'Not a valid SVG file.' };
    }
    return { ok: true };
  }
  return { ok: false, error: 'Unsupported file type.' };
}

/**
 * Parse data URL from FileReader.readAsDataURL; return mime + buffer.
 * @returns {{ mime: string, buf: Buffer } | null}
 */
function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const trimmed = dataUrl.trim();
  const comma = trimmed.indexOf(',');
  if (comma === -1) return null;
  const header = trimmed.slice(0, comma);
  const payload = trimmed.slice(comma + 1);
  const mimeMatch = /^data:([^;,]+)/i.exec(header);
  if (!mimeMatch) return null;
  let mime = mimeMatch[1].trim().toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';

  const isBase64 = /;base64/i.test(header);
  let buf;
  try {
    if (isBase64) {
      buf = Buffer.from(payload, 'base64');
    } else {
      buf = Buffer.from(decodeURIComponent(payload.replace(/\+/g, ' ')), 'utf8');
    }
  } catch (e) {
    return null;
  }

  if (!MIME_TO_EXT[mime]) return null;
  return { mime, buf };
}

/**
 * @param {string} dataUrl - data:*;base64,... from FileReader
 */
function setFromDataUrl(dataUrl) {
  ensureDirs();
  const parsed = parseDataUrlToBuffer(dataUrl);
  if (!parsed) {
    return {
      ok: false,
      error: 'Could not read the uploaded file. Try again or use a different file.',
    };
  }
  const fmt = detectImageAssetFormat(parsed.buf, MAX_UPLOAD_BYTES);
  if (!fmt) {
    return {
      ok: false,
      error:
        'Unsupported file type. Use PDF, PNG, JPG, GIF, WebP, SVG, BMP, TIFF, ICO, AVIF, HEIC, or another common image format.',
    };
  }

  removeCustomFiles();
  const outPath = path.join(UPLOAD_DIR, BASE_NAME + fmt.ext);
  try {
    fs.writeFileSync(outPath, parsed.buf);
  } catch (e) {
    return { ok: false, error: 'Could not save file.' };
  }
  writeHiddenFlag(false);
  return { ok: true };
}

function clearCustom() {
  try {
    removeCustomFiles();
  } catch (e) {
    return { ok: false, error: 'Could not remove custom file.' };
  }
  writeHiddenFlag(true);
  return { ok: true };
}

module.exports = {
  getPublicUrl,
  getPublicPayload,
  hasCustom,
  setFromDataUrl,
  clearCustom,
  MAX_PDF_BYTES: MAX_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  DEFAULT_URL,
};
