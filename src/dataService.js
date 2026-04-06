/**
 * src/dataService.js
 * Fetches historical OHLCV data for a given ticker from Yahoo Finance.
 *
 * Uses the public Yahoo Finance v8 chart API – no API key required.
 * Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{ticker}
 *
 * To compute a valid SMA200 we need at least 201 trading days of history.
 * We request 1 year + a buffer (420 calendar days ≈ ~300 trading days).
 */

'use strict';

const fetch = require('node-fetch');

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// How many calendar days of history to request (covers ~300 trading days)
const HISTORY_DAYS = 420;

/**
 * Build the Yahoo Finance chart URL for a given ticker.
 * @param {string} ticker  e.g. "IWDA.AS"
 * @returns {string} URL
 */
function buildUrl(ticker) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - HISTORY_DAYS * 24 * 60 * 60;
  const params = new URLSearchParams({
    period1: from,
    period2: now,
    interval: '1d',
    events: 'history',
    includeAdjustedClose: 'true',
  });
  return `${YAHOO_BASE}/${encodeURIComponent(ticker)}?${params}`;
}

/**
 * Fetch daily closing prices for a ticker.
 *
 * @param {string} ticker  Yahoo Finance ticker symbol
 * @returns {Promise<{ dates: string[], closes: number[] }>}
 *   Sorted ascending by date. Only valid (non-null) data points are included.
 * @throws {Error} when the ticker is not found or the API returns an error
 */
async function fetchDailyCloses(ticker) {
  const url = buildUrl(ticker);

  const response = await fetch(url, {
    headers: {
      // Mimic a browser request to reduce 429/403 responses
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
    timeout: 15000,
  });

  if (response.status === 429) {
    throw new Error(`Rate-limited by Yahoo Finance for ticker ${ticker}`);
  }
  if (!response.ok) {
    throw new Error(
      `Yahoo Finance returned HTTP ${response.status} for ticker ${ticker}`
    );
  }

  const json = await response.json();

  // Validate response structure
  const result = json?.chart?.result?.[0];
  if (!result) {
    const errorMsg = json?.chart?.error?.description || 'Unknown error';
    throw new Error(`No data for ticker ${ticker}: ${errorMsg}`);
  }

  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;

  if (!timestamps || !closes || timestamps.length === 0) {
    throw new Error(`Empty price data for ticker ${ticker}`);
  }

  // Zip timestamps and closes, filter out null/NaN, sort ascending
  const pairs = timestamps
    .map((ts, i) => ({ date: new Date(ts * 1000), close: closes[i] }))
    .filter(p => p.close != null && !isNaN(p.close))
    .sort((a, b) => a.date - b.date);

  return {
    dates: pairs.map(p => p.date.toISOString().slice(0, 10)),
    closes: pairs.map(p => p.close),
  };
}

module.exports = { fetchDailyCloses };
