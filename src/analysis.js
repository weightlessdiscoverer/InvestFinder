/**
 * src/analysis.js
 * Core analysis module.
 */

'use strict';

const {
  getEtfUniverse,
  normalizeAssetClass,
  normalizeProviderFilter,
} = require('./etfUniverseService');
const {
  DEFAULT_SMA_PERIOD,
  MIN_SMA_PERIOD,
  MAX_SMA_PERIOD,
  DEFAULT_FAST_SMA_PERIOD,
  DEFAULT_SLOW_SMA_PERIOD,
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
  normalizeSmaPeriod,
  normalizeSignalConfig,
  normalizeLookbackDays,
} = require('./analysisConfig');
const { detectBreakoutSignal } = require('./signals');
const { getPriceHistory } = require('./priceHistoryService');

// ── In-memory cache ──────────────────────────────────────────────────────────
const signalCache = new Map();

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
      assetClass: etf.assetClass || 'stock',
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
  assetClass: assetClassInput = 'all',
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
