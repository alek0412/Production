/**
 * Membership pricing asset (General + Client Membership pages).
 * PDF or images; format detected from file contents. Max 50 MB for membership pricing.
 * Default: Front-End/images/HBC_Pricing_Sheet.png
 * Custom: Front-End/uploads/membership-pricing/membership-pricing.<ext>
 * Admin "Remove" sets hidden=true so public pages show nothing until a new file is saved.
 */
const fs = require('fs');
const path = require('path');
const { parseDataUrlToBuffer, detectImageAssetFormat } = require('./detectImageAssetFormat');

const FRONT_END = path.join(__dirname, '..', '..', 'Front-End');
const UPLOAD_DIR = path.join(FRONT_END, 'uploads', 'membership-pricing');
const STATE_PATH = path.join(__dirname, '..', 'data', 'membership-pricing-state.json');
const BASE_NAME = 'membership-pricing';
const DEFAULT_URL = '/images/HBC_Pricing_Sheet.png';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

function dataRevision() {
  let r = 0;
  try {
    if (fs.existsSync(STATE_PATH)) r = Math.max(r, fs.statSync(STATE_PATH).mtimeMs);
  } catch (e) {}
  const p = customFilePath();
  try {
    if (p && fs.existsSync(p)) r = Math.max(r, fs.statSync(p).mtimeMs);
  } catch (e) {}
  return r;
}

function removeCustomFiles() {
  ensureDirs();
  for (const name of listCustomFiles()) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, name));
    } catch (e) {}
  }
}

/** @returns {'pdf'|'image'} */
function getKindForPath(filePath) {
  if (!filePath) return 'image';
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.pdf' ? 'pdf' : 'image';
}

function getPublicPayload() {
  const rev = dataRevision();
  const p = customFilePath();
  if (!p || !fs.existsSync(p)) {
    const hidden = readHiddenFlag();
    return {
      url: DEFAULT_URL,
      hasCustom: false,
      kind: 'image',
      visible: !hidden,
      revision: rev,
    };
  }
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(p).mtimeMs;
  } catch (e) {}
  const name = path.basename(p);
  return {
    url: '/uploads/membership-pricing/' + name + (mtimeMs ? '?v=' + mtimeMs : ''),
    hasCustom: true,
    kind: getKindForPath(p),
    visible: true,
    revision: rev,
  };
}

function setFromDataUrl(dataUrl) {
  ensureDirs();
  const parsed = parseDataUrlToBuffer(dataUrl);
  if (!parsed) {
    return {
      ok: false,
      error: 'Could not read the uploaded file. Try again or use a different file.',
    };
  }
  const buf = parsed.buf;
  if (buf.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: 'File must be ' + Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024)) + ' MB or smaller.',
    };
  }

  const fmt = detectImageAssetFormat(buf, MAX_UPLOAD_BYTES);
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
    fs.writeFileSync(outPath, buf);
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
  getPublicPayload,
  setFromDataUrl,
  clearCustom,
  MAX_UPLOAD_BYTES,
  DEFAULT_URL,
};
