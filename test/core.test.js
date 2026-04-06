'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSmaPeriod,
  DEFAULT_SMA_PERIOD,
  MIN_SMA_PERIOD,
  MAX_SMA_PERIOD,
} = require('../src/analysis');
const { fetchDailyCloses } = require('../src/dataService');
const {
  getEtfUniverse,
  normalizeAssetClass,
  normalizeProviderFilter,
} = require('../src/etfUniverseService');
const { computeSMA } = require('../src/indicators');
const { detectBreakoutSignal } = require('../src/signals');
const { classifyFreshness } = require('../src/yahooHistoryStore');
const {
  isValidIsinFormat,
  getIdentifiersByTicker,
  getMasterDataIndex,
  warmMasterDataCache,
} = require('../src/masterDataService');

test('normalizeSmaPeriod returns default when input is empty', () => {
  assert.equal(normalizeSmaPeriod(), DEFAULT_SMA_PERIOD);
  assert.equal(normalizeSmaPeriod(''), DEFAULT_SMA_PERIOD);
  assert.equal(normalizeSmaPeriod(null), DEFAULT_SMA_PERIOD);
});

test('normalizeSmaPeriod accepts valid integer values', () => {
  assert.equal(normalizeSmaPeriod(String(MIN_SMA_PERIOD)), MIN_SMA_PERIOD);
  assert.equal(normalizeSmaPeriod(50), 50);
  assert.equal(normalizeSmaPeriod(MAX_SMA_PERIOD), MAX_SMA_PERIOD);
});

test('normalizeSmaPeriod rejects invalid values', () => {
  assert.throws(() => normalizeSmaPeriod(1), /Ungueltige SMA-Periode/);
  assert.throws(() => normalizeSmaPeriod(10.5), /Ungueltige SMA-Periode/);
  assert.throws(() => normalizeSmaPeriod(MAX_SMA_PERIOD + 1), /zu gross/);
});

test('computeSMA calculates rolling average correctly', () => {
  const sma = computeSMA([1, 2, 3, 4, 5], 3);
  assert.deepEqual(sma, [null, null, 2, 3, 4]);
});

test('detectBreakoutSignal identifies bullish crossover', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'],
    closes: [8, 8, 7, 12],
    smaPeriod: 3,
  });

  assert.equal(result.signal, true);
  assert.equal(result.insufficientData, false);
  assert.equal(result.smaLabel, 'SMA3');
  assert.equal(result.todayDate, '2026-01-04');
  assert.ok(result.breakoutSteepnessPct > 0);
});

test('detectBreakoutSignal reports insufficient data', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02'],
    closes: [10, 11],
    smaPeriod: 3,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, true);
  assert.match(result.error, /Zu wenige Kursdaten/);
});

test('isValidIsinFormat validates expected ISIN shapes', () => {
  assert.equal(isValidIsinFormat('IE00B4L5Y983'), true);
  assert.equal(isValidIsinFormat('de0005933931'), true);
  assert.equal(isValidIsinFormat('INVALID'), false);
  assert.equal(isValidIsinFormat(''), false);
});

test('classifyFreshness follows expected day thresholds', () => {
  const now = new Date();
  const isoDaysAgo = days => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  assert.equal(classifyFreshness(isoDaysAgo(0)).label, 'Sehr aktuell');
  assert.equal(classifyFreshness(isoDaysAgo(5)).label, 'Geht gerade noch');
  assert.equal(classifyFreshness(isoDaysAgo(6)).label, 'Veraltet');
  assert.equal(classifyFreshness(null).label, 'Unbekannt');
});

test('normalizeProviderFilter validates allowed provider values', () => {
  assert.equal(normalizeProviderFilter('all'), 'all');
  assert.equal(normalizeProviderFilter(' iShares '), 'ishares');
  assert.equal(normalizeProviderFilter('XTRACKERS'), 'xtrackers');
  assert.throws(() => normalizeProviderFilter('other'), /Ungueltiger Anbieterfilter/);
});

test('normalizeAssetClass validates allowed asset types', () => {
  assert.equal(normalizeAssetClass('etf'), 'etf');
  assert.equal(normalizeAssetClass(' DAX40 '), 'dax40');
  assert.equal(normalizeAssetClass('all'), 'all');
  assert.throws(() => normalizeAssetClass('stocks'), /Ungueltiger Asset-Typ/);
});

test('getEtfUniverse returns deduplicated valid entries', async () => {
  const all = await getEtfUniverse({ providerFilter: 'all', bypassCache: true });
  const byProviderTicker = new Set(all.map(item => `${item.provider}|${item.ticker}`));

  assert.ok(all.length > 0);
  assert.equal(byProviderTicker.size, all.length);
  assert.ok(all.every(item => item.provider && item.ticker && item.name));

  const ishares = await getEtfUniverse({ providerFilter: 'ishares', bypassCache: true });
  assert.ok(ishares.every(item => item.provider === 'iShares'));

  const dax40 = await getEtfUniverse({ assetClass: 'dax40', bypassCache: true });
  assert.ok(dax40.length > 0);
  assert.ok(dax40.every(item => item.provider === 'DAX40'));
  assert.ok(dax40.every(item => item.assetClass === 'dax40'));
});

test('masterDataService resolves identifiers and supports cache warmup', async () => {
  await warmMasterDataCache({ bypassCache: true });

  const index = await getMasterDataIndex();
  assert.ok(index.meta.entries > 0);

  const known = await getIdentifiersByTicker('IWDA.AS');
  assert.equal(known.isin, 'IE00B4L5Y983');
  assert.equal(known.hasMasterData, true);

  const unknown = await getIdentifiersByTicker('UNKNOWN.TICKER');
  assert.equal(unknown.isin, 'nicht verfügbar');
  assert.equal(unknown.hasMasterData, false);
});

test('fetchDailyCloses parses and normalizes Yahoo chart data', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        chart: {
          result: [
            {
              timestamp: [1704153600, 1704067200, 1704240000],
              indicators: {
                quote: [
                  {
                    close: [101.2, null, 102.5],
                  },
                ],
              },
            },
          ],
        },
      };
    },
  });

  try {
    const result = await fetchDailyCloses('IWDA.AS');
    assert.deepEqual(result.dates, ['2024-01-02', '2024-01-03']);
    assert.deepEqual(result.closes, [101.2, 102.5]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchDailyCloses throws useful errors for HTTP and payload issues', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: false,
    status: 429,
    async json() {
      return {};
    },
  });
  await assert.rejects(fetchDailyCloses('RATE.LIMIT'), /Rate-limited/);

  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        chart: {
          error: { description: 'Symbol not found' },
        },
      };
    },
  });
  await assert.rejects(fetchDailyCloses('MISSING.TICKER'), /No data for ticker/);

  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        chart: {
          result: [
            {
              timestamp: [],
              indicators: { quote: [{ close: [] }] },
            },
          ],
        },
      };
    },
  });
  await assert.rejects(fetchDailyCloses('EMPTY.TICKER'), /Empty price data/);

  global.fetch = originalFetch;
});
