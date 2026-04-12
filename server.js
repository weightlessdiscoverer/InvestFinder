/**
 * server.js
 * Express backend for the InvestFinder ETF SMA breakout scanner.
 * Provides a REST API that the frontend calls to trigger a scan.
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const {
  scanAllETFs,
  normalizeAssetClass,
  normalizeSmaPeriod,
  normalizeLookbackDays,
  normalizeProviderFilter,
  DEFAULT_SMA_PERIOD,
} = require('./src/analysis');
const {
  DEFAULT_INVESTMENT_DURATION_MONTHS,
  getTopRecommendations,
  normalizeInvestmentDurationMonths,
  normalizeRecommendationLimit,
} = require('./src/recommendationEngine');
const {
  startYahooHistoryUpdater,
  getYahooHistoryUpdaterInfo,
} = require('./src/yahooHistoryUpdater');
const {
  classifyFreshness,
  getStoreSummary,
  listAvailableTickerRecords,
} = require('./src/yahooHistoryStore');
const {
  startDax40FreshnessChecker,
  getDax40FreshnessStatus,
} = require('./src/dax40FreshnessService');
const { getEtfUniverse } = require('./src/etfUniverseService');
const { createAvailableInstrumentsHandler } = require('./src/availableInstrumentsService');
const { runFullBacktest } = require('./src/backtest');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());

// Rate-limit the scan endpoint: max 10 requests per 5 minutes per IP
const scanLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many scan requests. Please wait a few minutes and try again.' },
});

/**
 * GET /api/scan
 * Scans all ETFs for a breakout signal over a selectable SMA(N).
 * Returns JSON array of matching ETFs.
 *
 * Query params:
 *   - cache=false            – bypass in-memory cache (default: use cache)
 *   - sma=200                – SMA period fuer Kurs-vs-SMA (integer > 1, default: 200)
 *   - fastSma=50             – schnelle SMA-Linie fuer SMA-Crossover (optional)
 *   - slowSma=200            – langsame SMA-Linie fuer SMA-Crossover (optional)
 *   - lookbackDays=21        – lookback period in days (0 = only yesterday vs today)
 *   - lookbackWeeks=3        – Alternative zu lookbackDays; wird intern *7 gerechnet
 *   - provider=all|ishares|xtrackers
 */
