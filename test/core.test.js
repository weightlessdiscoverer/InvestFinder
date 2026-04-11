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
const { computeRSI, computeSMA } = require('../src/indicators');
const { detectBreakoutSignal } = require('../src/signals');
const { classifyFreshness } = require('../src/yahooHistoryStore');
const {
  analyzeTechnicalSetup,
  DEFAULT_INVESTMENT_DURATION_MONTHS,
  getInvestmentProfile,
  normalizeRecommendationLimit,
  normalizeInvestmentDurationMonths,
} = require('../src/recommendationEngine');
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

test('computeRSI returns bounded values after warmup period', () => {
  const rsi = computeRSI([44, 44.15, 43.9, 44.35, 44.8, 45.1, 44.9, 45.2, 45.55, 45.4, 45.8, 46.2, 46.1, 46.5, 46.9, 47.1], 14);
  assert.equal(rsi.length, 16);
  assert.equal(rsi.slice(0, 14).every(value => value === null), true);
  assert.ok(rsi[15] >= 0 && rsi[15] <= 100);
});

test('normalizeInvestmentDurationMonths returns default when input is empty', () => {
  assert.equal(normalizeInvestmentDurationMonths(), DEFAULT_INVESTMENT_DURATION_MONTHS);
  assert.equal(normalizeInvestmentDurationMonths(''), DEFAULT_INVESTMENT_DURATION_MONTHS);
  assert.equal(normalizeInvestmentDurationMonths(null), DEFAULT_INVESTMENT_DURATION_MONTHS);
});

test('normalizeInvestmentDurationMonths validates bounds', () => {
  assert.equal(normalizeInvestmentDurationMonths(3), 3);
  assert.throws(() => normalizeInvestmentDurationMonths(0), /Ungueltige Anlagedauer/);
  assert.throws(() => normalizeInvestmentDurationMonths(121), /Maximal erlaubt/);
});

test('normalizeRecommendationLimit validates bounds', () => {
  assert.equal(normalizeRecommendationLimit(), 3);
  assert.equal(normalizeRecommendationLimit(5), 5);
  assert.throws(() => normalizeRecommendationLimit(0), /Ungueltiges Limit/);
  assert.throws(() => normalizeRecommendationLimit(11), /Maximal erlaubt/);
});

test('getInvestmentProfile maps durations to short, medium and long horizons', () => {
  assert.equal(getInvestmentProfile(3).key, 'short');
  assert.equal(getInvestmentProfile(6).key, 'medium');
  assert.equal(getInvestmentProfile(24).key, 'long');
});

test('analyzeTechnicalSetup scores strong trend higher than weak trend', () => {
  const dates = Array.from({ length: 240 }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    const month = String((Math.floor(index / 28) % 12) + 1).padStart(2, '0');
    const year = 2025 + Math.floor(index / 336);
    return `${year}-${month}-${day}`;
  });

  const strongTrend = Array.from({ length: 240 }, (_, index) => 100 + index * 0.55 + Math.sin(index / 6) * 0.8);
  const weakTrend = Array.from({ length: 240 }, (_, index) => 180 - index * 0.25 + Math.sin(index / 4) * 1.2);

  const strongResult = analyzeTechnicalSetup({
    dates,
    closes: strongTrend,
    investmentDurationMonths: 12,
  });
  const weakResult = analyzeTechnicalSetup({
    dates,
    closes: weakTrend,
    investmentDurationMonths: 12,
  });

  assert.equal(strongResult.ok, true);
  assert.equal(weakResult.ok, true);
  assert.ok(strongResult.score > weakResult.score);
  assert.ok(Number.isFinite(strongResult.buyScore));
  assert.ok(Number.isFinite(strongResult.sellScore));
  assert.ok(['Buy', 'Hold', 'Sell'].includes(strongResult.recommendation));
  assert.ok(Number.isFinite(strongResult.recommendationStrengthScore));
  assert.ok(typeof strongResult.recommendationStrength === 'string');
  assert.equal(strongResult.profileKey, 'medium');
});

