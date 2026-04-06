'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const CACHE_DIR = path.join(__dirname, 'data', 'provider-cache');
const STORE_PATH = path.join(CACHE_DIR, 'yahoo-history-db.json');

const EMPTY_STORE = {
  version: 1,
  tickers: {},
  meta: {
    createdAt: null,
    updatedAt: null,
  },
};

let writeQueue = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function withMeta(store) {
  const nowIso = new Date().toISOString();
  if (!store.meta) {
    store.meta = { createdAt: nowIso, updatedAt: nowIso };
  }
  if (!store.meta.createdAt) {
    store.meta.createdAt = nowIso;
  }
  store.meta.updatedAt = nowIso;
  return store;
}

async function readStore() {
  await ensureCacheDir();

  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || !parsed.tickers) {
      return clone(EMPTY_STORE);
    }

    return parsed;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return clone(EMPTY_STORE);
    }
    throw err;
  }
}

function persistStore(store) {
  writeQueue = writeQueue.then(async () => {
    await ensureCacheDir();
    await fs.writeFile(STORE_PATH, JSON.stringify(withMeta(store), null, 2), 'utf8');
  });
  return writeQueue;
}

function normalizeTicker(ticker) {
  return String(ticker || '').trim().toUpperCase();
}

function buildRecord({ dates, closes, fetchedAt }) {
  const length = Math.min(dates.length, closes.length);
  const normalizedDates = dates.slice(0, length);
  const normalizedCloses = closes.slice(0, length);

  return {
    dates: normalizedDates,
    closes: normalizedCloses,
    firstDate: normalizedDates[0] || null,
    lastDate: normalizedDates[normalizedDates.length - 1] || null,
    points: normalizedDates.length,
    updatedAt: fetchedAt,
  };
}

async function upsertTickerHistory(ticker, history, fetchedAt = new Date().toISOString()) {
  const key = normalizeTicker(ticker);
  if (!key) {
    throw new Error('Ticker is required for upsertTickerHistory');
  }

  const store = await readStore();
  store.tickers[key] = buildRecord({
    dates: history.dates || [],
    closes: history.closes || [],
    fetchedAt,
  });
  await persistStore(store);

  return clone(store.tickers[key]);
}

async function getTickerHistory(ticker) {
  const key = normalizeTicker(ticker);
  if (!key) {
    return null;
  }

  const store = await readStore();
  return store.tickers[key] ? clone(store.tickers[key]) : null;
}

async function getTickerUpdatedAt(ticker) {
  const record = await getTickerHistory(ticker);
  return record?.updatedAt || null;
}

async function getStoreSummary() {
  const store = await readStore();
  const tickers = Object.keys(store.tickers);

  let totalPoints = 0;
  let oldestUpdate = null;
  let newestUpdate = null;

  for (const ticker of tickers) {
    const row = store.tickers[ticker];
    totalPoints += Number(row?.points || 0);

    if (row?.updatedAt) {
      if (!oldestUpdate || row.updatedAt < oldestUpdate) oldestUpdate = row.updatedAt;
      if (!newestUpdate || row.updatedAt > newestUpdate) newestUpdate = row.updatedAt;
    }
  }

  return {
    filePath: STORE_PATH,
    tickerCount: tickers.length,
    totalPoints,
    oldestUpdate,
    newestUpdate,
    metaUpdatedAt: store.meta?.updatedAt || null,
  };
}

module.exports = {
  STORE_PATH,
  readStore,
  getTickerHistory,
  getTickerUpdatedAt,
  upsertTickerHistory,
  getStoreSummary,
};
