/**
 * Membership specials box: closed teaser + open content (name + description per special).
 * Persisted: Back-End/data/membership-specials.json
 * Legacy: membership-specials-teaser.json (migrated)
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'membership-specials.json');
const LEGACY_PATH = path.join(__dirname, '..', 'data', 'membership-specials-teaser.json');

const DEFAULT_TEASER = 'Click here to see our specials!';
const MAX_TEASER = 500;
const MAX_ITEMS = 20;
const MAX_NAME = 200;
const MAX_DESC = 4000;

const DEFAULT_ITEMS = [
  {
    name: 'Weekend Happy Hour',
    description:
      'Saturday and Sunday after 7PM\n$3 OFF Regular Drop-in Fees\nMembers can bring first-time guests for free',
  },
  {
    name: 'Day Pass Package',
    description: 'Buy nine day passes and get one free!\n(Day passes do not expire)',
  },
];

function ensureDir() {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
}

function defaultState() {
  return {
    teaserText: DEFAULT_TEASER,
    items: JSON.parse(JSON.stringify(DEFAULT_ITEMS)),
  };
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name =
    typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_NAME) : '';
  if (!name) return null;
  let description = '';
  if (typeof raw.description === 'string') {
    description = raw.description.slice(0, MAX_DESC);
  }
  return { name, description };
}

function normalizeState(j) {
  const out = defaultState();
  if (j && typeof j.teaserText === 'string') {
    const t = j.teaserText.trim();
    if (t) out.teaserText = t.slice(0, MAX_TEASER);
  }
  if (j && Array.isArray(j.items)) {
    const items = [];
    for (let i = 0; i < j.items.length && items.length < MAX_ITEMS; i++) {
      const n = normalizeItem(j.items[i]);
      if (n) items.push(n);
    }
    if (items.length > 0) out.items = items;
  }
  return out;
}

function readState() {
  ensureDir();
  try {
    if (fs.existsSync(DATA_PATH)) {
      const j = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      return normalizeState(j);
    }
  } catch (e) {
    /* fall through */
  }
  try {
    if (fs.existsSync(LEGACY_PATH)) {
      const j = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8'));
      const merged = defaultState();
      if (j && typeof j.teaserText === 'string' && j.teaserText.trim()) {
        merged.teaserText = j.teaserText.trim().slice(0, MAX_TEASER);
      }
      writeState(merged);
      return merged;
    }
  } catch (e) {
    /* fall through */
  }
  return defaultState();
}

function writeState(data) {
  ensureDir();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getPublicPayload() {
  const state = readState();
  let revision = 0;
  try {
    if (fs.existsSync(DATA_PATH)) revision = fs.statSync(DATA_PATH).mtimeMs;
  } catch (e) {}
  return { teaserText: state.teaserText, items: state.items, revision };
}

function setFullState(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request.' };
  }
  if (typeof body.teaserText !== 'string' || !body.teaserText.trim()) {
    return { ok: false, error: 'Teaser text cannot be empty.' };
  }
  if (!Array.isArray(body.items) || body.items.length < 1) {
    return { ok: false, error: 'Add at least one special.' };
  }
  if (body.items.length > MAX_ITEMS) {
    return { ok: false, error: 'Too many specials.' };
  }
  const items = [];
  for (let i = 0; i < body.items.length; i++) {
    const n = normalizeItem(body.items[i]);
    if (!n) {
      return { ok: false, error: 'Each special needs a name.' };
    }
    items.push(n);
  }
  const teaserText = body.teaserText.trim().slice(0, MAX_TEASER);
  writeState({ teaserText, items });
  return { ok: true };
}

function resetToDefault() {
  writeState(defaultState());
  return { ok: true };
}

module.exports = {
  getPublicPayload,
  setFullState,
  resetToDefault,
  defaultState,
  DEFAULT_TEASER,
  DEFAULT_ITEMS,
};