test('analyzeTechnicalSetup reports insufficient data for too-short histories', () => {
  const result = analyzeTechnicalSetup({
    dates: ['2026-01-01', '2026-01-02'],
    closes: [100, 101],
    investmentDurationMonths: 6,
  });

  assert.equal(result.ok, false);
  assert.equal(result.insufficientData, true);
  assert.equal(result.profileKey, 'medium');
  assert.match(result.error, /Zu wenige Kursdaten/);
});

test('analyzeTechnicalSetup classifies a falling long-term setup as weak', () => {
  const dates = Array.from({ length: 240 }, (_, index) => `2026-02-${String((index % 28) + 1).padStart(2, '0')}`);
  const fallingSeries = Array.from({ length: 240 }, (_, index) => 220 - index * 0.45 + Math.sin(index / 3) * 0.6);

  const result = analyzeTechnicalSetup({
    dates,
    closes: fallingSeries,
    investmentDurationMonths: 24,
  });

  assert.equal(result.ok, true);
  assert.equal(result.profileKey, 'long');
  assert.equal(result.outlook, 'Schwach');
  assert.ok(result.score < 45);
});

async function withMockedRecommendationEngine({ universe, historiesByTicker }, callback) {
  const recommendationEnginePath = require.resolve('../src/recommendationEngine');
  const etfUniverseService = require('../src/etfUniverseService');
  const priceHistoryService = require('../src/priceHistoryService');

  const originalGetEtfUniverse = etfUniverseService.getEtfUniverse;
  const originalGetPriceHistory = priceHistoryService.getPriceHistory;

  etfUniverseService.getEtfUniverse = async () => universe;
  priceHistoryService.getPriceHistory = async instrument => {
    const history = historiesByTicker[instrument.ticker];
    if (history instanceof Error) {
      throw history;
    }
    return history;
  };

  delete require.cache[recommendationEnginePath];

  try {
    const mockedEngine = require('../src/recommendationEngine');
    await callback(mockedEngine);
  } finally {
    etfUniverseService.getEtfUniverse = originalGetEtfUniverse;
    priceHistoryService.getPriceHistory = originalGetPriceHistory;
    delete require.cache[recommendationEnginePath];
  }
}

function buildHistory({ length = 240, start = 100, slope = 0, amplitude = 0.5, frequency = 8 }) {
  const dates = Array.from({ length }, (_, index) => {
    const month = String((Math.floor(index / 28) % 12) + 1).padStart(2, '0');
    const day = String((index % 28) + 1).padStart(2, '0');
    return `2025-${month}-${day}`;
  });
  const closes = Array.from(
    { length },
    (_, index) => start + (index * slope) + (Math.sin(index / frequency) * amplitude)
  );

  return { dates, closes };
}

