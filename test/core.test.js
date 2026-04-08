'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSmaPeriod,
  normalizeLookbackDays,
  DEFAULT_SMA_PERIOD,
  MIN_SMA_PERIOD,
  MAX_SMA_PERIOD,
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
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

// ── detectBreakoutSignal – additional scenarios ──────────────────────────────

test('detectBreakoutSignal returns no signal when both days are above SMA', () => {
  // SMA3 of [8, 9, 12] = (8+9+12)/3 = 9.67; both yesterday and today above → no crossover
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'],
    closes: [8, 9, 12, 13],
    smaPeriod: 3,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, false);
});

test('detectBreakoutSignal returns no signal when both days are below SMA', () => {
  // SMA3 of [10, 10, 10] = 10; both yesterday (9) and today (8) below → no crossover
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'],
    closes: [10, 10, 9, 8],
    smaPeriod: 3,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, false);
});

test('detectBreakoutSignal returns correct todayClose and todaySMA values for spread calculation', () => {
  // SMA2 of [10, 10] = 10; yesterday close=9 (below), today close=11 (above)
  // Expected spread: (11 - 10) / 10 * 100 = 10 %
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
    closes: [10, 9, 11],
    smaPeriod: 2,
  });

  assert.equal(result.signal, true);
  assert.equal(result.todayClose, 11);
  assert.equal(result.todaySMA, 10);

  // Verify the spread formula used by the client-side max-above-SMA filter
  const spreadPct = ((result.todayClose - result.todaySMA) / result.todaySMA) * 100;
  assert.equal(spreadPct, 10);
});

test('detectBreakoutSignal spread filter boundary: exactly at limit is a match', () => {
  // todayClose=11, todaySMA=10 → spread=10 %; maxPct=10 → should match (<=)
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
    closes: [10, 9, 11],
    smaPeriod: 2,
  });

  const spreadPct = ((result.todayClose - result.todaySMA) / result.todaySMA) * 100;
  const maxPct = 10;
  assert.equal(spreadPct <= maxPct, true, 'Kurs exakt am Limit soll als Treffer gewertet werden');
});

test('detectBreakoutSignal spread filter boundary: one tick above limit is no match', () => {
  // todayClose=11, todaySMA=10 → spread=10 %; maxPct=9 → should NOT match
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
    closes: [10, 9, 11],
    smaPeriod: 2,
  });

  const spreadPct = ((result.todayClose - result.todaySMA) / result.todaySMA) * 100;
  const maxPct = 9;
  assert.equal(spreadPct <= maxPct, false, 'Kurs ueber dem Limit soll nicht als Treffer gewertet werden');
});

test('detectBreakoutSignal computes breakoutSteepnessPct correctly', () => {
  // closes: [10, 9, 11], SMA2: [null, 9.5, 10]
  // yesterdaySpread = (9 - 9.5) / 9.5 * 100 = -5.263...
  // todaySpread     = (11 - 10) / 10 * 100 = 10
  // steepness       = 10 - (-5.263) = 15.263...
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
    closes: [10, 9, 11],
    smaPeriod: 2,
  });

  assert.ok(result.breakoutSteepnessPct > 0, 'Steilheit muss positiv sein beim Aufwaerts-Durchstoss');
  const expected = 10 - ((9 - 9.5) / 9.5 * 100);
  assert.equal(result.breakoutSteepnessPct, +expected.toFixed(4));
});

// ── normalizeAssetClass ───────────────────────────────────────────────────────

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

// ── normalizeLookbackDays ─────────────────────────────────────────────────────

test('normalizeLookbackDays returns default when input is empty', () => {
  assert.equal(normalizeLookbackDays(), DEFAULT_LOOKBACK_DAYS);
  assert.equal(normalizeLookbackDays(''), DEFAULT_LOOKBACK_DAYS);
  assert.equal(normalizeLookbackDays(null), DEFAULT_LOOKBACK_DAYS);
});

test('normalizeLookbackDays accepts valid integer values', () => {
  assert.equal(normalizeLookbackDays(0), 0);
  assert.equal(normalizeLookbackDays(7), 7);
  assert.equal(normalizeLookbackDays(30), 30);
  assert.equal(normalizeLookbackDays(365), 365);
  assert.equal(normalizeLookbackDays(String(MAX_LOOKBACK_DAYS)), MAX_LOOKBACK_DAYS);
});

