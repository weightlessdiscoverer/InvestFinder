/**
 * src/analysis.js
 * Core analysis module.
 *
 * For each ETF in the universe:
 *   1. Fetch historical daily closes
 *   2. Compute the 200-day Simple Moving Average (SMA200) for each day
 *   3. Check for a Golden Cross signal:
 *        yesterday.close < yesterday.SMA200  AND
 *        today.close    >    today.SMA200
 *
 * Results are cached in-memory for one trading day to avoid hammering Yahoo.
 */

'use strict';

const { fetchDailyCloses } = require('./dataService');
const ISHARES_ETFS = require('./etfList');
const {
  warmMasterDataCache,
  getIdentifiersByTicker,
} = require('./masterDataService');

// ── SMA period ────────────────────────────────────────────────────────────────
const SMA_PERIOD = 200;

// ── In-memory cache ──────────────────────────────────────────────────────────
// Maps cache-key → { data, expiresAt }
const cache = new Map();

/** Cache TTL in milliseconds (6 hours). */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Compute Simple Moving Average for an array of numbers.
 * Returns an array of the same length; elements before index (period - 1) are null.
 *
 * @param {number[]} values
 * @param {number}   period
 * @returns {(number|null)[]}
 */
function computeSMA(values, period) {
  const sma = new Array(values.length).fill(null);
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      sma[i] = sum / period;
    }
  }
  return sma;
}

/**
 * Detect a Golden Cross on the last two complete trading days.
 *
 * @param {string[]} dates   Sorted ascending (YYYY-MM-DD)
 * @param {number[]} closes  Corresponding closing prices
 * @returns {{ signal: boolean, todayDate: string|null, yesterdayDate: string|null,
 *             todayClose: number|null, todaysSMA: number|null,
 *             yesterdayClose: number|null, yesterdaysSMA: number|null }}
 */
function detectGoldenCross(dates, closes) {
  const sma = computeSMA(closes, SMA_PERIOD);
  const n = closes.length;

  // We need at least SMA_PERIOD + 1 data points for two valid SMA values
  if (n < SMA_PERIOD + 1) {
    return { signal: false };
  }

  const todayIdx     = n - 1;
  const yesterdayIdx = n - 2;

  const todayClose     = closes[todayIdx];
  const yesterdayClose = closes[yesterdayIdx];
  const todaySMA       = sma[todayIdx];
  const yesterdaySMA   = sma[yesterdayIdx];

  // Both SMA values must be valid
  if (todaySMA === null || yesterdaySMA === null) {
    return { signal: false };
  }

  const signal =
    yesterdayClose < yesterdaySMA &&
    todayClose     > todaySMA;

  return {
    signal,
    todayDate:      dates[todayIdx],
    yesterdayDate:  dates[yesterdayIdx],
    todayClose:     +todayClose.toFixed(4),
    todaySMA:       +todaySMA.toFixed(4),
    yesterdayClose: +yesterdayClose.toFixed(4),
    yesterdaySMA:   +yesterdaySMA.toFixed(4),
  };
}

/**
 * Scan a single ETF for a Golden Cross signal.
 *
 * @param {{ ticker: string, name: string }} etf
 * @param {boolean} bypassCache
 * @returns {Promise<object>} result object
 */
async function scanETF(etf, bypassCache) {
  const cacheKey = etf.ticker;
  const now = Date.now();

  // Return cached result if still fresh
  if (!bypassCache && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (now < cached.expiresAt) {
      return cached.data;
    }
  }

  try {
    const { dates, closes } = await fetchDailyCloses(etf.ticker);
    const crossResult = detectGoldenCross(dates, closes);
    const identifiers = await getIdentifiersByTicker(etf.ticker);

    const result = {
      ticker:  etf.ticker,
      name:    etf.name,
      isin: identifiers.isin,
      wkn: identifiers.wkn,
      identifierSource: identifiers.source,
      status:  'ok',
      ...crossResult,
    };

    // Cache the result
    cache.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });
    return result;
  } catch (err) {
    const result = {
      ticker: etf.ticker,
      name:   etf.name,
      status: 'error',
      error:  err.message,
      signal: false,
    };
    // Cache errors briefly (5 min) to avoid hammering on repeated failures
    cache.set(cacheKey, { data: result, expiresAt: now + 5 * 60 * 1000 });
    return result;
  }
}

/**
 * Scan all iShares ETFs concurrently (with a concurrency limit to respect
 * Yahoo Finance rate limits) and return only those with a Golden Cross signal.
 *
 * @param {{ bypassCache?: boolean }} options
 * @returns {Promise<{ matches: object[], errors: object[], total: number }>}
 */
async function scanAllETFs({ bypassCache = false } = {}) {
  // Load and cache static identifier master data once per scan run.
  await warmMasterDataCache({ bypassCache });

  // Process ETFs in batches to avoid triggering rate limits
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 300; // ms between batches

  const allResults = [];

  for (let i = 0; i < ISHARES_ETFS.length; i += BATCH_SIZE) {
    const batch = ISHARES_ETFS.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(etf => scanETF(etf, bypassCache))
    );
    allResults.push(...batchResults);

    // Polite delay between batches (skip after last batch)
    if (i + BATCH_SIZE < ISHARES_ETFS.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const matches = allResults.filter(r => r.signal === true);
  const errors  = allResults.filter(r => r.status === 'error');

  return {
    matches,
    errors,
    total: ISHARES_ETFS.length,
    scanned: allResults.length,
  };
}

module.exports = { scanAllETFs, computeSMA, detectGoldenCross };