test('getTopRecommendations returns top-ranked items and skips failing histories', async () => {
  const universe = [
    { provider: 'iShares', ticker: 'AAA', name: 'Alpha ETF', isin: 'AAA', wkn: 'AAA', assetClass: 'etf' },
    { provider: 'iShares', ticker: 'BBB', name: 'Beta ETF', isin: 'BBB', wkn: 'BBB', assetClass: 'etf' },
    { provider: 'Xtrackers', ticker: 'CCC', name: 'Gamma ETF', isin: 'CCC', wkn: 'CCC', assetClass: 'etf' },
    { provider: 'Xtrackers', ticker: 'ERR', name: 'Broken ETF', isin: 'ERR', wkn: 'ERR', assetClass: 'etf' },
  ];
  const historiesByTicker = {
    AAA: buildHistory({ start: 90, slope: 0.62, amplitude: 0.45, frequency: 10 }),
    BBB: buildHistory({ start: 105, slope: 0.38, amplitude: 0.5, frequency: 7 }),
    CCC: buildHistory({ start: 140, slope: -0.12, amplitude: 1.1, frequency: 4 }),
    ERR: new Error('Yahoo offline'),
  };

  await withMockedRecommendationEngine({ universe, historiesByTicker }, async mockedEngine => {
    const result = await mockedEngine.getTopRecommendations({
      assetClass: 'etf',
      providerFilter: 'all',
      investmentDurationMonths: 6,
      limit: 2,
    });

    assert.equal(result.total, 4);
    assert.equal(result.analyzed, 4);
    assert.equal(result.successful, 3);
    assert.equal(result.skipped, 1);
    assert.equal(result.profileKey, 'medium');
    assert.equal(result.recommendations.length, 2);
    assert.equal(result.buyRecommendations.length, 2);
    assert.equal(result.sellRecommendations.length, 2);
    assert.equal(result.allRecommendations.length, 3);
    assert.equal(result.buyRecommendations[0].rank, 1);
    assert.equal(result.buyRecommendations[1].rank, 2);
    assert.equal(result.sellRecommendations[0].rank, 1);
    assert.equal(result.sellRecommendations[1].rank, 2);
    assert.ok(result.buyRecommendations[0].score >= result.buyRecommendations[1].score);
    assert.ok(result.sellRecommendations[0].score >= result.sellRecommendations[1].score);
    assert.ok(result.allRecommendations.every(item => ['Buy', 'Hold', 'Sell'].includes(item.recommendation)));
    assert.ok(result.allRecommendations.every(item => Number.isFinite(item.recommendationStrengthScore)));
    assert.equal(result.skippedItems[0].ticker, 'ERR');
    assert.match(result.skippedItems[0].error, /Yahoo offline/);
  });
});

test('getTopRecommendations respects long-horizon profile and requested limit', async () => {
  const universe = [
    { provider: 'DAX40', ticker: 'ONE', name: 'One', isin: 'ONE', wkn: 'ONE', assetClass: 'dax40' },
    { provider: 'DAX40', ticker: 'TWO', name: 'Two', isin: 'TWO', wkn: 'TWO', assetClass: 'dax40' },
    { provider: 'DAX40', ticker: 'THR', name: 'Three', isin: 'THR', wkn: 'THR', assetClass: 'dax40' },
  ];
  const historiesByTicker = {
    ONE: buildHistory({ start: 70, slope: 0.52, amplitude: 0.4, frequency: 11 }),
    TWO: buildHistory({ start: 82, slope: 0.2, amplitude: 0.35, frequency: 9 }),
    THR: buildHistory({ start: 130, slope: -0.18, amplitude: 0.8, frequency: 5 }),
  };

  await withMockedRecommendationEngine({ universe, historiesByTicker }, async mockedEngine => {
    const result = await mockedEngine.getTopRecommendations({
      assetClass: 'dax40',
      providerFilter: 'all',
      investmentDurationMonths: 24,
      limit: 3,
    });

    assert.equal(result.profileKey, 'long');
    assert.equal(result.profileLabel, 'Langfristig');
    assert.equal(result.buyRecommendations.length, 3);
    assert.equal(result.sellRecommendations.length, 3);
    assert.equal(result.allRecommendations.length, 3);
    assert.deepEqual(result.buyRecommendations.map(item => item.rank), [1, 2, 3]);
    assert.deepEqual(result.sellRecommendations.map(item => item.rank), [1, 2, 3]);
    assert.ok(result.buyRecommendations.every(item => item.profileKey === 'long'));
    assert.ok(result.sellRecommendations.every(item => item.profileKey === 'long'));
    assert.ok(result.allRecommendations.every(item => ['Buy', 'Hold', 'Sell'].includes(item.recommendation)));
    assert.ok(result.buyRecommendations[0].score >= result.buyRecommendations[2].score);
    assert.ok(result.sellRecommendations[0].score >= result.sellRecommendations[2].score);
  });
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
