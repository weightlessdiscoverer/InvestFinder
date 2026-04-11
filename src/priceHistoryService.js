'use strict';

const { fetchDailyCloses } = require('./dataService');
const { getTickerHistory, upsertTickerHistory } = require('./yahooHistoryStore');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const priceCache = new Map();

function normalizeTickerKey(instrument) {
  return String(instrument?.ticker || '').trim().toUpperCase();
}

function readFreshMemorySnapshot(key, now) {
  const cached = priceCache.get(key);
  if (!cached || now >= cached.expiresAt) {
    return null;
  }

  return { dates: cached.dates, closes: cached.closes };
}

function canUseStoredHistory(stored) {
  return Boolean(
    stored &&
    Array.isArray(stored.dates) &&
    Array.isArray(stored.closes) &&
    stored.dates.length > 0
  );
}

function saveToMemoryCache(key, snapshot, now) {
  priceCache.set(key, {
    dates: snapshot.dates,
    closes: snapshot.closes,
    expiresAt: now + CACHE_TTL_MS,
  });
}

async function getPriceHistory(instrument, bypassCache = false) {
  const now = Date.now();
  const key = normalizeTickerKey(instrument);

  if (!key) {
    throw new Error('Ticker fehlt fuer Kursdatenabruf.');
  }

  if (!bypassCache) {
    const cachedSnapshot = readFreshMemorySnapshot(key, now);
    if (cachedSnapshot) {
      return cachedSnapshot;
    }
  }

  if (!bypassCache) {
    const stored = await getTickerHistory(key);
    if (canUseStoredHistory(stored)) {
      const snapshot = { dates: stored.dates, closes: stored.closes };
      saveToMemoryCache(key, snapshot, now);
      return snapshot;
    }
  }

  const history = await fetchDailyCloses(key);
  await upsertTickerHistory(key, history);

  saveToMemoryCache(key, history, now);

  return history;
}

module.exports = {
  CACHE_TTL_MS,
  getPriceHistory,
};