app.get('/api/scan', scanLimiter, async (req, res) => {
  const bypassCache = req.query.cache === 'false';

  let smaPeriod;
  let fastSmaPeriod;
  let slowSmaPeriod;
  let providerFilter;
  let assetClass;
  let lookbackDays;
  try {
    smaPeriod = normalizeSmaPeriod(req.query.sma ?? DEFAULT_SMA_PERIOD);

    if (req.query.fastSma != null && req.query.fastSma !== '') {
      fastSmaPeriod = normalizeSmaPeriod(req.query.fastSma);
    }

    if (req.query.slowSma != null && req.query.slowSma !== '') {
      slowSmaPeriod = normalizeSmaPeriod(req.query.slowSma);
    }

    let lookbackInput = req.query.lookbackDays;
    if ((lookbackInput == null || lookbackInput === '') && req.query.lookbackWeeks != null && req.query.lookbackWeeks !== '') {
      const weeks = Number(req.query.lookbackWeeks);
      if (!Number.isInteger(weeks) || weeks < 0 || weeks > 52) {
        throw new Error('Ungueltige Lookback-Wochen. Bitte eine ganze Zahl zwischen 0 und 52 angeben.');
      }
      lookbackInput = String(weeks * 7);
    }

    providerFilter = normalizeProviderFilter(req.query.provider ?? 'all');
    assetClass = normalizeAssetClass(req.query.assetClass ?? 'etf');
    lookbackDays = normalizeLookbackDays(lookbackInput);
  } catch (validationErr) {
    return res.status(400).json({ ok: false, error: validationErr.message });
  }

  try {
    const results = await scanAllETFs({
      bypassCache,
      smaPeriod,
      fastSmaPeriod,
      slowSmaPeriod,
      providerFilter,
      assetClass,
      lookbackDays,
    });
    res.json({ ok: true, results, scannedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[/api/scan] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/recommendations', scanLimiter, async (req, res) => {
  const bypassCache = req.query.cache === 'false';

  let assetClass;
  let providerFilter;
  let investmentDurationMonths;
  let limit;

  try {
    assetClass = normalizeAssetClass(req.query.assetClass ?? 'etf');
    providerFilter = normalizeProviderFilter(req.query.provider ?? 'all');
    investmentDurationMonths = normalizeInvestmentDurationMonths(
      req.query.investmentDurationMonths ?? DEFAULT_INVESTMENT_DURATION_MONTHS
    );
    limit = normalizeRecommendationLimit(req.query.limit ?? 3);
  } catch (validationErr) {
    return res.status(400).json({ ok: false, error: validationErr.message });
  }

  try {
    const results = await getTopRecommendations({
      bypassCache,
      assetClass,
      providerFilter,
      investmentDurationMonths,
      limit,
    });
    res.json({ ok: true, results, scannedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[/api/recommendations] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/yahoo-sync-status
 * Returns status of the background Yahoo history updater.
 */
app.get('/api/yahoo-sync-status', async (_req, res) => {
  try {
    const info = await getYahooHistoryUpdaterInfo();
    res.json({ ok: true, ...info, checkedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/dax40-freshness-status
 * Returns status of the background DAX40 freshness checker.
 */
app.get('/api/dax40-freshness-status', (_req, res) => {
  try {
    const info = getDax40FreshnessStatus();
    res.json({ ok: true, status: info, checkedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const handleAvailableInstruments = createAvailableInstrumentsHandler({
  normalizeAssetClass,
  normalizeProviderFilter,
  listAvailableTickerRecords,
  getEtfUniverse,
  getStoreSummary,
  classifyFreshness,
});

/**
 * GET /api/available-instruments
 * Returns persisted Yahoo history entries for selected asset class.
 * Optional query: provider=all|ishares|xtrackers and assetClass=etf|dax40
 */
app.get('/api/available-instruments', handleAvailableInstruments);

/**
 * Backward-compatible alias for legacy clients.
 */
app.get('/api/available-etfs', handleAvailableInstruments);

/**
 * GET /api/backtest
 * Runs an out-of-sample backtest for the current instrument universe.
 * Tests whether Buy/Hold/Sell signals produced higher forward returns historically.
 *
 * Query params:
 *   - assetClass=etf|dax40
 *   - provider=all|ishares|xtrackers
 */
app.get('/api/backtest', scanLimiter, async (req, res) => {
  let assetClass;
  let providerFilter;
  try {
    assetClass = normalizeAssetClass(req.query.assetClass ?? 'etf');
    providerFilter = normalizeProviderFilter(req.query.provider ?? 'all');
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  try {
    const results = await runFullBacktest({ assetClass, providerFilter });
    return res.json({ ok: true, results, runAt: new Date().toISOString() });
  } catch (err) {
    console.error('Backtest error:', err);
    return res.status(500).json({ ok: false, error: 'Backtest fehlgeschlagen: ' + err.message });
  }
});

// Catch-all: serve index.html for any unknown path (SPA fallback)
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`InvestFinder server running -> http://localhost:${port}`);

    startYahooHistoryUpdater({
      cooldownMs: Number(process.env.YAHOO_COOLDOWN_MS || 60_000),
    });
    console.log('Yahoo history updater started in background.');

    startDax40FreshnessChecker({
      intervalMs: Number(process.env.DAX40_CHECK_INTERVAL_MS || 24 * 60 * 60 * 1000),
      fetchTimeoutMs: Number(process.env.DAX40_CHECK_TIMEOUT_MS || 15_000),
      autoUpdateEnabled: String(process.env.DAX40_AUTO_UPDATE ?? 'true').toLowerCase() !== 'false',
      pruneHistoryEnabled: String(process.env.DAX40_PRUNE_HISTORY ?? 'true').toLowerCase() !== 'false',
    });
    console.log('DAX40 freshness checker started in background.');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
