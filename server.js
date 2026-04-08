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
  startYahooHistoryUpdater,
  getYahooHistoryUpdaterInfo,
} = require('./src/yahooHistoryUpdater');
const {
  classifyFreshness,
  getStoreSummary,
  listAvailableTickerRecords,
} = require('./src/yahooHistoryStore');
const { getEtfUniverse } = require('./src/etfUniverseService');

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
 *   - cache=false  – bypass in-memory cache (default: use cache)
 *   - sma=200      – SMA period (integer > 1, default: 200)
 *   - lookbackDays – lookback period in days (0 = only yesterday vs today)
 *   - provider=all | ishares | xtrackers
 */
app.get('/api/scan', scanLimiter, async (req, res) => {
  const bypassCache = req.query.cache === 'false';

  let smaPeriod;
  let providerFilter;
  let assetClass;
  let lookbackDays;
  try {
    smaPeriod = normalizeSmaPeriod(req.query.sma ?? DEFAULT_SMA_PERIOD);
    providerFilter = normalizeProviderFilter(req.query.provider ?? 'all');
    assetClass = normalizeAssetClass(req.query.assetClass ?? 'etf');
    lookbackDays = normalizeLookbackDays(req.query.lookbackDays);
  } catch (validationErr) {
    return res.status(400).json({ ok: false, error: validationErr.message });
  }

  try {
    const results = await scanAllETFs({
      bypassCache,
      smaPeriod,
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

async function handleAvailableInstruments(req, res) {
  try {
    const assetClass = normalizeAssetClass(req.query.assetClass ?? 'etf');
    const providerFilter = normalizeProviderFilter(req.query.provider ?? 'all');
    const [records, universe, summary] = await Promise.all([
      listAvailableTickerRecords(),
      getEtfUniverse({ providerFilter, bypassCache: false, assetClass }),
      getStoreSummary(),
    ]);

    const byTicker = new Map(
      universe.map(etf => [String(etf.ticker || '').toUpperCase(), etf])
    );

    const items = records
      .map(record => {
        const etf = byTicker.get(record.ticker);
        if (!etf) return null;

        return {
          assetClass: etf.assetClass || assetClass,
          provider: etf.provider,
          ticker: etf.ticker,
          name: etf.name,
          isin: etf.isin || 'nicht verfügbar',
          wkn: etf.wkn || 'nicht verfügbar',
          points: record.points,
          firstDate: record.firstDate,
          lastDate: record.lastDate,
          updatedAt: record.updatedAt,
          freshness: record.freshness,
          dataSource: 'Yahoo Finance',
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.provider !== b.provider) {
          return a.provider.localeCompare(b.provider);
        }
        return a.ticker.localeCompare(b.ticker);
      });

    const oldestItemUpdate = items
      .map(item => item.updatedAt)
      .filter(Boolean)
      .sort()[0] || null;

    const effectiveFreshness = items.length > 0
      ? classifyFreshness(oldestItemUpdate)
      : summary.freshness;

    res.json({
      ok: true,
      assetClass,
      providerFilter,
      count: items.length,
      freshness: effectiveFreshness,
      items,
      listedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}

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

// Catch-all: serve index.html for any unknown path (SPA fallback)
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`InvestFinder server running → http://localhost:${PORT}`);

  startYahooHistoryUpdater({
    cooldownMs: Number(process.env.YAHOO_COOLDOWN_MS || 60_000),
  });
  console.log('Yahoo history updater started in background.');
});
