'use strict';

const { fetchDailyCloses } = require('./dataService');
const { getEtfUniverse } = require('./etfUniverseService');
const {
  readStore,
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
  const universe = await getEtfUniverse({
    providerFilter: 'all',
    bypassCache: false,
    assetClass: 'all',
  });

  // Read the history store once to avoid N full-file reads/parses during startup.
  const store = await readStore();
  const rows = universe.map(etf => ({
    etf,
    updatedAt: store.tickers?.[String(etf.ticker || '').trim().toUpperCase()]?.updatedAt || null,
  }));

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

function isCoolingDown() {
  return Boolean(state.pausedUntil && Date.now() < state.pausedUntil);
}

function clearCooldownIfElapsed() {
  if (state.pausedUntil && Date.now() >= state.pausedUntil) {
    state.pausedUntil = null;
  }
}

async function waitForCooldownIfNeeded() {
  if (!isCoolingDown()) {
    return false;
  }

  await wait(1000);
  return true;
}

async function getQueueOrWait() {
  const queue = await buildQueue();
  if (queue.length === 0) {
    await wait(5000);
  }
  return queue;
}

async function processQueue(queue, cooldownMs) {
  for (const etf of queue) {
    if (!state.running) {
      return;
    }

    if (isCoolingDown()) {
      return;
    }

    await processTicker(etf, cooldownMs);
  }
}

async function runLoop(cooldownMs) {
  while (state.running) {
    clearCooldownIfElapsed();

    if (await waitForCooldownIfNeeded()) {
      continue;
    }

    const queue = await getQueueOrWait();
    if (queue.length === 0) {
      continue;
    }

    await processQueue(queue, cooldownMs);
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