test('normalizeLookbackDays rejects invalid values', () => {
  assert.throws(() => normalizeLookbackDays(-1), /Ungueltige Lookback-Periode/);
  assert.throws(() => normalizeLookbackDays(10.5), /Ungueltige Lookback-Periode/);
  assert.throws(() => normalizeLookbackDays(MAX_LOOKBACK_DAYS + 1), /zu gross/);
});

// ── detectBreakoutSignal with lookbackDays parameter ──────────────────────────

test('detectBreakoutSignal with lookbackDays=0 behaves like default (yesterday vs today)', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'],
    closes: [8, 8, 7, 12],
    smaPeriod: 3,
    lookbackDays: 0,
  });

  assert.equal(result.signal, true);
  assert.equal(result.insufficientData, false);
  assert.equal(result.todayDate, '2026-01-04');
  assert.equal(result.breakoutSteepnessPct !== undefined, true);
});

test('detectBreakoutSignal with lookbackDays finds most recent crossing within timeframe', () => {
  // Crossing on 2026-01-03: 7 < SMA(3) to 12 > SMA(3)
  // lookbackDays=10 should find it
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
    closes: [8, 8, 7, 12, 11],
    smaPeriod: 3,
    lookbackDays: 10,
  });

  assert.equal(result.signal, true);
  assert.equal(result.insufficientData, false);
  assert.equal(result.lookbackDays, 10);
  assert.equal(result.breakoutDate, '2026-01-04');
  assert.equal(result.todayDate, '2026-01-05');
});

test('detectBreakoutSignal with lookbackDays returns false when no crossing found', () => {
  // No crossing: all closes above SMA
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
    closes: [10, 11, 12, 13, 14],
    smaPeriod: 3,
    lookbackDays: 10,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, false);
  assert.equal(result.lookbackDays, 10);
});

test('detectBreakoutSignal with lookbackDays respects timeframe limit', () => {
  // Crossing at index 3, but lookbackDays=1 means only last 2 data points (indices 4-5)
  // Should NOT find the crossing at index 3
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
    closes: [8, 8, 7, 12, 11, 10],
    smaPeriod: 3,
    lookbackDays: 1,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, false);
  assert.equal(result.lookbackDays, 1);
});

test('detectBreakoutSignal with lookbackDays finds most recent of multiple crossings', () => {
  // First crossing: index 3 (7 < 8.5 and 12 > 9.5)
  // Second crossing: index 5 (9 < 10.5 and 13 > 11) – newer, should be returned
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
    closes: [10, 10, 7, 12, 9, 13],
    smaPeriod: 2,
    lookbackDays: 10,
  });

  assert.equal(result.signal, true);
  assert.equal(result.breakoutDate, '2026-01-06');
  assert.equal(result.todayDate, '2026-01-06');
});

test('detectBreakoutSignal with lookbackDays reports details for crossing date', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'],
    closes: [8, 8, 7, 12],
    smaPeriod: 3,
    lookbackDays: 10,
  });

  assert.equal(result.signal, true);
  assert.equal(result.breakoutDate, '2026-01-04');
  assert.ok(result.breakoutClose !== undefined);
  assert.ok(result.breakoutSMA !== undefined);
  assert.ok(result.breakoutSpreadPct !== undefined);
  assert.ok(result.todayDate !== undefined);
  assert.ok(result.todayClose !== undefined);
  assert.ok(result.todaySMA !== undefined);
});

test('detectBreakoutSignal returns no signal when fast SMA remains below slow SMA', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
    closes: [15, 16, 17, 18, 19],
    fastSmaPeriod: 2,
    slowSmaPeriod: 3,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, false);
});

test('detectBreakoutSignal returns no signal for downward crossover (sell signal)', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
    closes: [5, 6, 7, 8, 3],
    fastSmaPeriod: 2,
    slowSmaPeriod: 3,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, false);
});

test('detectBreakoutSignal with lookback=0 behaves like default in SMA-crossover mode', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
    closes: [13, 12, 11, 10, 15],
    fastSmaPeriod: 2,
    slowSmaPeriod: 3,
    lookbackDays: 0,
  });

  assert.equal(result.signal, true);
  assert.equal(result.mode, 'sma-crossover');
  assert.ok(result.todayFastSMA !== undefined);
});

test('detectBreakoutSignal respects lookback window limit in SMA-crossover mode', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
    closes: [13, 12, 11, 15, 10, 9],
    fastSmaPeriod: 2,
    slowSmaPeriod: 3,
    lookbackDays: 1,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, false);
});
