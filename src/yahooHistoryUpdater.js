'use strict';

const { fetchDailyCloses } = require('./dataService');
const { getEtfUniverse } = require('./etfUniverseService');
const {
  getTickerUpdatedAt,
  upsertTickerHistory,
  getStoreSummary,
} = require('./yahooHistoryStore');

const DEFAULT_COOLDOWN_MS = 60 * 1000;
const LOOP_DELAY_MS = 200;

const state = {
  running: false,
  pausedUntil: null,
  processedTickers: 0,
  rateLimitHits: 0,
  lastError: null,
  lastTicker: null,
  startedAt: null,
};

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const message = String(err?.message || '').toLowerCase();
  return message.includes('rate-limited') || message.includes('http 429');
}

async function buildQueue() {
  const universe = await getEtfUniverse({ providerFilter: 'all', bypassCache: false });

  const rows = await Promise.all(
    universe.map(async etf => ({
      etf,
      updatedAt: await getTickerUpdatedAt(etf.ticker),
    }))
  );

  rows.sort((a, b) => {
    if (!a.updatedAt && !b.updatedAt) return 0;
    if (!a.updatedAt) return -1;
    if (!b.updatedAt) return 1;
    return a.updatedAt.localeCompare(b.updatedAt);
  });

  return rows.map(row => row.etf);
}

function getStatus() {
  return {
    ...state,
    isCoolingDown: Boolean(state.pausedUntil && Date.now() < state.pausedUntil),
    cooldownRemainingMs: state.pausedUntil ? Math.max(0, state.pausedUntil - Date.now()) : 0,
  };
}

async function processTicker(etf, cooldownMs) {
  state.lastTicker = etf.ticker;

  try {
    const history = await fetchDailyCloses(etf.ticker);
    await upsertTickerHistory(etf.ticker, history);
    state.processedTickers += 1;
    state.lastError = null;
  } catch (err) {
    if (isRateLimitError(err)) {
      state.rateLimitHits += 1;
      state.pausedUntil = Date.now() + cooldownMs;
      state.lastError = `Rate limit reached while updating ${etf.ticker}`;
      console.warn(`[YahooUpdater] ${state.lastError}. Cooldown for ${cooldownMs} ms.`);
      return;
    }

    state.lastError = err.message;
    console.warn(`[YahooUpdater] Skip ${etf.ticker}: ${err.message}`);
  }

  await wait(LOOP_DELAY_MS);
}

async function runLoop(cooldownMs) {
  while (state.running) {
    if (state.pausedUntil && Date.now() < state.pausedUntil) {
      await wait(1000);
      continue;
    }

    if (state.pausedUntil && Date.now() >= state.pausedUntil) {
      state.pausedUntil = null;
    }

    const queue = await buildQueue();
    if (queue.length === 0) {
      await wait(5000);
      continue;
    }

    for (const etf of queue) {
      if (!state.running) {
        return;
      }

      if (state.pausedUntil && Date.now() < state.pausedUntil) {
        break;
      }

      await processTicker(etf, cooldownMs);
    }
  }
}

function startYahooHistoryUpdater({ cooldownMs = DEFAULT_COOLDOWN_MS } = {}) {
  if (state.running) {
    return;
  }

  state.running = true;
  state.startedAt = new Date().toISOString();

  runLoop(cooldownMs).catch(err => {
    state.lastError = err.message;
    state.running = false;
    console.error('[YahooUpdater] Fatal error:', err);
  });
}

function stopYahooHistoryUpdater() {
  state.running = false;
}

async function getYahooHistoryUpdaterInfo() {
  const summary = await getStoreSummary();
  return {
    status: getStatus(),
    summary,
  };
}

module.exports = {
  startYahooHistoryUpdater,
  stopYahooHistoryUpdater,
  getYahooHistoryUpdaterInfo,
};
