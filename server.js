/**
 * server.js
 * Express backend for the InvestFinder ETF Golden Cross scanner.
 * Provides a REST API that the frontend calls to trigger a scan.
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { scanAllETFs } = require('./src/analysis');

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
 * Scans all iShares ETFs for a SMA200 golden-cross signal on the current day.
 * Returns JSON array of matching ETFs.
 *
 * Query params:
 *   - cache=false  – bypass in-memory cache (default: use cache)
 */
app.get('/api/scan', scanLimiter, async (req, res) => {
  const bypassCache = req.query.cache === 'false';
  try {
    const results = await scanAllETFs({ bypassCache });
    res.json({ ok: true, results, scannedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[/api/scan] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Catch-all: serve index.html for any unknown path (SPA fallback)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`InvestFinder server running → http://localhost:${PORT}`);
});
