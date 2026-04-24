/**
 * src/etfUniverseService.js
 * Liefert das Universum der Aktien aus DAX40, MDAX, SDAX, S&P 500 und ETFs.
 *
 * Architektur:
 * - Statische DAX40-Liste (src/dax40List.js)
 * - Statische MDAX-Liste (src/mdaxList.js)
 * - Statische SDAX-Liste (src/sdaxList.js)
 * - Statische S&P 500-Liste (src/sp500List.js)
 * - Statische iShares ETF-Liste (src/etfList.js)
 * - Statische Xtrackers ETF-Liste (src/xtrackersList.js)
 * - Gemeinsame Verarbeitung mit Deduplizierung und Asset-Class-Tagging
 */

'use strict';

const DAX40_STOCKS = require('./dax40List');
const MDAX_STOCKS = require('./mdaxList');
const SDAX_STOCKS = require('./sdaxList');
const SP500_STOCKS = require('./sp500List');
const ISHARES_ETFS = require('./etfList');
const XTRACKERS_ETFS = require('./xtrackersList');
const { isValidIsinFormat } = require('./masterDataService');

const ASSET_CLASSES = {
  all: 'all',
  dax40: 'dax40',
  mdax: 'mdax',
  sdax: 'sdax',
  sp500: 'sp500',
  etf: 'etf',
  daxmdax: 'daxmdax',
  daxmdaxsdax: 'daxmdaxsdax',
  daxmdaxsdaxsp500: 'daxmdaxsdaxsp500',
};

const PROVIDERS = {
  all: ['dax40', 'mdax', 'sdax', 'sp500', 'ishares', 'xtrackers'],
  dax40: ['dax40'],
  mdax: ['mdax'],
  sdax: ['sdax'],
  sp500: ['sp500'],
  ishares: ['ishares'],
  xtrackers: ['xtrackers'],
};

function normalizeProviderFilter(providerFilter) {
  const key = String(providerFilter || 'all').trim().toLowerCase();
  if (!PROVIDERS[key]) {
    throw new Error('Ungueltiger Anbieterfilter. Erlaubt: all, dax40, mdax, sdax, sp500, ishares, xtrackers.');
  }
  return key;
}

function normalizeAssetClass(assetClass) {
  const key = String(assetClass || 'all').trim().toLowerCase();
  if (!ASSET_CLASSES[key]) {
    throw new Error('Ungueltiger Asset-Typ. Erlaubt: all, dax40, mdax, sdax, sp500, etf, daxmdax, daxmdaxsdax, daxmdaxsdaxsp500.');
  }
  return key;
}

function normalizeUniverseItem(item, providerName, assetClass) {
  const normalized = {
    provider: providerName,
    assetClass,
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

function getIndexedStockUniverse(items, { assetClass, provider }) {
  const normalized = items
    .map(item => normalizeUniverseItem(item, provider, assetClass))
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

function getSdaxUniverse() {
  return getIndexedStockUniverse(SDAX_STOCKS, {
    assetClass: 'sdax',
    provider: 'SDAX',
  });
}

function getSp500Universe() {
  return getIndexedStockUniverse(SP500_STOCKS, {
    assetClass: 'sp500',
    provider: 'SP500',
  });
}

function getIsharesUniverse() {
  return getIndexedStockUniverse(ISHARES_ETFS, {
    assetClass: 'etf',
    provider: 'iShares',
  });
}

function getXtrackersUniverse() {
  return getIndexedStockUniverse(XTRACKERS_ETFS, {
    assetClass: 'etf',
    provider: 'Xtrackers',
  });
}

function getDaxMdaxUniverse() {
  return [...getDax40Universe(), ...getMdaxUniverse()];
}

function getDaxMdaxSdaxUniverse() {
  return [...getDax40Universe(), ...getMdaxUniverse(), ...getSdaxUniverse()];
}

function getDaxMdaxSdaxSp500Universe() {
  return [...getDax40Universe(), ...getMdaxUniverse(), ...getSdaxUniverse(), ...getSp500Universe()];
}

/**
 * Liefert das Aktienuniversum (DAX40 / MDAX / SDAX).
 *
 * @param {{ providerFilter?: string, bypassCache?: boolean, assetClass?: string }} options
 * @returns {Promise<object[]>}
 */
async function getEtfUniverse({
  providerFilter = 'all',
  bypassCache = false,
  assetClass = 'all',
} = {}) {
  const normalizedAssetClass = normalizeAssetClass(assetClass);
  const normalizedFilter = normalizeProviderFilter(providerFilter);

  if (normalizedAssetClass === 'dax40') {
    return getDax40Universe();
  }

  if (normalizedAssetClass === 'mdax') {
    return getMdaxUniverse();
  }

  if (normalizedAssetClass === 'sdax') {
    return getSdaxUniverse();
  }

  if (normalizedAssetClass === 'sp500') {
    return getSp500Universe();
  }

  if (normalizedAssetClass === 'etf') {
    return [...getIsharesUniverse(), ...getXtrackersUniverse()];
  }

  if (normalizedAssetClass === 'daxmdax') {
    return getDaxMdaxUniverse();
  }

  if (normalizedAssetClass === 'daxmdaxsdax') {
    return getDaxMdaxSdaxUniverse();
  }

  if (normalizedAssetClass === 'daxmdaxsdaxsp500') {
    return getDaxMdaxSdaxSp500Universe();
  }

  const selectedProviders = PROVIDERS[normalizedFilter];
  const universes = [];

  if (selectedProviders.includes('dax40')) {
    universes.push(getDax40Universe());
  }

  if (selectedProviders.includes('mdax')) {
    universes.push(getMdaxUniverse());
  }

  if (selectedProviders.includes('sdax')) {
    universes.push(getSdaxUniverse());
  }

  if (selectedProviders.includes('sp500')) {
    universes.push(getSp500Universe());
  }

  if (selectedProviders.includes('ishares')) {
    universes.push(getIsharesUniverse());
  }

  if (selectedProviders.includes('xtrackers')) {
    universes.push(getXtrackersUniverse());
  }

  return universes.flat();
}

module.exports = {
  getEtfUniverse,
  normalizeAssetClass,
  normalizeProviderFilter,
  _internal: {
    getDax40Universe,
    getMdaxUniverse,
    getSdaxUniverse,
    getSp500Universe,
    getIsharesUniverse,
    getXtrackersUniverse,
    getDaxMdaxUniverse,
    getDaxMdaxSdaxUniverse,
    getDaxMdaxSdaxSp500Universe,
  },
};
