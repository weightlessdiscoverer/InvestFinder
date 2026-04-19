'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsPromises = require('node:fs/promises');

const {
  scanAllETFs,
  normalizeSmaPeriod,
  normalizeLookbackDays,
  normalizeSignalConfig,
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
const etfUniverseServiceModule = require('../src/etfUniverseService');
const { computeRSI, computeSMA } = require('../src/indicators');
const { detectBreakoutSignal } = require('../src/signals');
const signalsModule = require('../src/signals');
const { classifyFreshness } = require('../src/yahooHistoryStore');
const yahooHistoryStoreModule = require('../src/yahooHistoryStore');
const yahooDiscoveryServiceModule = require('../src/yahooDiscoveryService');
const {
  analyzeTechnicalSetup,
  DEFAULT_INVESTMENT_DURATION_MONTHS,
  getInvestmentProfile,
  normalizeRecommendationLimit,
  normalizeInvestmentDurationMonths,
} = require('../src/recommendationEngine');
const recommendationEngineModule = require('../src/recommendationEngine');
const {
  isValidIsinFormat,
  getIdentifiersByTicker,
  getMasterDataIndex,
  warmMasterDataCache,
} = require('../src/masterDataService');
const dax40FreshnessServiceModule = require('../src/dax40FreshnessService');

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

test('analyzeTechnicalSetup can produce Buy, Sell and Hold recommendations', () => {
  const dates = Array.from({ length: 260 }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    const month = String((Math.floor(index / 28) % 12) + 1).padStart(2, '0');
    return `2026-${month}-${day}`;
  });

  const bullishCloses = Array.from({ length: 260 }, (_, index) => 60 + (index * 0.9) + (Math.sin(index / 7) * 0.2));
  const bearishCloses = Array.from({ length: 260 }, (_, index) => 300 - (index * 0.95) + (Math.sin(index / 7) * 0.2));
  const neutralCloses = Array.from(
    { length: 260 },
    (_, index) => 120 + (Math.sin(index / 8) * 3.5) + (Math.sin(index / 21) * 1.8)
  );

  const bullish = analyzeTechnicalSetup({ dates, closes: bullishCloses, investmentDurationMonths: 12 });
  const bearish = analyzeTechnicalSetup({ dates, closes: bearishCloses, investmentDurationMonths: 12 });
  const neutral = analyzeTechnicalSetup({ dates, closes: neutralCloses, investmentDurationMonths: 12 });

  assert.equal(bullish.ok, true);
  assert.equal(bearish.ok, true);
  assert.equal(neutral.ok, true);

  assert.equal(bullish.recommendation, 'Buy');
  assert.equal(bearish.recommendation, 'Sell');
  assert.equal(neutral.recommendation, 'Hold');
  assert.ok(['Sehr stark', 'Stark', 'Mittel', 'Schwach'].includes(bullish.recommendationStrength));
  assert.ok(['Sehr stark', 'Stark', 'Mittel', 'Schwach'].includes(bearish.recommendationStrength));
  assert.ok(['Sehr stark', 'Stark', 'Mittel', 'Schwach'].includes(neutral.recommendationStrength));
});

test('analyzeTechnicalSetup derives stop loss from the sell recommendation threshold', () => {
  const dates = Array.from({ length: 260 }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    const month = String((Math.floor(index / 28) % 12) + 1).padStart(2, '0');
    return `2026-${month}-${day}`;
  });
  const bullishCloses = Array.from({ length: 260 }, (_, index) => 60 + (index * 0.9) + (Math.sin(index / 7) * 0.2));

  const result = analyzeTechnicalSetup({
    dates,
    closes: bullishCloses,
    investmentDurationMonths: 12,
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendation, 'Buy');
  assert.equal(result.stopLossBasis, 'Sell-Schwelle');
  assert.ok(Number.isFinite(result.stopLoss));
  assert.ok(result.stopLoss < result.currentClose);

  const atThresholdCloses = bullishCloses.slice();
  atThresholdCloses[atThresholdCloses.length - 1] = result.stopLoss;
  const atThreshold = analyzeTechnicalSetup({
    dates,
    closes: atThresholdCloses,
    investmentDurationMonths: 12,
  });

  const aboveThresholdCloses = bullishCloses.slice();
  aboveThresholdCloses[aboveThresholdCloses.length - 1] = result.stopLoss + 0.1;
  const aboveThreshold = analyzeTechnicalSetup({
    dates,
    closes: aboveThresholdCloses,
    investmentDurationMonths: 12,
  });

  assert.equal(atThreshold.recommendation, 'Sell');
  assert.notEqual(aboveThreshold.recommendation, 'Sell');
});

test('analyzeTechnicalSetup reports insufficient data when indicators contain non-finite values', () => {
  const dates = Array.from({ length: 240 }, (_, index) => `2026-03-${String((index % 28) + 1).padStart(2, '0')}`);
  const closes = Array.from({ length: 240 }, (_, index) => 100 + index * 0.2);
  closes[closes.length - 1] = Number.NaN;

  const result = analyzeTechnicalSetup({
    dates,
    closes,
    investmentDurationMonths: 6,
  });

  assert.equal(result.ok, false);
  assert.equal(result.insufficientData, true);
  assert.match(result.error, /Kennzahlen konnten nicht vollstaendig berechnet werden/);
});

test('analyzeTechnicalSetup handles zero baselines in momentum/volatility windows', () => {
  const dates = Array.from({ length: 240 }, (_, index) => `2026-04-${String((index % 28) + 1).padStart(2, '0')}`);
  const closes = Array.from({ length: 240 }, (_, index) => 120 + index * 0.15);

  closes[239 - 20] = 0;
  closes[239 - 60] = 0;
  closes[239 - 120] = 0;
  closes[230] = 0;
  closes[231] = 140;

  const result = analyzeTechnicalSetup({
    dates,
    closes,
    investmentDurationMonths: 12,
  });

  assert.equal(result.ok, true);
  assert.equal(result.momentum20Pct, null);
  assert.equal(result.momentum60Pct, null);
  assert.equal(result.momentum120Pct, null);
  assert.equal(result.annualizedVolatilityPct, null);
});

test('recommendationEngine internal helpers cover defensive guards and thresholds', () => {
  const {
    getPercentChange,
    computeAnnualizedVolatilityPct,
    getDistanceToRecentHighPct,
    computeVolatilityRegimeScore,
    deriveUnifiedRecommendation,
  } = recommendationEngineModule._internal;

  assert.equal(getPercentChange(null, 20), null);
  assert.equal(getPercentChange([1, 2, 3], 3), null);
  assert.equal(getPercentChange([1, 2, Number.NaN], 1), null);
  assert.equal(getPercentChange([0, 2], 1), null);
  assert.equal(getPercentChange([100, 110], 1), 10);

  assert.equal(computeAnnualizedVolatilityPct([1, 2, 3], 20), null);
  assert.equal(computeAnnualizedVolatilityPct([0, ...Array.from({ length: 20 }, () => 1)], 20), null);
  assert.ok(Number.isFinite(computeAnnualizedVolatilityPct(Array.from({ length: 21 }, (_, i) => 100 + i), 20)));

  assert.equal(getDistanceToRecentHighPct([1, 2, 3], 60), null);
  assert.equal(getDistanceToRecentHighPct(Array.from({ length: 60 }, () => 0), 60), null);
  assert.ok(Number.isFinite(getDistanceToRecentHighPct(Array.from({ length: 60 }, (_, i) => 100 + i), 60)));

  assert.equal(computeVolatilityRegimeScore(null, { targetVolatilityPct: 20, volatilityTolerancePct: 10 }), 50);
  assert.ok(
    computeVolatilityRegimeScore(20, { targetVolatilityPct: 20, volatilityTolerancePct: 10 })
    > computeVolatilityRegimeScore(35, { targetVolatilityPct: 20, volatilityTolerancePct: 10 })
  );

  const buy = deriveUnifiedRecommendation({ buyScore: 80, sellScore: 50 });
  const hold = deriveUnifiedRecommendation({ buyScore: 50, sellScore: 45 });
  const sell = deriveUnifiedRecommendation({ buyScore: 35, sellScore: 60 });

  assert.equal(buy.recommendation, 'Buy');
  assert.equal(hold.recommendation, 'Hold');
  assert.equal(sell.recommendation, 'Sell');
});

