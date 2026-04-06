/**
 * src/etfUniverseService.js
 * Fuehrt mehrere ETF-Datenquellen zu einem gemeinsamen Universum zusammen.
 *
 * Architektur:
 * - Anbieterquelle iShares   (src/etfList.js)
 * - Anbieterquelle Xtrackers (src/xtrackersList.js)
 * - Gemeinsame Verarbeitungsschicht mit Deduplizierung und Caching
 */

'use strict';

const ISHARES_ETFS = require('./etfList');
const XTRACKERS_ETFS = require('./xtrackersList');
const { isValidIsinFormat } = require('./masterDataService');

const PROVIDERS = {
  all: ['iShares', 'Xtrackers'],
  ishares: ['iShares'],
  xtrackers: ['Xtrackers'],
};

const UNIVERSE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Anbieter-spezifischer Cache
const providerCache = new Map();

function normalizeProviderFilter(providerFilter) {
  const key = String(providerFilter || 'all').trim().toLowerCase();
  if (!PROVIDERS[key]) {
    throw new Error('Ungueltiger Anbieterfilter. Erlaubt: all, ishares, xtrackers.');
  }
  return key;
}

function getSourceForProvider(providerName) {
  if (providerName === 'iShares') return ISHARES_ETFS;
  if (providerName === 'Xtrackers') return XTRACKERS_ETFS;
  return [];
}

/**
 * Laedt eine Anbieterliste aus statischer Quelle und cached sie separat.
 * @param {string} providerName
 * @param {boolean} bypassCache
 * @returns {Promise<object[]>}
 */
async function getProviderEtfs(providerName, bypassCache) {
  const now = Date.now();

  if (!bypassCache && providerCache.has(providerName)) {
    const cached = providerCache.get(providerName);
    if (now < cached.expiresAt) {
      return cached.data;
    }
  }

  const raw = getSourceForProvider(providerName);

  const normalized = raw
    .map(item => ({
      provider: providerName,
      ticker: String(item.ticker || '').trim().toUpperCase(),
      name: String(item.name || '').trim(),
      isin: String(item.isin || '').trim().toUpperCase(),
      wkn: item.wkn ? String(item.wkn).trim().toUpperCase() : 'nicht verfügbar',
    }))
    .filter(item => item.ticker && item.name && isValidIsinFormat(item.isin));

  providerCache.set(providerName, {
    data: normalized,
    expiresAt: now + UNIVERSE_CACHE_TTL_MS,
  });

  return normalized;
}

/**
 * Liefert gefiltertes und dedupliziertes ETF-Universum.
 * Deduplizierung bevorzugt eindeutige ISIN (sonst Anbieter+Ticker).
 *
 * @param {{ providerFilter?: string, bypassCache?: boolean }} options
 * @returns {Promise<object[]>}
 */
async function getEtfUniverse({ providerFilter = 'all', bypassCache = false } = {}) {
  const normalizedFilter = normalizeProviderFilter(providerFilter);
  const selectedProviders = PROVIDERS[normalizedFilter];

  const providerLists = await Promise.all(
    selectedProviders.map(provider => getProviderEtfs(provider, bypassCache))
  );

  const merged = providerLists.flat();
  const byIdentity = new Map();

  for (const etf of merged) {
    const key = etf.isin || `${etf.provider}|${etf.ticker}`;
    if (!byIdentity.has(key)) {
      byIdentity.set(key, etf);
    }
  }

  return Array.from(byIdentity.values());
}

module.exports = {
  getEtfUniverse,
  normalizeProviderFilter,
};
