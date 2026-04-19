'use strict';

const { getEtfUniverse, normalizeAssetClass, normalizeProviderFilter } = require('./etfUniverseService');
const { getPriceHistory } = require('./priceHistoryService');
const {
  DEFAULT_INVESTMENT_DURATION_MONTHS,
  DEFAULT_RECOMMENDATION_LIMIT,
  MAX_INVESTMENT_DURATION_MONTHS,
  MIN_INVESTMENT_DURATION_MONTHS,
  normalizeInvestmentDurationMonths,
  normalizeRecommendationLimit,
  getInvestmentProfile,
} = require('./recommendationProfiles');
const {
  getPercentChange,
  computeAnnualizedVolatilityPct,
  getDistanceToRecentHighPct,
  computeRsiScore,
  computeSellRsiScore,
  computeVolatilityRegimeScore,
  deriveUnifiedRecommendation,
} = require('./recommendationScores');
const { buildRationale, buildSellRationale } = require('./recommendationRationale');
const { analyzeTechnicalSetup } = require('./technicalSetupAnalyzer');

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;

async function analyzeInstrumentForDuration(instrument, { bypassCache = false, investmentDurationMonths }) {
  try {
    const history = await getPriceHistory(instrument, bypassCache);
    const result = analyzeTechnicalSetup({
      dates: history.dates,
      closes: history.closes,
      investmentDurationMonths,
    });

    return {
      assetClass: instrument.assetClass || 'stock',
      provider: instrument.provider,
      ticker: instrument.ticker,
      name: instrument.name,
      isin: instrument.isin || 'nicht verfügbar',
      wkn: instrument.wkn || 'nicht verfügbar',
      investmentDurationMonths,
      ...result,
    };
  } catch (err) {
    return {
      assetClass: instrument.assetClass || 'etf',
      provider: instrument.provider,
      ticker: instrument.ticker,
      name: instrument.name,
      isin: instrument.isin || 'nicht verfügbar',
      wkn: instrument.wkn || 'nicht verfügbar',
      investmentDurationMonths,
      ok: false,
      insufficientData: false,
      error: err.message,
    };
  }
}

function rankBuyRecommendations(successful, limit) {
  return successful
    .slice()
    .sort((a, b) => (b.buyScore ?? b.score ?? 0) - (a.buyScore ?? a.score ?? 0))
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      score: item.buyScore ?? item.score,
    }));
}

function rankSellRecommendations(successful, limit) {
  return successful
    .slice()
    .sort((a, b) => (b.sellScore ?? 0) - (a.sellScore ?? 0))
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      score: item.sellScore,
    }));
}

function rankAllRecommendations(successful) {
  return successful
    .slice()
    .sort((a, b) => {
      const byStrength = (b.recommendationStrengthScore ?? 0) - (a.recommendationStrengthScore ?? 0);
      if (byStrength !== 0) return byStrength;
      return (b.buyScore ?? b.score ?? 0) - (a.buyScore ?? a.score ?? 0);
    })
    .map((item, index) => ({
      rank: index + 1,
      ...item,
    }));
}

async function analyzeUniverse(universe, { bypassCache, investmentDurationMonths }) {
  const analyzed = [];

  for (let i = 0; i < universe.length; i += BATCH_SIZE) {
    const batch = universe.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(item => analyzeInstrumentForDuration(item, { bypassCache, investmentDurationMonths }))
    );
    analyzed.push(...batchResults);

    if (i + BATCH_SIZE < universe.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return analyzed;
}

async function getTopRecommendations({
  bypassCache = false,
  providerFilter = 'all',
  assetClass: assetClassInput = 'all',
  investmentDurationMonths: investmentDurationMonthsInput,
  limit: limitInput = DEFAULT_RECOMMENDATION_LIMIT,
} = {}) {
  const investmentDurationMonths = normalizeInvestmentDurationMonths(investmentDurationMonthsInput);
  const limit = normalizeRecommendationLimit(limitInput);
  const assetClass = normalizeAssetClass(assetClassInput);
  const normalizedProviderFilter = normalizeProviderFilter(providerFilter);
  const universe = await getEtfUniverse({
    providerFilter: normalizedProviderFilter,
    bypassCache,
    assetClass,
  });

  const analyzed = await analyzeUniverse(universe, { bypassCache, investmentDurationMonths });
  const successful = analyzed.filter(item => item.ok === true);
  const skipped = analyzed.filter(item => item.ok !== true);

  const buyRecommendations = rankBuyRecommendations(successful, limit);
  const sellRecommendations = rankSellRecommendations(successful, limit);
  const allRecommendations = rankAllRecommendations(successful);

  const profile = getInvestmentProfile(investmentDurationMonths);

  return {
    assetClass,
    providerFilter: normalizedProviderFilter,
    investmentDurationMonths,
    profileKey: profile.key,
    profileLabel: profile.label,
    total: universe.length,
    analyzed: analyzed.length,
    successful: successful.length,
    skipped: skipped.length,
    recommendations: buyRecommendations,
    buyRecommendations,
    sellRecommendations,
    allRecommendations,
    skippedItems: skipped.slice(0, 10),
  };
}

module.exports = {
  DEFAULT_INVESTMENT_DURATION_MONTHS,
  DEFAULT_RECOMMENDATION_LIMIT,
  MAX_INVESTMENT_DURATION_MONTHS,
  MIN_INVESTMENT_DURATION_MONTHS,
  analyzeTechnicalSetup,
  getInvestmentProfile,
  getTopRecommendations,
  normalizeInvestmentDurationMonths,
  normalizeRecommendationLimit,
  _internal: {
    getPercentChange,
    computeAnnualizedVolatilityPct,
    getDistanceToRecentHighPct,
    computeRsiScore,
    computeSellRsiScore,
    computeVolatilityRegimeScore,
    buildRationale,
    buildSellRationale,
    deriveUnifiedRecommendation,
  },
};