test('dax40FreshnessService extracts ticker records from wikitable html', () => {
  const { extractDaxRecordsFromWikipediaHtml } = dax40FreshnessServiceModule._internal;

  const html = `
    <table class="wikitable sortable">
      <tr><th>Company</th><th>Ticker symbol</th><th>ISIN</th></tr>
      <tr><td>adidas</td><td>ADS</td><td>DE000A1EWWW0</td></tr>
      <tr><td>Allianz</td><td>ALV</td><td>DE0008404005</td></tr>
      <tr><td>Covestro</td><td>1COV</td><td>DE0006062144</td></tr>
      <tr><td>Symrise</td><td>SY1</td><td>DE000SYM9999</td></tr>
      <tr><td>BASF</td><td>BAS</td><td>DE000BASF111</td></tr>
      <tr><td>Bayer</td><td>BAYN</td><td>DE000BAY0017</td></tr>
      <tr><td>BMW</td><td>BMW</td><td>DE0005190003</td></tr>
      <tr><td>Commerzbank</td><td>CBK</td><td>DE000CBK1001</td></tr>
      <tr><td>SAP</td><td>SAP</td><td>DE0007164600</td></tr>
      <tr><td>RWE</td><td>RWE</td><td>DE0007037129</td></tr>
      <tr><td>E.ON</td><td>EOAN</td><td>DE000ENAG999</td></tr>
      <tr><td>Siemens</td><td>SIE</td><td>DE0007236101</td></tr>
      <tr><td>Infineon</td><td>IFX</td><td>DE0006231004</td></tr>
      <tr><td>Brenntag</td><td>BNR</td><td>DE000A1DAHH0</td></tr>
      <tr><td>Rheinmetall</td><td>RHM</td><td>DE0007030009</td></tr>
      <tr><td>Fresenius</td><td>FRE</td><td>DE0005785604</td></tr>
      <tr><td>Fresenius Medical Care</td><td>FME</td><td>DE0005785802</td></tr>
      <tr><td>Hannover Rueck</td><td>HNR1</td><td>DE0008402215</td></tr>
      <tr><td>Vonovia</td><td>VNA</td><td>DE000A1ML7J1</td></tr>
      <tr><td>Zalando</td><td>ZAL</td><td>DE000ZAL1111</td></tr>
      <tr><td>DHL Group</td><td>DHL</td><td>DE0005552004</td></tr>
      <tr><td>Deutsche Telekom</td><td>DTE</td><td>DE0005557508</td></tr>
      <tr><td>Deutsche Bank</td><td>DBK</td><td>DE0005140008</td></tr>
      <tr><td>Deutsche Boerse</td><td>DB1</td><td>DE0005810055</td></tr>
      <tr><td>Porsche AG</td><td>P911</td><td>DE000PAG9113</td></tr>
      <tr><td>Porsche SE</td><td>PAH3</td><td>DE000PAH0038</td></tr>
      <tr><td>Mercedes-Benz Group</td><td>MBG</td><td>DE0007100000</td></tr>
      <tr><td>Merck</td><td>MRK</td><td>DE0006599905</td></tr>
      <tr><td>MTU</td><td>MTX</td><td>DE000A0D9PT0</td></tr>
      <tr><td>Muenchener Rueck</td><td>MUV2</td><td>DE0008430026</td></tr>
      <tr><td>Henkel</td><td>HEN3</td><td>DE0006048432</td></tr>
      <tr><td>Heidelberg Materials</td><td>HEI</td><td>DE0006047004</td></tr>
    </table>
  `;

  const records = extractDaxRecordsFromWikipediaHtml(html);
  const byTicker = new Map(records.map(item => [item.ticker, item]));

  assert.ok(records.length >= 30);
  assert.equal(byTicker.has('ADS.DE'), true);
  assert.equal(byTicker.has('ALV.DE'), true);
  assert.equal(byTicker.has('1COV.DE'), true);
  assert.equal(byTicker.has('HNR1.DE'), true);
  assert.equal(byTicker.get('ADS.DE').name, 'adidas');
});

test('dax40FreshnessService compares local and remote ticker sets', () => {
  const { compareTickerSets } = dax40FreshnessServiceModule._internal;

  const diff = compareTickerSets(
    ['ADS.DE', 'ALV.DE', 'BAS.DE'],
    ['ADS.DE', 'ALV.DE', 'RHM.DE']
  );

  assert.deepEqual(diff.missingInLocal, ['RHM.DE']);
  assert.deepEqual(diff.staleInLocal, ['BAS.DE']);
});

test('dax40FreshnessService merge keeps existing local metadata', () => {
  const { buildUpdatedDaxRecords } = dax40FreshnessServiceModule._internal;

  const merged = buildUpdatedDaxRecords(
    [
      { ticker: 'ADS.DE', name: 'adidas AG (remote)' },
      { ticker: 'RHM.DE', name: 'Rheinmetall AG' },
    ],
    [
      { provider: 'DAX40', ticker: 'ADS.DE', name: 'adidas AG', isin: '', wkn: 'A1EWWW' },
      { provider: 'DAX40', ticker: 'ALV.DE', name: 'Allianz SE', isin: '', wkn: '840400' },
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].ticker, 'ADS.DE');
  assert.equal(merged[0].name, 'adidas AG');
  assert.equal(merged[0].wkn, 'A1EWWW');
  assert.equal(merged[1].ticker, 'RHM.DE');
  assert.equal(merged[1].wkn, '');
});

