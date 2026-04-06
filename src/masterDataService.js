/**
 * src/masterDataService.js
 * Lädt und validiert ETF-Stammdaten (ISIN/WKN) getrennt von Kursdaten.
 *
 * Datenquelle:
 * - Statische JSON-Datei unter src/data/etfMasterData.json
 * - Zuordnung erfolgt eindeutig über den vollständigen Yahoo-Ticker inkl. Suffix
 *   (z. B. "IWDA.AS" vs. "IWDA.L"), um Regional-Kollisionen zu vermeiden.
 */

'use strict';

const fs = require('fs/promises');
const path = require('path');

const MASTER_DATA_FILE = path.join(__dirname, 'data', 'etfMasterData.json');
const MASTER_DATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cache = null;
let loadPromise = null;

/**
 * Prüft das ISIN-Format (12-stellig, alphanumerisch).
 * @param {string|null|undefined} isin
 * @returns {boolean}
 */
function isValidIsinFormat(isin) {
  return typeof isin === 'string' && /^[A-Z0-9]{12}$/.test(isin.trim().toUpperCase());
}

/**
 * @param {string} ticker
 * @returns {string}
 */
function normalizeTicker(ticker) {
  return String(ticker || '').trim().toUpperCase();
}

function normalizeIsin(isinValue, ticker) {
  const isinRaw = isinValue ? String(isinValue).trim().toUpperCase() : null;
  const isin = isValidIsinFormat(isinRaw) ? isinRaw : null;

  if (isinRaw && !isin) {
    console.warn(`[masterDataService] Invalid ISIN format ignored for ${ticker}: ${isinRaw}`);
  }

  return isin;
}

function normalizeWkn(wknValue) {
  const wknRaw = wknValue ? String(wknValue).trim().toUpperCase() : null;
  return wknRaw || null;
}

function buildMasterDataItem(entry, parsedSource, ticker) {
  return {
    isin: normalizeIsin(entry.isin, ticker),
    wkn: normalizeWkn(entry.wkn),
    source: entry.source ? String(entry.source) : parsedSource || 'Statisches Mapping',
  };
}

function parseMasterDataContent(raw) {
  const parsed = JSON.parse(raw);
  return {
    parsed,
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

function insertEntryIntoIndex(byTicker, entry, parsedSource) {
  const ticker = normalizeTicker(entry.ticker);
  if (!ticker) {
    return;
  }

  if (byTicker.has(ticker)) {
    console.warn(`[masterDataService] Duplicate ticker in master data ignored: ${ticker}`);
    return;
  }

  byTicker.set(ticker, buildMasterDataItem(entry, parsedSource, ticker));
}

/**
 * Lädt Mapping-Datei und baut einen Index nach Ticker auf.
 * Doppelte Ticker werden verworfen, um falsche Zuordnungen zu verhindern.
 *
 * @returns {Promise<{ byTicker: Map<string, object>, meta: object, expiresAt: number }>} 
 */
async function loadMasterDataFromFile() {
  const raw = await fs.readFile(MASTER_DATA_FILE, 'utf8');
  const { parsed, items } = parseMasterDataContent(raw);
  const byTicker = new Map();

  for (const entry of items) {
    insertEntryIntoIndex(byTicker, entry, parsed.source);
  }

  return {
    byTicker,
    meta: {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || null,
      source: parsed.source || 'Statisches Mapping',
      entries: byTicker.size,
    },
    expiresAt: Date.now() + MASTER_DATA_CACHE_TTL_MS,
  };
}

/**
 * Holt den gecachten Ticker-Index, lädt bei Bedarf neu.
 * @param {{ bypassCache?: boolean }} options
 * @returns {Promise<{ byTicker: Map<string, object>, meta: object }>} 
 */
async function getMasterDataIndex({ bypassCache = false } = {}) {
  const now = Date.now();

  if (!bypassCache && cache && now < cache.expiresAt) {
    return cache;
  }

  if (!loadPromise) {
    loadPromise = loadMasterDataFromFile()
      .then(loaded => {
        cache = loaded;
        return loaded;
      })
      .finally(() => {
        loadPromise = null;
      });
  }

  return loadPromise;
}

/**
 * Warm-up für Cache, damit Datei nicht für jeden ETF neu gelesen wird.
 * @param {{ bypassCache?: boolean }} options
 */
async function warmMasterDataCache({ bypassCache = false } = {}) {
  await getMasterDataIndex({ bypassCache });
}

/**
 * Liefert Identifier für einen ETF-Ticker.
 * Falls keine Daten vorhanden sind, wird "nicht verfügbar" zurückgegeben.
 *
 * @param {string} ticker
 * @returns {Promise<{ isin: string, wkn: string, source: string, hasMasterData: boolean }>} 
 */
async function getIdentifiersByTicker(ticker) {
  const index = await getMasterDataIndex();
  const key = normalizeTicker(ticker);
  const item = index.byTicker.get(key);

  if (!item) {
    return {
      isin: 'nicht verfügbar',
      wkn: 'nicht verfügbar',
      source: index.meta.source,
      hasMasterData: false,
    };
  }

  return {
    isin: item.isin || 'nicht verfügbar',
    wkn: item.wkn || 'nicht verfügbar',
    source: item.source || index.meta.source,
    hasMasterData: Boolean(item.isin || item.wkn),
  };
}

module.exports = {
  isValidIsinFormat,
  getMasterDataIndex,
  warmMasterDataCache,
  getIdentifiersByTicker,
};
