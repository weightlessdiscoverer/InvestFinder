/**
 * src/analysis.js
 * Core analysis module.
 */

'use strict';

const { fetchDailyCloses } = require('./dataService');
const {
  getEtfUniverse,
  normalizeAssetClass,
  normalizeProviderFilter,
} = require('./etfUniverseService');
const { detectBreakoutSignal } = require('./signals');
const { getTickerHistory, upsertTickerHistory } = require('./yahooHistoryStore');

const DEFAULT_SMA_PERIOD = 200;
const MIN_SMA_PERIOD = 2;
const MAX_SMA_PERIOD = 400;
const DEFAULT_FAST_SMA_PERIOD = 50;
const DEFAULT_SLOW_SMA_PERIOD = 200;
const DEFAULT_LOOKBACK_DAYS = 0; // 0 = nur Gestern vs. Heute
const MAX_LOOKBACK_DAYS = 365;

// ── In-memory cache ──────────────────────────────────────────────────────────
const priceCache = new Map();
const signalCache = new Map();

/** Cache TTL in milliseconds (6 hours). */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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

function normalizeOptionalSmaPeriod(periodInput, fieldLabel) {
  if (periodInput == null || periodInput === '') {
    return null;
  }

  try {
    return normalizeSmaPeriod(periodInput);
  } catch (err) {
    throw new Error(`${fieldLabel}: ${err.message}`);
  }
}

/**
 * Validiert die gewaehlte Signal-Konfiguration.
 *
 * Modi:
 * - price-breakout: Kurs durchbricht SMA(N)
 * - sma-crossover: SMA(fast) durchbricht SMA(slow) von unten
 */
function normalizeSignalConfig({ smaPeriodInput, fastSmaPeriodInput, slowSmaPeriodInput }) {
  const fastSmaPeriod = normalizeOptionalSmaPeriod(fastSmaPeriodInput, 'Fast-SMA');
  const slowSmaPeriod = normalizeOptionalSmaPeriod(slowSmaPeriodInput, 'Slow-SMA');

  const hasFast = fastSmaPeriod != null;
  const hasSlow = slowSmaPeriod != null;

  if (hasFast !== hasSlow) {
    throw new Error('Fuer SMA-Crossover muessen Fast-SMA und Slow-SMA gemeinsam gesetzt werden.');
  }

  if (hasFast && hasSlow) {
    if (fastSmaPeriod === slowSmaPeriod) {
      throw new Error('Fast-SMA und Slow-SMA muessen unterschiedlich sein.');
    }

    return {
      mode: 'sma-crossover',
      fastSmaPeriod,
      slowSmaPeriod,
      fastSmaLabel: `SMA${fastSmaPeriod}`,
      slowSmaLabel: `SMA${slowSmaPeriod}`,
    };
  }

  const smaPeriod = normalizeSmaPeriod(smaPeriodInput);
  return {
    mode: 'price-breakout',
    smaPeriod,
    smaLabel: `SMA${smaPeriod}`,
  };
}

function normalizeLookbackDays(lookbackDaysInput) {
  if (lookbackDaysInput == null || lookbackDaysInput === '') {
    return DEFAULT_LOOKBACK_DAYS;
  }

  const parsed = Number(lookbackDaysInput);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Ungueltige Lookback-Periode. Bitte eine ganze Zahl >= 0 angeben.');
  }

  if (parsed > MAX_LOOKBACK_DAYS) {
    throw new Error(
      `Lookback-Periode ${parsed} ist zu gross. Maximal erlaubt: ${MAX_LOOKBACK_DAYS} Tage.`
    );
  }

  return parsed;
}

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