test('recommendationEngine rationale helpers return fallback text when no weighted signals exist', () => {
  const { buildRationale, buildSellRationale } = recommendationEngineModule._internal;

  const fallbackBuy = buildRationale({
    profile: { label: 'Test', weights: {} },
    trendScore: null,
    momentum20Score: null,
    momentum60Score: null,
    momentum120Score: null,
    rsiScore: null,
    breakoutScore: null,
  });

  const fallbackSell = buildSellRationale({
    sellProfile: { weights: {} },
    trendScore: null,
    momentum20Score: null,
    momentum60Score: null,
    momentum120Score: null,
    rsiScore: null,
    breakdownScore: null,
  });

  assert.match(fallbackBuy, /Keine klare technische Begruendung/);
  assert.match(fallbackSell, /Keine klare technische Begruendung/);
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



test('/api/scan accepts assetClass=mdax and forwards to analysis', async () => {
  await withMockedScanApi(async ({ assetClass, providerFilter }) => {
    assert.equal(assetClass, 'mdax');
    assert.equal(providerFilter, 'all');

    return {
      assetClass: 'mdax',
      providerFilter: 'all',
      mode: 'price-breakout',
      smaPeriod: 200,
      smaLabel: 'SMA200',
      total: 1,
      scanned: 1,
      matches: [],
      errors: [],
    };
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/scan?assetClass=mdax&provider=all&sma=200`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.results.assetClass, 'mdax');
    assert.equal(body.results.providerFilter, 'all');
  });
});

test('/api/scan accepts assetClass=daxmdax and forwards to analysis', async () => {
  await withMockedScanApi(async ({ assetClass, providerFilter }) => {
    assert.equal(assetClass, 'daxmdax');
    assert.equal(providerFilter, 'all');

    return {
      assetClass: 'daxmdax',
      providerFilter: 'all',
      mode: 'price-breakout',
      smaPeriod: 200,
      smaLabel: 'SMA200',
      total: 2,
      scanned: 2,
      matches: [],
      errors: [],
    };
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/scan?assetClass=daxmdax&provider=all&sma=200`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.results.assetClass, 'daxmdax');
    assert.equal(body.results.providerFilter, 'all');
  });
});

test('/api/recommendations accepts assetClass=mdax and forwards to engine', async () => {
  await withMockedRecommendationsApi(async ({ assetClass, providerFilter, investmentDurationMonths, limit }) => {
    assert.equal(assetClass, 'mdax');
    assert.equal(providerFilter, 'all');
    assert.equal(investmentDurationMonths, 12);
    assert.equal(limit, 3);

    return {
      assetClass: 'mdax',
      providerFilter: 'all',
      investmentDurationMonths: 12,
      profileKey: 'medium',
      profileLabel: 'Mittelfristig',
      total: 1,
      analyzed: 1,
      successful: 1,
      skipped: 0,
      recommendations: [],
      buyRecommendations: [],
      sellRecommendations: [],
      allRecommendations: [],
      skippedItems: [],
    };
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/recommendations?assetClass=mdax&provider=all&investmentDurationMonths=12&limit=3`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.results.assetClass, 'mdax');
    assert.equal(body.results.providerFilter, 'all');
  });
});

test('/api/recommendations accepts assetClass=daxmdax and forwards to engine', async () => {
  await withMockedRecommendationsApi(async ({ assetClass, providerFilter, investmentDurationMonths, limit }) => {
    assert.equal(assetClass, 'daxmdax');
    assert.equal(providerFilter, 'all');
    assert.equal(investmentDurationMonths, 12);
    assert.equal(limit, 3);

    return {
      assetClass: 'daxmdax',
      providerFilter: 'all',
      investmentDurationMonths: 12,
      profileKey: 'medium',
      profileLabel: 'Mittelfristig',
      total: 2,
      analyzed: 2,
      successful: 2,
      skipped: 0,
      recommendations: [],
      buyRecommendations: [],
      sellRecommendations: [],
      allRecommendations: [],
      skippedItems: [],
    };
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/recommendations?assetClass=daxmdax&provider=all&investmentDurationMonths=12&limit=3`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.results.assetClass, 'daxmdax');
    assert.equal(body.results.providerFilter, 'all');
  });
});

