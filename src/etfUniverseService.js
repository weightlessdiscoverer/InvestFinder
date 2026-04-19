/**
 * src/etfUniverseService.js
 * Liefert das Universum der Aktien aus DAX40 und MDAX.
 *
 * Architektur:
 * - Statische DAX40-Liste (src/dax40List.js)
 * - Statische MDAX-Liste (src/mdaxList.js)
 * - Gemeinsame Verarbeitung mit Deduplizierung und Asset-Class-Tagging
 */

'use strict';

const DAX40_STOCKS = require('./dax40List');
const MDAX_STOCKS = require('./mdaxList');
const { isValidIsinFormat } = require('./masterDataService');

const ASSET_CLASSES = {
  all: 'all',
  dax40: 'dax40',
  mdax: 'mdax',
  daxmdax: 'daxmdax',
};

const PROVIDERS = {
  all: ['dax40', 'mdax'],
  dax40: ['dax40'],
  mdax: ['mdax'],
};

function normalizeProviderFilter(providerFilter) {
  const key = String(providerFilter || 'all').trim().toLowerCase();
  if (!PROVIDERS[key]) {
    throw new Error('Ungueltiger Anbieterfilter. Erlaubt: all, dax40, mdax.');
  }
  return key;
}

function normalizeAssetClass(assetClass) {
  const key = String(assetClass || 'all').trim().toLowerCase();
  if (!ASSET_CLASSES[key]) {
    throw new Error('Ungueltiger Asset-Typ. Erlaubt: all, dax40, mdax, daxmdax.');
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

function getDaxMdaxUniverse() {
  return [...getDax40Universe(), ...getMdaxUniverse()];
}

/**
 * Liefert das Aktienuniversum (DAX40 / MDAX).
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

  if (normalizedAssetClass === 'daxmdax') {
    return getDaxMdaxUniverse();
  }

  const selectedProviders = PROVIDERS[normalizedFilter];
  const universes = [];

  if (selectedProviders.includes('dax40')) {
    universes.push(getDax40Universe());
  }

  if (selectedProviders.includes('mdax')) {
    universes.push(getMdaxUniverse());
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
    getDaxMdaxUniverse,
  },
};
