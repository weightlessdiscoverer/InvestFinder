/**
 * src/dataService.js
 * Fetches historical OHLCV data for a given ticker from Yahoo Finance.
 *
 * Uses the public Yahoo Finance v8 chart API – no API key required.
 * Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{ticker}
 *
 * To compute larger SMAs reliably we need enough trading history.
 * We request 1 year + a buffer (420 calendar days ≈ ~300 trading days).
 */

'use strict';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// How many calendar days of history to request (covers ~300 trading days)
const HISTORY_DAYS = 420;

const REQUEST_HEADERS = {
  // Mimic a browser request to reduce 429/403 responses
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

function createHttpErrorMessage(status, ticker) {
  if (status === 429) {
    return `Rate-limited by Yahoo Finance for ticker ${ticker}`;
  }
  return `Yahoo Finance returned HTTP ${status} for ticker ${ticker}`;
}

function assertResponseOk(response, ticker) {
  if (response.ok) {
    return;
  }
  throw new Error(createHttpErrorMessage(response.status, ticker));
}

function getChartResult(json, ticker) {
  const result = json?.chart?.result?.[0];
  if (result) {
    return result;
  }

  const errorMsg = json?.chart?.error?.description || 'Unknown error';
  throw new Error(`No data for ticker ${ticker}: ${errorMsg}`);
}

function getSeriesFromResult(result) {
  return {
    timestamps: result.timestamp,
    closes: result.indicators?.quote?.[0]?.close,
  };
}

function assertSeriesNotEmpty(timestamps, closes, ticker) {
  if (!timestamps || !closes || timestamps.length === 0) {
    throw new Error(`Empty price data for ticker ${ticker}`);
  }
}

function extractRawChartData(json, ticker) {
  const result = getChartResult(json, ticker);
  const { timestamps, closes } = getSeriesFromResult(result);
  assertSeriesNotEmpty(timestamps, closes, ticker);

  return { timestamps, closes };
}

function normalizePriceSeries(timestamps, closes) {
  const pairs = timestamps
    .map((ts, i) => ({ date: new Date(ts * 1000), close: closes[i] }))
    .filter(p => p.close != null && !isNaN(p.close))
    .sort((a, b) => a.date - b.date);

  return {
    dates: pairs.map(p => p.date.toISOString().slice(0, 10)),
    closes: pairs.map(p => p.close),
  };
}

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
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  assertResponseOk(response, ticker);

  const json = await response.json();
  const { timestamps, closes } = extractRawChartData(json, ticker);
  return normalizePriceSeries(timestamps, closes);
}

module.exports = { fetchDailyCloses };
