/**
 * src/analysis.js
 * Core analysis module.
 *
 * For each ETF in the universe:
 *   1. Fetch historical daily closes
 *   2. Compute a selectable Simple Moving Average (SMA N)
 *   3. Check breakout signal:
 *        yesterday.close < yesterday.SMA(N)  AND
 *        today.close    >    today.SMA(N)
 *
 * Results are cached in-memory for one trading day to avoid hammering Yahoo.
 */

'use strict';

const { fetchDailyCloses } = require('./dataService');
const { getEtfUniverse, normalizeProviderFilter } = require('./etfUniverseService');
const { detectBreakoutSignal } = require('./signals');
const { getTickerHistory, upsertTickerHistory } = require('./yahooHistoryStore');

const DEFAULT_SMA_PERIOD = 200;
const MIN_SMA_PERIOD = 2;
const MAX_SMA_PERIOD = 400;

// ── In-memory cache ──────────────────────────────────────────────────────────
// Caches raw price history, independent of the selected SMA period.
// Maps ticker -> { dates, closes, expiresAt }
const priceCache = new Map();

// Optional cache for computed scan results per ticker and SMA period.
// Maps `${ticker}|${smaPeriod}` -> { data, expiresAt }
const signalCache = new Map();

/** Cache TTL in milliseconds (6 hours). */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Validiert und normalisiert die gewuenschte SMA-Periode.
 * @param {number|string|undefined|null} smaPeriodInput
 * @returns {number}
 * @throws {Error} bei ungueltiger Eingabe
 */
function normalizeSmaPeriod(smaPeriodInput) {
  if (smaPeriodInput == null || smaPeriodInput === '') {
    return DEFAULT_SMA_PERIOD;
  }

  const parsed = Number(smaPeriodInput);
  if (!Number.isInteger(parsed) || parsed < MIN_SMA_PERIOD) {
    throw new Error(`Ungueltige SMA-Periode. Bitte eine ganze Zahl >= ${MIN_SMA_PERIOD} angeben.`);
  }

  if (parsed > MAX_SMA_PERIOD) {
    throw new Error(
      `SMA-Periode ${parsed} ist zu gross. Maximal erlaubt: ${MAX_SMA_PERIOD}.`
    );
  }

  return parsed;
}

/**
 * Liefert Kursdaten fuer einen ETF und cached sie SMA-unabhaengig.
 * @param {{ ticker: string }} etf
 * @param {boolean} bypassCache
 * @returns {Promise<{ dates: string[], closes: number[] }>}
 */
async function getPriceHistory(etf, bypassCache) {
  const now = Date.now();
  const key = etf.ticker;

  if (!bypassCache && priceCache.has(key)) {
    const cached = priceCache.get(key);
    if (now < cached.expiresAt) {
      return { dates: cached.dates, closes: cached.closes };
    }
  }

  if (!bypassCache) {
    const stored = await getTickerHistory(etf.ticker);
    if (stored && Array.isArray(stored.dates) && Array.isArray(stored.closes) && stored.dates.length > 0) {
      const snapshot = { dates: stored.dates, closes: stored.closes };
      priceCache.set(key, {
        dates: snapshot.dates,
        closes: snapshot.closes,
        expiresAt: now + CACHE_TTL_MS,
      });
      return snapshot;
    }
  }

  const history = await fetchDailyCloses(etf.ticker);
  await upsertTickerHistory(etf.ticker, history);

  priceCache.set(key, {
    dates: history.dates,
    closes: history.closes,
    expiresAt: now + CACHE_TTL_MS,
  });

  return history;
}

/**
 * Scan a single ETF for a breakout signal.
 *
 * @param {{ ticker: string, name: string }} etf
 * @param {{ bypassCache: boolean, smaPeriod: number }} options
 * @returns {Promise<object>} result object
 */
async function scanETF(etf, { bypassCache, smaPeriod }) {
  const cacheKey = `${etf.ticker}|${smaPeriod}`;
  const now = Date.now();

  if (!bypassCache && signalCache.has(cacheKey)) {
    const cached = signalCache.get(cacheKey);
    if (now < cached.expiresAt) {
      return cached.data;
    }
  }

  try {
    const { dates, closes } = await getPriceHistory(etf, bypassCache);
    const signalResult = detectBreakoutSignal({ dates, closes, smaPeriod });

    const baseResult = {
      provider: etf.provider,
      ticker:  etf.ticker,
      name:    etf.name,
      isin: etf.isin || 'nicht verfügbar',
      wkn: etf.wkn || 'nicht verfügbar',
      identifierSource: `${etf.provider} statische Stammdatenquelle`,
      smaPeriod,
      smaLabel: `SMA${smaPeriod}`,
    };

    const result = signalResult.insufficientData
      ? {
          ...baseResult,
          status: 'insufficient-data',
          signal: false,
          error: signalResult.error,
          ...signalResult,
        }
      : {
          ...baseResult,
          status: 'ok',
          ...signalResult,
        };

    signalCache.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });
    return result;
  } catch (err) {
    const result = {
      provider: etf.provider,
      ticker: etf.ticker,
      name:   etf.name,
      isin: etf.isin || 'nicht verfügbar',
      wkn: etf.wkn || 'nicht verfügbar',
      smaPeriod,
      smaLabel: `SMA${smaPeriod}`,
      status: 'error',
      error:  err.message,
      signal: false,
    };
    signalCache.set(cacheKey, { data: result, expiresAt: now + 5 * 60 * 1000 });
    return result;
  }
}

/**
 * Scan all iShares ETFs concurrently (with a concurrency limit to respect
 * Yahoo Finance rate limits) and return only those with a breakout signal.
 *
 * @param {{ bypassCache?: boolean, smaPeriod?: number|string, providerFilter?: string }} options
 * @returns {Promise<{ matches: object[], errors: object[], total: number }>}
 */
async function scanAllETFs({
  bypassCache = false,
  smaPeriod: smaPeriodInput,
  providerFilter = 'all',
} = {}) {
  const smaPeriod = normalizeSmaPeriod(smaPeriodInput);
  const normalizedProviderFilter = normalizeProviderFilter(providerFilter);

  const etfUniverse = await getEtfUniverse({
    providerFilter: normalizedProviderFilter,
    bypassCache,
  });

  // Process ETFs in batches to avoid triggering rate limits
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 300; // ms between batches

  const allResults = [];

  for (let i = 0; i < etfUniverse.length; i += BATCH_SIZE) {
    const batch = etfUniverse.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(etf => scanETF(etf, { bypassCache, smaPeriod }))
    );
    allResults.push(...batchResults);

    // Polite delay between batches (skip after last batch)
    if (i + BATCH_SIZE < etfUniverse.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const matches = allResults.filter(r => r.signal === true);
  const errors = allResults.filter(
    r => r.status === 'error' || r.status === 'insufficient-data'
  );

  return {
    providerFilter: normalizedProviderFilter,
    smaPeriod,
    smaLabel: `SMA${smaPeriod}`,
    matches,
    errors,
    total: etfUniverse.length,
    scanned: allResults.length,
  };
}

module.exports = {
  scanAllETFs,
  normalizeProviderFilter,
  normalizeSmaPeriod,
  DEFAULT_SMA_PERIOD,
  MIN_SMA_PERIOD,
  MAX_SMA_PERIOD,
};
