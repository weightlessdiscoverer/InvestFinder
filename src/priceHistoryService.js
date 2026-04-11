'use strict';

const { fetchDailyCloses } = require('./dataService');
const { getTickerHistory, upsertTickerHistory } = require('./yahooHistoryStore');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const priceCache = new Map();

async function getPriceHistory(instrument, bypassCache = false) {
  const now = Date.now();
  const key = String(instrument?.ticker || '').trim().toUpperCase();

  if (!key) {
    throw new Error('Ticker fehlt fuer Kursdatenabruf.');
  }

  if (!bypassCache && priceCache.has(key)) {
    const cached = priceCache.get(key);
    if (now < cached.expiresAt) {
      return { dates: cached.dates, closes: cached.closes };
    }
  }

  if (!bypassCache) {
    const stored = await getTickerHistory(key);
    if (stored && Array.isArray(stored.dates) && Array.isArray(stored.closes) && stored.dates.length > 0) {
      const snapshot = { dates: stored.dates, closes: stored.closes };
      priceCache.set(key, {
        dates: snapshot.dates,
        closes: snapshot.closes,
        expiresAt: now + CACHE_TTL_MS,
      });
      return snapshot;
    }
  }

  const history = await fetchDailyCloses(key);
  await upsertTickerHistory(key, history);

  priceCache.set(key, {
    dates: history.dates,
    closes: history.closes,
    expiresAt: now + CACHE_TTL_MS,
  });

  return history;
}

module.exports = {
  CACHE_TTL_MS,
  getPriceHistory,
};