test('/api/available-instruments returns mdax entries', async () => {
  await withMockedAvailableInstrumentsApi({
    listAvailableTickerRecords: async () => ([
      {
        ticker: 'HFG.DE',
        points: 120,
        firstDate: '2026-01-01',
        lastDate: '2026-04-10',
        updatedAt: '2026-04-12T08:00:00.000Z',
        freshness: { label: 'Sehr aktuell', level: 'very-fresh', ageInDays: 0 },
      },
    ]),
    getEtfUniverse: async ({ assetClass }) => {
      assert.equal(assetClass, 'mdax');
      return [
        {
          assetClass: 'mdax',
          provider: 'MDAX',
          ticker: 'HFG.DE',
          name: 'HelloFresh SE',
          isin: '',
          wkn: '',
        },
      ];
    },
    getStoreSummary: async () => ({
      freshness: { label: 'Sehr aktuell', level: 'very-fresh', ageInDays: 0 },
    }),
    classifyFreshness: () => ({ label: 'Sehr aktuell', level: 'very-fresh', ageInDays: 0 }),
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/available-instruments?assetClass=mdax&provider=all`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.assetClass, 'mdax');
    assert.equal(body.count, 1);
    assert.equal(body.items[0].provider, 'MDAX');
    assert.equal(body.items[0].ticker, 'HFG.DE');
  });
});

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
  assert.equal(normalizeAssetClass(' mdax '), 'mdax');
  assert.equal(normalizeAssetClass(' daxmdax '), 'daxmdax');
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

  const mdax = await getEtfUniverse({ assetClass: 'mdax', bypassCache: true });
  assert.ok(mdax.length > 0);
  assert.ok(mdax.every(item => item.provider === 'MDAX'));
  assert.ok(mdax.every(item => item.assetClass === 'mdax'));

  const daxmdax = await getEtfUniverse({ assetClass: 'daxmdax', bypassCache: true });
  assert.ok(daxmdax.length > 0);
  assert.ok(daxmdax.some(item => item.provider === 'DAX40'));
  assert.ok(daxmdax.some(item => item.provider === 'MDAX'));
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

test('normalizeSignalConfig validates both modes and crossover constraints', () => {
  const breakout = normalizeSignalConfig({ smaPeriodInput: 30 });
  assert.equal(breakout.mode, 'price-breakout');
  assert.equal(breakout.smaPeriod, 30);
  assert.equal(breakout.smaLabel, 'SMA30');

  const crossover = normalizeSignalConfig({ fastSmaPeriodInput: 20, slowSmaPeriodInput: 50 });
  assert.equal(crossover.mode, 'sma-crossover');
  assert.equal(crossover.fastSmaLabel, 'SMA20');
  assert.equal(crossover.slowSmaLabel, 'SMA50');

  assert.throws(
    () => normalizeSignalConfig({ fastSmaPeriodInput: 20 }),
    /Fast-SMA und Slow-SMA gemeinsam/
  );
  assert.throws(
    () => normalizeSignalConfig({ fastSmaPeriodInput: 30, slowSmaPeriodInput: 30 }),
    /muessen unterschiedlich/
  );
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

test('detectBreakoutSignal with lookbackDays returns false when current price is below SMA after a prior crossing', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
    closes: [8, 8, 7, 12, 8],
    smaPeriod: 3,
    lookbackDays: 10,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, false);
  assert.equal(result.todayDate, '2026-01-05');
});

test('detectBreakoutSignal with performanceDays and minPerformancePct filters weak breakouts', () => {
  const result = detectBreakoutSignal({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'],
    closes: [10, 9, 10.5, 10.8],
    smaPeriod: 2,
    lookbackDays: 10,
    performanceDays: 1,
    minPerformancePct: 3,
  });

  assert.equal(result.signal, false);
  assert.equal(result.insufficientData, false);
  assert.ok(result.performancePct != null);
  assert.ok(result.performancePct < 3);
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

test('signals internal lookback helper returns null for missing/zero lookback', () => {
  const { getStartIdxForLookback } = signalsModule._internal;
  assert.equal(getStartIdxForLookback(100, 20, null), null);
  assert.equal(getStartIdxForLookback(100, 20, 0), null);
  assert.equal(getStartIdxForLookback(100, 20, -2), null);
  assert.equal(getStartIdxForLookback(100, 20, 10), 89);
});

async function withMockedSignalsComputeSma(mockComputeSma, callback) {
  const signalsPath = require.resolve('../src/signals');
  const indicators = require('../src/indicators');
  const originalComputeSMA = indicators.computeSMA;

  indicators.computeSMA = mockComputeSma;
  delete require.cache[signalsPath];

  try {
    const mockedSignals = require('../src/signals');
    await callback(mockedSignals);
  } finally {
    indicators.computeSMA = originalComputeSMA;
    delete require.cache[signalsPath];
  }
}

test('detectPriceBreakoutSignal reports insufficient data when SMA values are null despite enough closes', async () => {
  await withMockedSignalsComputeSma(() => [null, null, null], async mockedSignals => {
    const result = mockedSignals.detectPriceBreakoutSignal({
      dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
      closes: [10, 11, 12],
      smaPeriod: 2,
    });

    assert.equal(result.signal, false);
    assert.equal(result.insufficientData, true);
    assert.match(result.error, /Keine gueltigen SMA-Werte/);
  });
});

test('detectSmaCrossoverSignal reports insufficient data when SMA values are null despite enough closes', async () => {
  await withMockedSignalsComputeSma(() => [null, null, null, null], async mockedSignals => {
    const result = mockedSignals.detectSmaCrossoverSignal({
      dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'],
      closes: [10, 11, 12, 13],
      fastSmaPeriod: 2,
      slowSmaPeriod: 3,
    });

    assert.equal(result.signal, false);
    assert.equal(result.insufficientData, true);
    assert.match(result.error, /Keine gueltigen SMA-Werte/);
  });
});

test('etfUniverseService internal source helper returns empty list for unknown provider', () => {
  const { getSourceForProvider } = etfUniverseServiceModule._internal;
  assert.deepEqual(getSourceForProvider('UnknownProvider'), []);
});

test('getEtfUniverse supports assetClass=all and provider cache reuse', async () => {
  const modulePath = require.resolve('../src/etfUniverseService');
  const discoveryModule = require('../src/yahooDiscoveryService');
  const originalGetDiscoveredEtfs = discoveryModule.getDiscoveredEtfs;

  const calls = { discovered: 0 };
  discoveryModule.getDiscoveredEtfs = async ({ providerFilter }) => {
    calls.discovered += 1;
    if (providerFilter === 'ishares') {
      return [{ ticker: 'CACHE.T1', name: 'Cache One', isin: '', wkn: '' }];
    }
    return [{ ticker: 'CACHE.T2', name: 'Cache Two', isin: '', wkn: '' }];
  };

  delete require.cache[modulePath];
  try {
    const service = require('../src/etfUniverseService');
    service._internal.providerCache.clear();

    const firstEtf = await service.getEtfUniverse({ providerFilter: 'all', assetClass: 'etf', bypassCache: false });
    const secondEtf = await service.getEtfUniverse({ providerFilter: 'all', assetClass: 'etf', bypassCache: false });
    const allAssets = await service.getEtfUniverse({ providerFilter: 'all', assetClass: 'all', bypassCache: false });

    assert.ok(firstEtf.length > 0);
    assert.equal(secondEtf.length, firstEtf.length);
    assert.ok(allAssets.some(item => item.assetClass === 'dax40'));
    assert.ok(allAssets.some(item => item.assetClass === 'mdax'));
    assert.ok(allAssets.some(item => item.assetClass === 'etf'));
    assert.equal(calls.discovered, 2);
  } finally {
    discoveryModule.getDiscoveredEtfs = originalGetDiscoveredEtfs;
    delete require.cache[modulePath];
  }
});

async function withMockedAnalysisModule({
  universe,
  historyByTicker,
  signalByTicker,
  throwByTicker,
} = {}, callback) {
  const analysisPath = require.resolve('../src/analysis');
  const etfUniverseService = require('../src/etfUniverseService');
  const priceHistoryService = require('../src/priceHistoryService');
  const signals = require('../src/signals');

  const originalGetEtfUniverse = etfUniverseService.getEtfUniverse;
  const originalGetPriceHistory = priceHistoryService.getPriceHistory;
  const originalDetectBreakoutSignal = signals.detectBreakoutSignal;
  const originalSetTimeout = global.setTimeout;

  const calls = {
    getEtfUniverse: 0,
    getPriceHistory: 0,
    detectBreakoutSignal: 0,
  };

  etfUniverseService.getEtfUniverse = async () => {
    calls.getEtfUniverse += 1;
    return universe || [];
  };

  priceHistoryService.getPriceHistory = async etf => {
    calls.getPriceHistory += 1;
    const key = etf.ticker;
    if (throwByTicker && throwByTicker[key]) {
      throw throwByTicker[key];
    }
    return historyByTicker && historyByTicker[key]
      ? historyByTicker[key]
      : { dates: ['2026-01-01', '2026-01-02'], closes: [100, 101] };
  };

  signals.detectBreakoutSignal = payload => {
    calls.detectBreakoutSignal += 1;
    const signature = Array.isArray(payload?.closes) ? payload.closes.join(',') : '';
    const bySignature = signalByTicker && signalByTicker[signature];
    if (bySignature) {
      return bySignature;
    }

    if (!Array.isArray(payload?.closes) || payload.closes.length < 2) {
      return {
        signal: false,
        insufficientData: true,
        error: 'Zu wenige Kursdaten',
      };
    }

    const firstClose = payload.closes[0];
    const lastClose = payload.closes[payload.closes.length - 1];

    return {
      signal: lastClose > firstClose,
      insufficientData: false,
      todayDate: payload.dates[payload.dates.length - 1] || null,
      todayClose: lastClose || null,
      todaySMA: firstClose || null,
    };
  };

  global.setTimeout = callbackFn => {
    callbackFn();
    return 0;
  };

  delete require.cache[analysisPath];

  try {
    const mockedAnalysis = require('../src/analysis');
    await callback({ mockedAnalysis, calls });
  } finally {
    etfUniverseService.getEtfUniverse = originalGetEtfUniverse;
    priceHistoryService.getPriceHistory = originalGetPriceHistory;
    signals.detectBreakoutSignal = originalDetectBreakoutSignal;
    global.setTimeout = originalSetTimeout;
    delete require.cache[analysisPath];
  }
}

test('scanAllETFs aggregates matches and errors for price-breakout mode', async () => {
  const universe = [
    { provider: 'iShares', ticker: 'AAA', name: 'Alpha', isin: 'AAA', wkn: 'AAA', assetClass: 'etf' },
    { provider: 'iShares', ticker: 'BBB', name: 'Beta', isin: 'BBB', wkn: 'BBB', assetClass: 'etf' },
    { provider: 'iShares', ticker: 'ERR', name: 'Broken', isin: 'ERR', wkn: 'ERR', assetClass: 'etf' },
  ];

  await withMockedAnalysisModule({
    universe,
    historyByTicker: {
      AAA: { dates: ['2026-01-01', '2026-01-02', '2026-01-03'], closes: [10, 11, 12] },
      BBB: { dates: ['2026-01-01'], closes: [8] },
    },
    throwByTicker: {
      ERR: new Error('History down'),
    },
  }, async ({ mockedAnalysis, calls }) => {
    const result = await mockedAnalysis.scanAllETFs({
      providerFilter: 'all',
      assetClass: 'etf',
      smaPeriod: 20,
      lookbackDays: 5,
    });

    assert.equal(result.mode, 'price-breakout');
    assert.equal(result.smaLabel, 'SMA20');
    assert.equal(result.lookbackDays, 5);
    assert.equal(result.total, 3);
    assert.equal(result.scanned, 3);
    assert.ok(result.matches.length >= 0);
    assert.ok(result.errors.length >= 1);
    assert.equal(result.errors.some(item => item.ticker === 'ERR'), true);
    assert.equal(calls.getEtfUniverse, 1);
    assert.equal(calls.getPriceHistory, 3);
  });
});

test('scanAllETFs supports sma-crossover mode and internal signal cache', async () => {
  const universe = [
    { provider: 'Xtrackers', ticker: 'XAA', name: 'Cross', isin: 'XAA', wkn: 'XAA', assetClass: 'etf' },
  ];

  await withMockedAnalysisModule({
    universe,
    historyByTicker: {
      XAA: {
        dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
        closes: [10, 9, 12],
      },
    },
  }, async ({ mockedAnalysis, calls }) => {
    const result1 = await mockedAnalysis.scanAllETFs({
      providerFilter: 'xtrackers',
      assetClass: 'etf',
      fastSmaPeriod: 20,
      slowSmaPeriod: 50,
    });

    const result2 = await mockedAnalysis.scanAllETFs({
      providerFilter: 'xtrackers',
      assetClass: 'etf',
      fastSmaPeriod: 20,
      slowSmaPeriod: 50,
    });

    assert.equal(result1.mode, 'sma-crossover');
    assert.equal(result1.fastSmaLabel, 'SMA20');
    assert.equal(result1.slowSmaLabel, 'SMA50');
    assert.equal(result1.smaLabel, 'SMA20/SMA50');
    assert.equal(result1.total, 1);
    assert.equal(result2.total, 1);

    assert.equal(calls.getPriceHistory, 1, 'zweiter Lauf soll aus Signal-Cache bedienen');
  });
});

test('scanAllETFs bypassCache bypasses internal signal cache', async () => {
  const universe = [
    { provider: 'Xtrackers', ticker: 'BYP', name: 'Bypass', isin: 'BYP', wkn: 'BYP', assetClass: 'etf' },
  ];

  await withMockedAnalysisModule({
    universe,
    historyByTicker: {
      BYP: {
        dates: ['2026-01-01', '2026-01-02'],
        closes: [10, 11],
      },
    },
  }, async ({ mockedAnalysis, calls }) => {
    await mockedAnalysis.scanAllETFs({ smaPeriod: 10, bypassCache: true });
    await mockedAnalysis.scanAllETFs({ smaPeriod: 10, bypassCache: true });

    assert.equal(calls.getPriceHistory, 2);
  });
});

async function withMockedPriceHistoryService({
  storedHistory = null,
  fetchedHistory = { dates: ['2026-01-01'], closes: [101] },
} = {}, callback) {
  const priceHistoryPath = require.resolve('../src/priceHistoryService');
  const dataService = require('../src/dataService');
  const yahooHistoryStore = require('../src/yahooHistoryStore');

  const originalFetchDailyCloses = dataService.fetchDailyCloses;
  const originalGetTickerHistory = yahooHistoryStore.getTickerHistory;
  const originalUpsertTickerHistory = yahooHistoryStore.upsertTickerHistory;

  const calls = {
    fetchDailyCloses: 0,
    getTickerHistory: 0,
    upsertTickerHistory: 0,
  };

  dataService.fetchDailyCloses = async () => {
    calls.fetchDailyCloses += 1;
    return fetchedHistory;
  };

  yahooHistoryStore.getTickerHistory = async () => {
    calls.getTickerHistory += 1;
    return storedHistory;
  };

  yahooHistoryStore.upsertTickerHistory = async () => {
    calls.upsertTickerHistory += 1;
  };

  delete require.cache[priceHistoryPath];

  try {
    const mockedService = require('../src/priceHistoryService');
    await callback({ mockedService, calls });
  } finally {
    dataService.fetchDailyCloses = originalFetchDailyCloses;
    yahooHistoryStore.getTickerHistory = originalGetTickerHistory;
    yahooHistoryStore.upsertTickerHistory = originalUpsertTickerHistory;
    delete require.cache[priceHistoryPath];
  }
}

async function withMockedYahooHistoryStore({
  initialRaw,
  writeError,
} = {}, callback) {
  const storeModulePath = require.resolve('../src/yahooHistoryStore');

  const originalReadFile = fsPromises.readFile;
  const originalWriteFile = fsPromises.writeFile;
  const originalMkdir = fsPromises.mkdir;
  const originalRename = fsPromises.rename;

  let persistedRaw = initialRaw;
  let backupRaw = null;
  const tmpFiles = new Map();

  function isStorePath(filePath) {
    return String(filePath).endsWith('yahoo-history-db.json');
  }

  function isBackupPath(filePath) {
    return String(filePath).endsWith('yahoo-history-db.backup.json');
  }

  function readVirtualFile(filePath) {
    if (isStorePath(filePath)) {
      return persistedRaw;
    }
    if (isBackupPath(filePath)) {
      return backupRaw;
    }
    return tmpFiles.has(filePath) ? tmpFiles.get(filePath) : null;
  }

  function writeVirtualFile(filePath, content) {
    if (isStorePath(filePath)) {
      persistedRaw = content;
      return;
    }
    if (isBackupPath(filePath)) {
      backupRaw = content;
      return;
    }
    tmpFiles.set(filePath, content);
  }

  function deleteVirtualFile(filePath) {
    if (isStorePath(filePath)) {
      persistedRaw = null;
      return;
    }
    if (isBackupPath(filePath)) {
      backupRaw = null;
      return;
    }
    tmpFiles.delete(filePath);
  }

  const io = {
    mkdirCalls: 0,
    readCalls: 0,
    writeCalls: 0,
    renameCalls: 0,
    lastWritePath: null,
  };

  fsPromises.mkdir = async () => {
    io.mkdirCalls += 1;
  };

  fsPromises.readFile = async filePath => {
    io.readCalls += 1;
    const content = readVirtualFile(filePath);
    if (content == null) {
      const err = new Error('not found');
      err.code = 'ENOENT';
      throw err;
    }
    return content;
  };

  fsPromises.writeFile = async (filePath, content) => {
    io.writeCalls += 1;
    io.lastWritePath = filePath;
    if (writeError) {
      throw writeError;
    }
    writeVirtualFile(filePath, content);
  };

  fsPromises.rename = async (fromPath, toPath) => {
    io.renameCalls += 1;
    if (writeError) {
      throw writeError;
    }

    const content = readVirtualFile(fromPath);
    if (content == null) {
      const err = new Error('not found');
      err.code = 'ENOENT';
      throw err;
    }

    writeVirtualFile(toPath, content);
    deleteVirtualFile(fromPath);
  };

  delete require.cache[storeModulePath];

  try {
    const mockedStore = require('../src/yahooHistoryStore');
    await callback({ mockedStore, io, getPersistedRaw: () => persistedRaw });
  } finally {
    fsPromises.readFile = originalReadFile;
    fsPromises.writeFile = originalWriteFile;
    fsPromises.mkdir = originalMkdir;
    fsPromises.rename = originalRename;
    delete require.cache[storeModulePath];
  }
}

test('getPriceHistory validates ticker and throws for missing input', async () => {
  await withMockedPriceHistoryService({}, async ({ mockedService }) => {
    await assert.rejects(() => mockedService.getPriceHistory({}), /Ticker fehlt/);
    await assert.rejects(() => mockedService.getPriceHistory(null), /Ticker fehlt/);
  });
});

test('getPriceHistory reuses in-memory cache on repeated calls', async () => {
  await withMockedPriceHistoryService({
    storedHistory: null,
    fetchedHistory: { dates: ['2026-01-01', '2026-01-02'], closes: [100, 101] },
  }, async ({ mockedService, calls }) => {
    const first = await mockedService.getPriceHistory({ ticker: 'abc' });
    const second = await mockedService.getPriceHistory({ ticker: 'ABC' });

    assert.deepEqual(first, second);
    assert.equal(calls.getTickerHistory, 1);
    assert.equal(calls.fetchDailyCloses, 1);
    assert.equal(calls.upsertTickerHistory, 1);
  });
});

test('getPriceHistory prefers persistent store snapshot when available', async () => {
  const stored = {
    dates: ['2025-12-29', '2025-12-30'],
    closes: [95.5, 96.1],
    updatedAt: '2026-01-01T08:00:00.000Z',
  };

  await withMockedPriceHistoryService({ storedHistory: stored }, async ({ mockedService, calls }) => {
    const result = await mockedService.getPriceHistory({ ticker: 'iwda.as' });

    assert.deepEqual(result, { dates: stored.dates, closes: stored.closes });
    assert.equal(calls.getTickerHistory, 1);
    assert.equal(calls.fetchDailyCloses, 0);
    assert.equal(calls.upsertTickerHistory, 0);
  });
});

test('getPriceHistory bypassCache forces remote fetch and persist', async () => {
  const stored = {
    dates: ['2025-12-29', '2025-12-30'],
    closes: [95.5, 96.1],
  };

  await withMockedPriceHistoryService({
    storedHistory: stored,
    fetchedHistory: { dates: ['2026-01-01'], closes: [111.2] },
  }, async ({ mockedService, calls }) => {
    const result = await mockedService.getPriceHistory({ ticker: 'IWDA.AS' }, true);

    assert.deepEqual(result, { dates: ['2026-01-01'], closes: [111.2] });
    assert.equal(calls.getTickerHistory, 0);
    assert.equal(calls.fetchDailyCloses, 1);
    assert.equal(calls.upsertTickerHistory, 1);
  });
});

test('yahooHistoryStore readStore returns empty structure on ENOENT and invalid shape', async () => {
  await withMockedYahooHistoryStore({ initialRaw: null }, async ({ mockedStore }) => {
    const empty = await mockedStore.readStore();
    assert.deepEqual(empty.tickers, {});
    assert.equal(empty.version, 1);
  });

  await withMockedYahooHistoryStore({ initialRaw: '{"version":1}' }, async ({ mockedStore }) => {
    const invalidShape = await mockedStore.readStore();
    assert.deepEqual(invalidShape.tickers, {});
    assert.equal(invalidShape.version, 1);
  });
});

test('yahooHistoryStore upsert/get normalize ticker and trim inconsistent arrays', async () => {
  await withMockedYahooHistoryStore({ initialRaw: null }, async ({ mockedStore }) => {
    const saved = await mockedStore.upsertTickerHistory(
      ' iwda.as ',
      {
        dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
        closes: [101.1, 102.2],
      },
      '2026-01-04T00:00:00.000Z'
    );

    assert.equal(saved.points, 2);
    assert.deepEqual(saved.dates, ['2026-01-01', '2026-01-02']);
    assert.deepEqual(saved.closes, [101.1, 102.2]);
    assert.equal(saved.firstDate, '2026-01-01');
    assert.equal(saved.lastDate, '2026-01-02');

    const loaded = await mockedStore.getTickerHistory('IWDA.AS');
    assert.equal(loaded.points, 2);
    assert.equal(await mockedStore.getTickerUpdatedAt('iwda.as'), '2026-01-04T00:00:00.000Z');
  });
});

test('yahooHistoryStore summary and list expose aggregated metadata', async () => {
  await withMockedYahooHistoryStore({ initialRaw: null }, async ({ mockedStore, io }) => {
    await mockedStore.upsertTickerHistory(
      'AAA',
      { dates: ['2026-01-01', '2026-01-02'], closes: [10, 11] },
      '2026-01-02T08:00:00.000Z'
    );
    await mockedStore.upsertTickerHistory(
      'BBB',
      { dates: ['2026-01-03', '2026-01-04', '2026-01-05'], closes: [20, 21, 22] },
      '2026-01-05T08:00:00.000Z'
    );

    const summary = await mockedStore.getStoreSummary();
    const rows = await mockedStore.listAvailableTickerRecords();

    assert.equal(summary.tickerCount, 2);
    assert.equal(summary.totalPoints, 5);
    assert.equal(summary.oldestUpdate, '2026-01-02T08:00:00.000Z');
    assert.equal(summary.newestUpdate, '2026-01-05T08:00:00.000Z');
    assert.equal(summary.freshness.level, 'stale');
    assert.equal(typeof summary.filePath, 'string');
    assert.ok(io.writeCalls >= 2);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].ticker, 'BBB');
    assert.equal(rows[0].points, 3);
    assert.equal(rows[1].ticker, 'AAA');
    assert.equal(rows[1].points, 2);
  });
});

test('yahooHistoryStore validates ticker during upsert', async () => {
  await withMockedYahooHistoryStore({ initialRaw: null }, async ({ mockedStore }) => {
    await assert.rejects(
      () => mockedStore.upsertTickerHistory('', { dates: [], closes: [] }),
      /Ticker is required/
    );
  });
});

test('yahooHistoryStore getTickerHistory returns null for empty ticker', async () => {
  await withMockedYahooHistoryStore({ initialRaw: null }, async ({ mockedStore }) => {
    const result = await mockedStore.getTickerHistory('   ');
    assert.equal(result, null);
  });
});

test('yahooHistoryStore getTickerHistory returns null for unknown ticker key', async () => {
  await withMockedYahooHistoryStore({ initialRaw: null }, async ({ mockedStore }) => {
    await mockedStore.upsertTickerHistory(
      'KNOWN',
      { dates: ['2026-01-01'], closes: [10] },
      '2026-01-01T00:00:00.000Z'
    );

    const unknown = await mockedStore.getTickerHistory('UNKNOWN');
    assert.equal(unknown, null);
  });
});

test('yahooHistoryStore deleteTickerHistory removes existing ticker', async () => {
  await withMockedYahooHistoryStore({ initialRaw: null }, async ({ mockedStore }) => {
    await mockedStore.upsertTickerHistory(
      'REMOVE.ME',
      { dates: ['2026-01-01'], closes: [10] },
      '2026-01-01T00:00:00.000Z'
    );

    const deleted = await mockedStore.deleteTickerHistory(' remove.me ');
    const record = await mockedStore.getTickerHistory('REMOVE.ME');

    assert.equal(deleted, true);
    assert.equal(record, null);
  });
});

test('yahooHistoryStore pruneTickerHistories removes matching tickers and reports skipped', async () => {
  await withMockedYahooHistoryStore({ initialRaw: null }, async ({ mockedStore }) => {
    await mockedStore.upsertTickerHistory(
      'AAA',
      { dates: ['2026-01-01'], closes: [1] },
      '2026-01-01T00:00:00.000Z'
    );
    await mockedStore.upsertTickerHistory(
      'BBB',
      { dates: ['2026-01-01'], closes: [2] },
      '2026-01-01T00:00:00.000Z'
    );

    const result = await mockedStore.pruneTickerHistories(['aaa', 'missing', 'bbb']);

    assert.deepEqual(result.deletedTickers, ['AAA', 'BBB']);
    assert.deepEqual(result.skippedTickers, ['MISSING']);
    assert.equal(await mockedStore.getTickerHistory('AAA'), null);
    assert.equal(await mockedStore.getTickerHistory('BBB'), null);
  });
});

test('yahooHistoryStore propagates non-ENOENT read errors', async () => {
  const storeModulePath = require.resolve('../src/yahooHistoryStore');
  const originalReadFile = fsPromises.readFile;
  const originalMkdir = fsPromises.mkdir;

  fsPromises.mkdir = async () => {};
  fsPromises.readFile = async () => {
    const err = new Error('permission denied');
    err.code = 'EACCES';
    throw err;
  };

  delete require.cache[storeModulePath];
  try {
    const mockedStore = require('../src/yahooHistoryStore');
    await assert.rejects(() => mockedStore.readStore(), /permission denied/);
  } finally {
    fsPromises.readFile = originalReadFile;
    fsPromises.mkdir = originalMkdir;
    delete require.cache[storeModulePath];
  }
});

test('yahooHistoryStore upsert creates meta block when missing in existing store', async () => {
  const rawWithoutMeta = JSON.stringify({
    version: 1,
    tickers: {
      OLD: {
        dates: ['2026-01-01'],
        closes: [10],
        firstDate: '2026-01-01',
        lastDate: '2026-01-01',
        points: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  });

  await withMockedYahooHistoryStore({ initialRaw: rawWithoutMeta }, async ({ mockedStore, getPersistedRaw }) => {
    await mockedStore.upsertTickerHistory(
      'NEW',
      { dates: ['2026-01-02'], closes: [11] },
      '2026-01-02T00:00:00.000Z'
    );

    const persisted = JSON.parse(getPersistedRaw());
    assert.ok(persisted.meta);
    assert.ok(persisted.meta.createdAt);
    assert.ok(persisted.meta.updatedAt);
  });
});

test('yahooHistoryStore internal helpers cover meta/date/ticker branches', () => {
  const { withMeta, normalizeTicker, getAgeInDays, buildRecord } = yahooHistoryStoreModule._internal;

  const seededMeta = withMeta({ tickers: {}, meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: null } });
  assert.equal(seededMeta.meta.createdAt, '2026-01-01T00:00:00.000Z');
  assert.ok(seededMeta.meta.updatedAt);

  const createdMeta = withMeta({ tickers: {} });
  assert.ok(createdMeta.meta.createdAt);
  assert.ok(createdMeta.meta.updatedAt);

  assert.equal(normalizeTicker(' iwda.as '), 'IWDA.AS');
  assert.equal(normalizeTicker(null), '');

  assert.equal(getAgeInDays(null), null);
  assert.equal(getAgeInDays('not-a-date'), null);
  assert.ok(Number.isInteger(getAgeInDays(new Date().toISOString())));

  const record = buildRecord({
    dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
    closes: [10, 11],
    fetchedAt: '2026-01-04T00:00:00.000Z',
  });
  assert.equal(record.points, 2);
  assert.equal(record.firstDate, '2026-01-01');
  assert.equal(record.lastDate, '2026-01-02');
});

async function withMockedMasterDataService({ fileContent }, callback) {
  const modulePath = require.resolve('../src/masterDataService');
  const originalReadFile = fsPromises.readFile;

  const io = { readCalls: 0 };
  fsPromises.readFile = async () => {
    io.readCalls += 1;
    return fileContent;
  };

  delete require.cache[modulePath];
  try {
    const mockedModule = require('../src/masterDataService');
    await callback({ mockedModule, io });
  } finally {
    fsPromises.readFile = originalReadFile;
    delete require.cache[modulePath];
  }
}

test('masterDataService ignores duplicate and invalid entries with warnings', async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(String(message));

  try {
    await withMockedMasterDataService({
      fileContent: JSON.stringify({
        version: 7,
        updatedAt: '2026-04-11T10:00:00.000Z',
        source: 'Unit Test Source',
        items: [
          { ticker: ' abc ', isin: 'IE00B4L5Y983', wkn: 'A0RPWH', source: 'row-1' },
          { ticker: 'ABC', isin: 'US0000000000', wkn: 'DUPL00', source: 'row-dup' },
          { ticker: 'bad', isin: 'INVALID', wkn: '', source: 'row-2' },
          { ticker: '', isin: 'IE00B4L5Y983', wkn: 'EMPTY0' },
        ],
      }),
    }, async ({ mockedModule, io }) => {
      const index = await mockedModule.getMasterDataIndex({ bypassCache: true });
      const abc = await mockedModule.getIdentifiersByTicker('ABC');
      const bad = await mockedModule.getIdentifiersByTicker('BAD');

      assert.equal(index.meta.version, 7);
      assert.equal(index.meta.entries, 2);
      assert.equal(abc.isin, 'IE00B4L5Y983');
      assert.equal(abc.wkn, 'A0RPWH');
      assert.equal(abc.hasMasterData, true);
      assert.equal(bad.isin, 'nicht verfügbar');
      assert.equal(bad.wkn, 'nicht verfügbar');
      assert.equal(bad.hasMasterData, false);
      assert.ok(warnings.some(msg => msg.includes('Duplicate ticker')));
      assert.ok(warnings.some(msg => msg.includes('Invalid ISIN format')));
      assert.ok(io.readCalls >= 1);
    });
  } finally {
    console.warn = originalWarn;
  }
});

test('masterDataService shares concurrent load promise and serves cached data', async () => {
  const modulePath = require.resolve('../src/masterDataService');
  const originalReadFile = fsPromises.readFile;

  let readCalls = 0;
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });

  fsPromises.readFile = async () => {
    readCalls += 1;
    await gate;
    return JSON.stringify({
      version: 1,
      updatedAt: '2026-04-11T10:00:00.000Z',
      source: 'Gate Source',
      items: [{ ticker: 'IWDA.AS', isin: 'IE00B4L5Y983', wkn: 'A0RPWH' }],
    });
  };

  delete require.cache[modulePath];
  try {
    const service = require('../src/masterDataService');
    const p1 = service.getMasterDataIndex({ bypassCache: true });
    const p2 = service.getMasterDataIndex({ bypassCache: true });
    release();
    await Promise.all([p1, p2]);

    assert.equal(readCalls, 1);

    fsPromises.readFile = async () => {
      throw new Error('must not read again while cache is valid');
    };

    const cached = await service.getMasterDataIndex();
    assert.equal(cached.meta.entries, 1);
  } finally {
    fsPromises.readFile = originalReadFile;
    delete require.cache[modulePath];
  }
});

async function withMockedYahooDiscoveryService({ cacheObject, fetchMock }, callback) {
  const modulePath = require.resolve('../src/yahooDiscoveryService');
  const originalReadFile = fsPromises.readFile;
  const originalWriteFile = fsPromises.writeFile;
  const originalMkdir = fsPromises.mkdir;
  const originalFetch = global.fetch;
  const originalSetTimeout = global.setTimeout;

  let persistedRaw = cacheObject ? JSON.stringify(cacheObject) : null;
  const io = {
    readCalls: 0,
    writeCalls: 0,
    fetchCalls: 0,
  };

  fsPromises.mkdir = async () => {};
  fsPromises.readFile = async () => {
    io.readCalls += 1;
    if (persistedRaw == null) {
      const err = new Error('not found');
      err.code = 'ENOENT';
      throw err;
    }
    return persistedRaw;
  };
  fsPromises.writeFile = async (_filePath, content) => {
    io.writeCalls += 1;
    persistedRaw = content;
  };

  global.fetch = async (...args) => {
    io.fetchCalls += 1;
    if (fetchMock) {
      return fetchMock(...args);
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { quotes: [] };
      },
    };
  };

  global.setTimeout = fn => {
    fn();
    return 0;
  };

  delete require.cache[modulePath];
  try {
    const service = require('../src/yahooDiscoveryService');
    await callback({ service, io, getPersistedRaw: () => persistedRaw });
  } finally {
    fsPromises.readFile = originalReadFile;
    fsPromises.writeFile = originalWriteFile;
    fsPromises.mkdir = originalMkdir;
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
    delete require.cache[modulePath];
  }
}

test('yahooDiscoveryService returns fresh cache without network calls', async () => {
  const freshCache = {
    updatedAt: new Date(Date.now() - 60 * 1000).toISOString(),
    providers: {
      iShares: [{ ticker: 'IWDA.AS' }],
      Xtrackers: [{ ticker: 'XDWD.DE' }],
    },
  };

  await withMockedYahooDiscoveryService({ cacheObject: freshCache }, async ({ service, io }) => {
    const all = await service.getDiscoveredEtfs();
    const ishares = await service.getDiscoveredEtfs({ providerFilter: 'ishares' });
    const xtrackers = await service.getDiscoveredEtfs({ providerFilter: 'xtrackers' });

    assert.equal(all.length, 2);
    assert.equal(ishares.length, 1);
    assert.equal(xtrackers.length, 1);
    assert.equal(io.fetchCalls, 0);
    assert.equal(io.writeCalls, 0);
  });
});

test('yahooDiscoveryService rebuilds stale cache and filters ETF/provider correctly', async () => {
  const staleCache = {
    updatedAt: '2020-01-01T00:00:00.000Z',
    providers: { iShares: [], Xtrackers: [] },
  };

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(String(message));

  try {
    await withMockedYahooDiscoveryService({
      cacheObject: staleCache,
      fetchMock: async url => {
        if (String(url).includes('iShares%20A')) {
          return {
            ok: false,
            status: 503,
            async json() {
              return {};
            },
          };
        }

        return {
          ok: true,
          status: 200,
          async json() {
            return {
              quotes: [
                { quoteType: 'ETF', symbol: 'IWDA.AS', shortname: 'iShares Core MSCI World' },
                { quoteType: 'ETF', symbol: 'IWDA.AS', longname: 'iShares Duplicate' },
                { quoteType: 'ETF', symbol: 'XDWD.DE', longname: 'DWS Xtrackers MSCI World' },
                { quoteType: 'EQUITY', symbol: 'AAPL', shortname: 'Apple Inc' },
                { quoteType: 'ETF', symbol: '', shortname: 'No Symbol ETF' },
              ],
            };
          },
        };
      },
    }, async ({ service, io, getPersistedRaw }) => {
      const all = await service.getDiscoveredEtfs({ forceRefresh: true });
      const ishares = await service.getDiscoveredEtfs({ providerFilter: 'ishares' });
      const xtrackers = await service.getDiscoveredEtfs({ providerFilter: 'xtrackers' });
      const persisted = JSON.parse(getPersistedRaw());

      assert.ok(all.length >= 2);
      assert.equal(ishares.some(item => item.ticker === 'IWDA.AS'), true);
      assert.equal(xtrackers.some(item => item.ticker === 'XDWD.DE'), true);
      assert.equal(ishares.filter(item => item.ticker === 'IWDA.AS').length, 1);
      assert.ok(io.fetchCalls > 0);
      assert.ok(io.writeCalls > 0);
      assert.equal(persisted.counts.total, persisted.counts.iShares + persisted.counts.Xtrackers);
    });
  } finally {
    console.warn = originalWarn;
  }
});

test('yahooDiscoveryService internal helpers cover quote/provider/cache branches', async () => {
  const {
    buildSeeds,
    looksLikeEtfQuote,
    detectProvider,
    normalizeQuoteToEtf,
    isCacheFresh,
    readDiscoveryCache,
  } = yahooDiscoveryServiceModule._internal;

  const isharesSeeds = buildSeeds('iShares');
  const xtrackersSeeds = buildSeeds('Xtrackers');
  assert.ok(isharesSeeds.length > 20);
  assert.ok(xtrackersSeeds.length > 20);

  assert.equal(looksLikeEtfQuote(null), false);
  assert.equal(looksLikeEtfQuote({ quoteType: 'EQUITY', symbol: 'AAPL', shortname: 'Apple' }), false);
  assert.equal(looksLikeEtfQuote({ quoteType: 'ETF', symbol: '', shortname: 'No Symbol' }), false);
  assert.equal(looksLikeEtfQuote({ quoteType: 'ETF', symbol: 'IWDA.AS', shortname: '' }), false);
  assert.equal(looksLikeEtfQuote({ quoteType: 'ETF', symbol: 'IWDA.AS', shortname: 'iShares Core MSCI World' }), true);

  assert.equal(detectProvider({ shortname: 'iShares Core MSCI World' }), 'iShares');
  assert.equal(detectProvider({ longname: 'DWS Xtrackers MSCI World' }), 'Xtrackers');
  assert.equal(detectProvider({ shortname: 'Unknown ETF Provider' }), null);

  const normalized = normalizeQuoteToEtf({ symbol: 'iwda.as', shortname: 'iShares Core MSCI World' }, 'iShares');
  assert.equal(normalized.ticker, 'IWDA.AS');
  assert.equal(normalized.provider, 'iShares');

  assert.equal(isCacheFresh(null), false);
  assert.equal(isCacheFresh({ updatedAt: 'not-a-date' }), false);
  assert.equal(isCacheFresh({ updatedAt: new Date(Date.now() - (3 * 60 * 60 * 1000)).toISOString() }), true);
  assert.equal(isCacheFresh({ updatedAt: '2020-01-01T00:00:00.000Z' }), false);

  await withMockedYahooDiscoveryService({ cacheObject: null }, async () => {
    const parsed = await readDiscoveryCache();
    assert.equal(parsed, null);
  });

  await withMockedYahooDiscoveryService({ cacheObject: null }, async ({ getPersistedRaw }) => {
    // Force a non-object JSON payload to trigger the explicit null fallback.
    const modulePath = require.resolve('../src/yahooDiscoveryService');
    delete require.cache[modulePath];
    const fsLocal = require('node:fs/promises');
    const originalReadFile = fsLocal.readFile;
    fsLocal.readFile = async () => '"invalid"';
    try {
      const localModule = require('../src/yahooDiscoveryService');
      const data = await localModule._internal.readDiscoveryCache();
      assert.equal(data, null);
    } finally {
      fsLocal.readFile = originalReadFile;
      delete require.cache[modulePath];
      void getPersistedRaw;
    }
  });
});

test('yahooDiscoveryService detectProvider can match alias fallback branch', () => {
  const { detectProvider, PROVIDER_SEARCH } = yahooDiscoveryServiceModule._internal;
  const originalKey = PROVIDER_SEARCH.Xtrackers.key;

  try {
    PROVIDER_SEARCH.Xtrackers.key = 'no-direct-key-match';
    const provider = detectProvider({ longname: 'DWS Xtrackers MSCI World UCITS ETF' });
    assert.equal(provider, 'Xtrackers');
  } finally {
    PROVIDER_SEARCH.Xtrackers.key = originalKey;
  }
});

test('yahooHistoryStore listAvailableTickerRecords filters zero points and resolves sort ties by ticker', async () => {
  await withMockedYahooHistoryStore({ initialRaw: null }, async ({ mockedStore }) => {
    await mockedStore.upsertTickerHistory('BBB', { dates: ['2026-01-01'], closes: [11] }, '2026-01-01T00:00:00.000Z');
    await mockedStore.upsertTickerHistory('AAA', { dates: ['2026-01-01'], closes: [10] }, '2026-01-01T00:00:00.000Z');
    await mockedStore.upsertTickerHistory('ZERO', { dates: ['2026-01-01'], closes: [] }, '2026-01-01T00:00:00.000Z');

    const rows = await mockedStore.listAvailableTickerRecords();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].ticker, 'AAA');
    assert.equal(rows[1].ticker, 'BBB');
  });
});
