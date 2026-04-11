'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const CACHE_DIR = path.join(__dirname, 'data', 'provider-cache');
const DISCOVERY_FILE = path.join(CACHE_DIR, 'yahoo-discovery-db.json');
const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_DELAY_MS = 180;

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

const PROVIDER_SEARCH = {
  iShares: {
    key: 'ishares',
    aliases: ['iShares', 'BlackRock iShares'],
  },
  Xtrackers: {
    key: 'xtrackers',
    aliases: ['Xtrackers', 'DWS Xtrackers'],
  },
};

let discoveryLoadPromise = null;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildSeeds(providerName) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const base = providerName === 'iShares'
    ? ['iShares ETF', 'iShares UCITS ETF']
    : ['Xtrackers ETF', 'Xtrackers UCITS ETF'];

  return [...base, ...letters.map(letter => `${providerName} ${letter}`)];
}

async function readDiscoveryCache() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  try {
    const raw = await fs.readFile(DISCOVERY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeDiscoveryCache(payload) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(DISCOVERY_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function looksLikeEtfQuote(quote) {
  if (!quote || typeof quote !== 'object') return false;
  const quoteType = String(quote.quoteType || '').toUpperCase();
  if (quoteType !== 'ETF') return false;

  const symbol = String(quote.symbol || '').trim().toUpperCase();
  if (!symbol) return false;

  const name = String(quote.longname || quote.shortname || '').trim();
  return Boolean(name);
}

function detectProvider(quote) {
  const haystack = [quote.shortname, quote.longname, quote.symbol]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const [providerName, cfg] of Object.entries(PROVIDER_SEARCH)) {
    if (haystack.includes(cfg.key.toLowerCase())) {
      return providerName;
    }

    if (cfg.aliases.some(alias => haystack.includes(alias.toLowerCase()))) {
      return providerName;
    }
  }

  return null;
}

function normalizeQuoteToEtf(quote, providerName) {
  return {
    provider: providerName,
    ticker: String(quote.symbol || '').trim().toUpperCase(),
    name: String(quote.longname || quote.shortname || quote.symbol || '').trim(),
    isin: '',
    wkn: 'nicht verfügbar',
    source: 'Yahoo Finance Search Discovery',
  };
}

async function fetchSearchQuotes(seed) {
  const params = new URLSearchParams({
    q: seed,
    quotesCount: '100',
    newsCount: '0',
  });

  const url = `https://query1.finance.yahoo.com/v1/finance/search?${params}`;
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Yahoo discovery HTTP ${response.status} for query "${seed}"`);
  }

  const json = await response.json();
  return Array.isArray(json?.quotes) ? json.quotes : [];
}

async function discoverProviderEtfs(providerName) {
  const seeds = buildSeeds(providerName);
  const byTicker = new Map();

  for (const seed of seeds) {
    try {
      const quotes = await fetchSearchQuotes(seed);

      for (const quote of quotes) {
        if (!looksLikeEtfQuote(quote)) continue;

        const detectedProvider = detectProvider(quote);
        if (detectedProvider !== providerName) continue;

        const normalized = normalizeQuoteToEtf(quote, providerName);
        if (!normalized.ticker || !normalized.name) continue;

        if (!byTicker.has(normalized.ticker)) {
          byTicker.set(normalized.ticker, normalized);
        }
      }
    } catch (err) {
      // Soft-fail per search term to still harvest as many symbols as possible.
      console.warn(`[YahooDiscovery] ${err.message}`);
    }

    await wait(SEARCH_DELAY_MS);
  }

  return Array.from(byTicker.values());
}

function isCacheFresh(cache) {
  if (!cache?.updatedAt) return false;
  const updatedAt = new Date(cache.updatedAt).getTime();
  if (Number.isNaN(updatedAt)) return false;
  return Date.now() - updatedAt < DISCOVERY_TTL_MS;
}

async function buildAndPersistDiscoveryCache() {
  const [ishares, xtrackers] = await Promise.all([
    discoverProviderEtfs('iShares'),
    discoverProviderEtfs('Xtrackers'),
  ]);

  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: 'Yahoo Finance Search API',
    counts: {
      iShares: ishares.length,
      Xtrackers: xtrackers.length,
      total: ishares.length + xtrackers.length,
    },
    providers: {
      iShares: ishares,
      Xtrackers: xtrackers,
    },
  };

  await writeDiscoveryCache(payload);
  return payload;
}

async function getDiscoveredEtfs({ providerFilter = 'all', forceRefresh = false } = {}) {
  if (!discoveryLoadPromise) {
    discoveryLoadPromise = (async () => {
      const cache = await readDiscoveryCache();
      if (!forceRefresh && cache && isCacheFresh(cache)) {
        return cache;
      }

      return buildAndPersistDiscoveryCache();
    })().finally(() => {
      discoveryLoadPromise = null;
    });
  }

  const dataset = await discoveryLoadPromise;

  if (providerFilter === 'ishares') {
    return dataset.providers?.iShares || [];
  }

  if (providerFilter === 'xtrackers') {
    return dataset.providers?.Xtrackers || [];
  }

  return [
    ...(dataset.providers?.iShares || []),
    ...(dataset.providers?.Xtrackers || []),
  ];
}

module.exports = {
  getDiscoveredEtfs,
  _internal: {
    buildSeeds,
    looksLikeEtfQuote,
    detectProvider,
    normalizeQuoteToEtf,
    isCacheFresh,
    readDiscoveryCache,
    PROVIDER_SEARCH,
  },
};