async function scanETF(etf, { bypassCache, signalConfig, lookbackDays = DEFAULT_LOOKBACK_DAYS }) {
  const signalCacheSuffix = signalConfig.mode === 'sma-crossover'
    ? `fast:${signalConfig.fastSmaPeriod}|slow:${signalConfig.slowSmaPeriod}`
    : `sma:${signalConfig.smaPeriod}`;

  const cacheKey = `${etf.ticker}|${signalConfig.mode}|${signalCacheSuffix}|lookback:${lookbackDays}`;
  const now = Date.now();

  if (!bypassCache && signalCache.has(cacheKey)) {
    const cached = signalCache.get(cacheKey);
    if (now < cached.expiresAt) {
      return cached.data;
    }
  }

  try {
    const { dates, closes } = await getPriceHistory(etf, bypassCache);
    const signalResult = detectBreakoutSignal({
      dates,
      closes,
      lookbackDays,
      ...(signalConfig.mode === 'sma-crossover'
        ? {
            fastSmaPeriod: signalConfig.fastSmaPeriod,
            slowSmaPeriod: signalConfig.slowSmaPeriod,
          }
        : { smaPeriod: signalConfig.smaPeriod }),
    });

    const baseResult = {
      assetClass: etf.assetClass || 'etf',
      provider: etf.provider,
      ticker: etf.ticker,
      name: etf.name,
      isin: etf.isin || 'nicht verfügbar',
      wkn: etf.wkn || 'nicht verfügbar',
      identifierSource: `${etf.provider} statische Stammdatenquelle`,
      mode: signalConfig.mode,
      ...(signalConfig.mode === 'sma-crossover'
        ? {
            fastSmaPeriod: signalConfig.fastSmaPeriod,
            slowSmaPeriod: signalConfig.slowSmaPeriod,
            fastSmaLabel: signalConfig.fastSmaLabel,
            slowSmaLabel: signalConfig.slowSmaLabel,
            signalLabel: `${signalConfig.fastSmaLabel} ueber ${signalConfig.slowSmaLabel}`,
            smaLabel: `${signalConfig.fastSmaLabel}/${signalConfig.slowSmaLabel}`,
          }
        : {
            smaPeriod: signalConfig.smaPeriod,
            smaLabel: signalConfig.smaLabel,
            signalLabel: `Kurs ueber ${signalConfig.smaLabel}`,
          }),
      ...(lookbackDays > 0 && { lookbackDays }),
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
      name: etf.name,
      isin: etf.isin || 'nicht verfügbar',
      wkn: etf.wkn || 'nicht verfügbar',
      mode: signalConfig.mode,
      ...(signalConfig.mode === 'sma-crossover'
        ? {
            fastSmaPeriod: signalConfig.fastSmaPeriod,
            slowSmaPeriod: signalConfig.slowSmaPeriod,
            fastSmaLabel: signalConfig.fastSmaLabel,
            slowSmaLabel: signalConfig.slowSmaLabel,
            smaLabel: `${signalConfig.fastSmaLabel}/${signalConfig.slowSmaLabel}`,
          }
        : {
            smaPeriod: signalConfig.smaPeriod,
            smaLabel: signalConfig.smaLabel,
          }),
      ...(lookbackDays > 0 && { lookbackDays }),
      status: 'error',
      error: err.message,
      signal: false,
    };
    signalCache.set(cacheKey, { data: result, expiresAt: now + 5 * 60 * 1000 });
    return result;
  }
}

/**
 * @param {{
 *   bypassCache?: boolean,
 *   smaPeriod?: number|string,
 *   fastSmaPeriod?: number|string,
 *   slowSmaPeriod?: number|string,
 *   providerFilter?: string,
 *   assetClass?: string,
 *   lookbackDays?: number|string
 * }} options
 */
async function scanAllETFs({
  bypassCache = false,
  smaPeriod: smaPeriodInput,
  fastSmaPeriod: fastSmaPeriodInput,
  slowSmaPeriod: slowSmaPeriodInput,
  providerFilter = 'all',
  assetClass: assetClassInput = 'etf',
  lookbackDays: lookbackDaysInput,
} = {}) {
  const signalConfig = normalizeSignalConfig({
    smaPeriodInput,
    fastSmaPeriodInput,
    slowSmaPeriodInput,
  });
  const lookbackDays = normalizeLookbackDays(lookbackDaysInput);
  const normalizedAssetClass = normalizeAssetClass(assetClassInput);
  const normalizedProviderFilter = normalizeProviderFilter(providerFilter);

  const etfUniverse = await getEtfUniverse({
    providerFilter: normalizedProviderFilter,
    bypassCache,
    assetClass: normalizedAssetClass,
  });

  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 300;

  const allResults = [];

  for (let i = 0; i < etfUniverse.length; i += BATCH_SIZE) {
    const batch = etfUniverse.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(etf => scanETF(etf, { bypassCache, signalConfig, lookbackDays }))
    );
    allResults.push(...batchResults);

    if (i + BATCH_SIZE < etfUniverse.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const matches = allResults.filter(r => r.signal === true);
  const errors = allResults.filter(
    r => r.status === 'error' || r.status === 'insufficient-data'
  );

  return {
    assetClass: normalizedAssetClass,
    providerFilter: normalizedProviderFilter,
    mode: signalConfig.mode,
    ...(signalConfig.mode === 'sma-crossover'
      ? {
          fastSmaPeriod: signalConfig.fastSmaPeriod,
          slowSmaPeriod: signalConfig.slowSmaPeriod,
          fastSmaLabel: signalConfig.fastSmaLabel,
          slowSmaLabel: signalConfig.slowSmaLabel,
          smaLabel: `${signalConfig.fastSmaLabel}/${signalConfig.slowSmaLabel}`,
        }
      : {
          smaPeriod: signalConfig.smaPeriod,
          smaLabel: signalConfig.smaLabel,
        }),
    lookbackDays: lookbackDays > 0 ? lookbackDays : undefined,
    matches,
    errors,
    total: etfUniverse.length,
    scanned: allResults.length,
  };
}

module.exports = {
  scanAllETFs,
  normalizeAssetClass,
  normalizeProviderFilter,
  normalizeSmaPeriod,
  normalizeLookbackDays,
  normalizeSignalConfig,
  DEFAULT_SMA_PERIOD,
  MIN_SMA_PERIOD,
  MAX_SMA_PERIOD,
  DEFAULT_FAST_SMA_PERIOD,
  DEFAULT_SLOW_SMA_PERIOD,
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
};
