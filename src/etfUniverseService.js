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
const DAX40_STOCKS = require('./dax40List');
const MDAX_STOCKS = require('./mdaxList');
const { isValidIsinFormat } = require('./masterDataService');
const { getDiscoveredEtfs } = require('./yahooDiscoveryService');

const ASSET_CLASSES = {
  etf: 'etf',
  dax40: 'dax40',
  mdax: 'mdax',
  all: 'all',
};

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

function normalizeAssetClass(assetClass) {
  const key = String(assetClass || 'etf').trim().toLowerCase();
  if (!ASSET_CLASSES[key]) {
    throw new Error('Ungueltiger Asset-Typ. Erlaubt: etf, dax40, mdax, all.');
  }
  return key;
}

function getSourceForProvider(providerName) {
  if (providerName === 'iShares') return ISHARES_ETFS;
  if (providerName === 'Xtrackers') return XTRACKERS_ETFS;
  return [];
}

function getDiscoveryProviderFilter(providerName) {
  return providerName === 'iShares' ? 'ishares' : 'xtrackers';
}

function normalizeUniverseItem(item, providerName) {
  const normalized = {
    provider: providerName,
    ticker: String(item.ticker || '').trim().toUpperCase(),
    name: String(item.name || '').trim(),
    isin: String(item.isin || '').trim().toUpperCase(),
    wkn: item.wkn ? String(item.wkn).trim().toUpperCase() : 'nicht verfügbar',
  };

  return {
    ...normalized,
    isin: isValidIsinFormat(normalized.isin) ? normalized.isin : '',
  };
}

function mergeTickerDuplicates(items) {
  const byTicker = new Map();

  for (const item of items) {
    const existing = byTicker.get(item.ticker);
    if (!existing) {
      byTicker.set(item.ticker, item);
      continue;
    }

    byTicker.set(item.ticker, {
      ...existing,
      name: existing.name.length >= item.name.length ? existing.name : item.name,
      isin: existing.isin || item.isin,
      wkn: existing.wkn !== 'nicht verfügbar' ? existing.wkn : item.wkn,
    });
  }

  return Array.from(byTicker.values());
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

  const [rawStatic, rawDiscovered] = await Promise.all([
    Promise.resolve(getSourceForProvider(providerName)),
    getDiscoveredEtfs({
      providerFilter: getDiscoveryProviderFilter(providerName),
      forceRefresh: bypassCache,
    }),
  ]);

  const normalized = [...rawStatic, ...rawDiscovered]
    .map(item => normalizeUniverseItem(item, providerName))
    .filter(item => item.ticker && item.name);
  const dedupedByTicker = mergeTickerDuplicates(normalized);

  providerCache.set(providerName, {
    data: dedupedByTicker,
    expiresAt: now + UNIVERSE_CACHE_TTL_MS,
  });

  return dedupedByTicker;
}

function getIndexedStockUniverse(items, { assetClass, provider }) {
  const normalized = items
    .map(item => ({
      assetClass,
      provider,
      ticker: String(item.ticker || '').trim().toUpperCase(),
      name: String(item.name || '').trim(),
      isin: String(item.isin || '').trim().toUpperCase(),
      wkn: item.wkn ? String(item.wkn).trim().toUpperCase() : 'nicht verfügbar',
    }))
    .map(item => ({
      ...item,
      isin: isValidIsinFormat(item.isin) ? item.isin : '',
    }))
    .filter(item => item.ticker && item.name);

  const byTicker = new Map();
  for (const item of normalized) {
    if (!byTicker.has(item.ticker)) {
      byTicker.set(item.ticker, item);
    }
  }

  return Array.from(byTicker.values());
}

function getDax40Universe() {
  return getIndexedStockUniverse(DAX40_STOCKS, {
    assetClass: 'dax40',
    provider: 'DAX40',
  });
}

function getMdaxUniverse() {
  return getIndexedStockUniverse(MDAX_STOCKS, {
    assetClass: 'mdax',
    provider: 'MDAX',
  });
}

/**
 * Liefert gefiltertes und dedupliziertes ETF-Universum.
 * Deduplizierung bevorzugt eindeutige ISIN (sonst Anbieter+Ticker).
 *
 * @param {{ providerFilter?: string, bypassCache?: boolean, assetClass?: string }} options
 * @returns {Promise<object[]>}
 */
async function getEtfUniverse({
  providerFilter = 'all',
  bypassCache = false,
  assetClass = 'etf',
} = {}) {
  const normalizedAssetClass = normalizeAssetClass(assetClass);

  if (normalizedAssetClass === 'dax40') {
    return getDax40Universe();
  }

  if (normalizedAssetClass === 'mdax') {
    return getMdaxUniverse();
  }

  if (normalizedAssetClass === 'all') {
    const [etfs, dax40, mdax] = await Promise.all([
      getEtfUniverse({ providerFilter, bypassCache, assetClass: 'etf' }),
      Promise.resolve(getDax40Universe()),
      Promise.resolve(getMdaxUniverse()),
    ]);
    return [...etfs, ...dax40, ...mdax];
  }

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
      byIdentity.set(key, {
        ...etf,
        assetClass: 'etf',
      });
    }
  }

  return Array.from(byIdentity.values());
}

module.exports = {
  getEtfUniverse,
  normalizeAssetClass,
  normalizeProviderFilter,
  _internal: {
    getSourceForProvider,
    providerCache,
    getDax40Universe,
    getMdaxUniverse,
  },
};
