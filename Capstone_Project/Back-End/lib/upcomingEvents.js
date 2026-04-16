/**
 * Persisted upcoming-event promo images (home dashboard).
 * Images live under Front-End/uploads/upcoming-events/; metadata in data/upcoming-events.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseDataUrlToBuffer, detectImageAssetFormat } = require('./detectImageAssetFormat');

const FRONT_END = path.join(__dirname, '..', '..', 'Front-End');
const DATA_PATH = path.join(__dirname, '..', 'data', 'upcoming-events.json');
const UPLOAD_WEB_PREFIX = '/uploads/upcoming-events/';
const UPLOAD_DIR = path.join(FRONT_END, 'uploads', 'upcoming-events');

const MIN_SLOTS = 1;
const MAX_SLOTS = 6;
const DEFAULT_SLOTS = 3;

/** Max decoded image size (base64 JSON upload; keep in sync with server body limit) */
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

function ensureDirs() {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function safeFilePathForUrl(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') return null;
  if (!urlPath.startsWith(UPLOAD_WEB_PREFIX)) return null;
  const rel = urlPath.replace(/^\//, '');
  const full = path.join(FRONT_END, rel);
  const resolved = path.resolve(full);
  const allowedRoot = path.resolve(UPLOAD_DIR);
  if (!resolved.startsWith(allowedRoot)) return null;
  return resolved;
}

function emptySlot() {
  return { url: null, alt: '' };
}

function defaultState() {
  return {
    images: Array.from({ length: DEFAULT_SLOTS }, () => emptySlot()),
  };
}

function normalizeImagesArray(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return Array.from({ length: DEFAULT_SLOTS }, () => emptySlot());
  }
  let out = images.map((slot) => {
    if (slot && typeof slot === 'object') {
      return {
        url: typeof slot.url === 'string' ? slot.url : null,
        alt: typeof slot.alt === 'string' ? slot.alt : '',
      };
    }
    return emptySlot();
  });
  if (out.length > MAX_SLOTS) {
    for (let i = MAX_SLOTS; i < out.length; i++) {
      deleteFileIfManaged(out[i].url);
    }
    out = out.slice(0, MAX_SLOTS);
  }
  if (out.length < MIN_SLOTS) {
    while (out.length < MIN_SLOTS) out.push(emptySlot());
  }
  return out;
}

function readState() {
  ensureDirs();
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.images)) return defaultState();
    return { images: normalizeImagesArray(data.images) };
  } catch (_) {
    return defaultState();
  }
}

function writeState(state) {
  ensureDirs();
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function deleteFileIfManaged(urlPath) {
  const fp = safeFilePathForUrl(urlPath);
  if (!fp) return;
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (_) {}
}

function slotBoundsError(len) {
  return { ok: false, error: `Invalid slot. Use index 0–${len - 1}.` };
}

function setSlotCount(n) {
  const count = typeof n === 'number' && Number.isInteger(n) ? n : parseInt(n, 10);
  if (!Number.isInteger(count) || count < MIN_SLOTS || count > MAX_SLOTS) {
    return { ok: false, error: `Choose between ${MIN_SLOTS} and ${MAX_SLOTS} images.` };
  }
  const state = readState();
  const cur = state.images.length;
  if (count === cur) return { ok: true };
  if (count < cur) {
    for (let i = count; i < cur; i++) {
      deleteFileIfManaged(state.images[i].url);
    }
    state.images = state.images.slice(0, count);
  } else {
    for (let i = cur; i < count; i++) {
      state.images.push(emptySlot());
    }
  }
  writeState(state);
  return { ok: true };
}

function setSlotImage(slotIndex, dataUrl, alt) {
  const state = readState();
  const len = state.images.length;
  if (slotIndex < 0 || slotIndex >= len || !Number.isInteger(slotIndex)) {
    return slotBoundsError(len);
  }
  const parsed = parseDataUrlToBuffer(dataUrl);
  if (!parsed) {
    return { ok: false, error: 'Could not read the uploaded file.' };
  }
  const buf = parsed.buf;
  if (buf.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'File must be 50 MB or smaller.' };
  }
  const fmt = detectImageAssetFormat(buf, MAX_IMAGE_BYTES);
  if (!fmt || fmt.ext === '.pdf') {
    return {
      ok: false,
      error:
        'Unsupported image type. Use PNG, JPG, GIF, WebP, SVG, BMP, TIFF, ICO, AVIF, HEIC, or another common image format.',
    };
  }
  ensureDirs();
  const prevUrl = state.images[slotIndex] && state.images[slotIndex].url;
  const name = `slot-${slotIndex}-${crypto.randomBytes(8).toString('hex')}${fmt.ext}`;
  const diskPath = path.join(UPLOAD_DIR, name);
  fs.writeFileSync(diskPath, buf);
  const publicUrl = UPLOAD_WEB_PREFIX + name;
  deleteFileIfManaged(prevUrl);
  state.images[slotIndex] = {
    url: publicUrl,
    alt: typeof alt === 'string' ? alt.slice(0, 200) : '',
  };
  writeState(state);
  return { ok: true };
}

function clearSlot(slotIndex) {
  const state = readState();
  const len = state.images.length;
  if (slotIndex < 0 || slotIndex >= len || !Number.isInteger(slotIndex)) {
    return slotBoundsError(len);
  }
  const prevUrl = state.images[slotIndex] && state.images[slotIndex].url;
  deleteFileIfManaged(prevUrl);
  state.images[slotIndex] = emptySlot();
  writeState(state);
  return { ok: true };
}

function getPublicPayload() {
  const state = readState();
  return {
    images: state.images.map((entry) => ({
      url: entry.url || null,
      alt: entry.alt || '',
    })),
    slotCount: state.images.length,
    minSlots: MIN_SLOTS,
    maxSlots: MAX_SLOTS,
  };
}

module.exports = {
  setSlotImage,
  clearSlot,
  setSlotCount,
  getPublicPayload,
  MIN_SLOTS,
  MAX_SLOTS,
  MAX_IMAGE_BYTES,
};
