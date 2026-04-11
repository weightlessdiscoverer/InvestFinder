'use strict';

const { computeRSI, computeSMA } = require('./indicators');
const { getEtfUniverse, normalizeAssetClass, normalizeProviderFilter } = require('./etfUniverseService');
const { getPriceHistory } = require('./priceHistoryService');

const DEFAULT_INVESTMENT_DURATION_MONTHS = 12;
const MIN_INVESTMENT_DURATION_MONTHS = 1;
const MAX_INVESTMENT_DURATION_MONTHS = 120;
const DEFAULT_RECOMMENDATION_LIMIT = 3;
const MAX_RECOMMENDATION_LIMIT = 10;
const MIN_REQUIRED_PRICE_POINTS = 220;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;

const PROFILES = {
  short: {
    key: 'short',
    label: 'Kurzfristig',
    minMonths: 1,
    maxMonths: 3,
    rsiTarget: 62,
    weights: {
      trend: 0.2,
      momentum20: 0.3,
      momentum60: 0.15,
      rsi: 0.2,
      breakout: 0.1,
      volatility: 0.05,
    },
  },
  medium: {
    key: 'medium',
    label: 'Mittelfristig',
    minMonths: 4,
    maxMonths: 12,
    rsiTarget: 58,
    weights: {
      trend: 0.3,
      momentum20: 0.1,
      momentum60: 0.25,
      rsi: 0.1,
      breakout: 0.1,
      volatility: 0.15,
    },
  },
  long: {
    key: 'long',
    label: 'Langfristig',
    minMonths: 13,
    maxMonths: MAX_INVESTMENT_DURATION_MONTHS,
    rsiTarget: 55,
    weights: {
      trend: 0.4,
      momentum60: 0.2,
      momentum120: 0.2,
      rsi: 0.05,
      breakout: 0.05,
      volatility: 0.1,
    },
  },
};

const SELL_PROFILES = {
  short: {
    rsiTarget: 38,
    weights: {
      trend: 0.25,
      momentum20: 0.25,
      momentum60: 0.15,
      rsi: 0.15,
      breakdown: 0.1,
      volatility: 0.1,
    },
  },
  medium: {
    rsiTarget: 42,
    weights: {
      trend: 0.35,
      momentum20: 0.1,
      momentum60: 0.2,
      momentum120: 0.15,
      rsi: 0.1,
      breakdown: 0.05,
      volatility: 0.05,
    },
  },
  long: {
    rsiTarget: 45,
    weights: {
      trend: 0.45,
      momentum60: 0.2,
      momentum120: 0.2,
      rsi: 0.05,
      breakdown: 0.05,
      volatility: 0.05,
    },
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(decimals));
}

function scaleToScore(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0;
  return round(clamp(((value - min) / (max - min)) * 100, 0, 100), 2);
}

function inverseScaleToScore(value, min, max) {
  return round(100 - scaleToScore(value, min, max), 2);
}

function normalizeInvestmentDurationMonths(monthsInput) {
  if (monthsInput == null || monthsInput === '') {
    return DEFAULT_INVESTMENT_DURATION_MONTHS;
  }

  const parsed = Number(monthsInput);
  if (!Number.isInteger(parsed) || parsed < MIN_INVESTMENT_DURATION_MONTHS) {
    throw new Error(
      `Ungueltige Anlagedauer. Bitte eine ganze Zahl >= ${MIN_INVESTMENT_DURATION_MONTHS} Monaten angeben.`
    );
  }

  if (parsed > MAX_INVESTMENT_DURATION_MONTHS) {
    throw new Error(
      `Anlagedauer ${parsed} Monate ist zu gross. Maximal erlaubt: ${MAX_INVESTMENT_DURATION_MONTHS}.`
    );
  }

  return parsed;
}

function normalizeRecommendationLimit(limitInput) {
  if (limitInput == null || limitInput === '') {
    return DEFAULT_RECOMMENDATION_LIMIT;
  }

  const parsed = Number(limitInput);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('Ungueltiges Limit. Bitte eine ganze Zahl >= 1 angeben.');
  }

  if (parsed > MAX_RECOMMENDATION_LIMIT) {
    throw new Error(`Limit ${parsed} ist zu gross. Maximal erlaubt: ${MAX_RECOMMENDATION_LIMIT}.`);
  }

  return parsed;
}

function getInvestmentProfile(investmentDurationMonths) {
  const months = normalizeInvestmentDurationMonths(investmentDurationMonths);

  if (months <= PROFILES.short.maxMonths) {
    return PROFILES.short;
  }

  if (months <= PROFILES.medium.maxMonths) {
    return PROFILES.medium;
  }

  return PROFILES.long;
}

function getPercentChange(values, periodsAgo) {
  if (!Array.isArray(values) || values.length <= periodsAgo) {
    return null;
  }

  const latest = values[values.length - 1];
  const previous = values[values.length - 1 - periodsAgo];
  if (!Number.isFinite(latest) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((latest - previous) / previous) * 100;
}

function computeAnnualizedVolatilityPct(closes, periods = 20) {
  if (!Array.isArray(closes) || closes.length <= periods) {
    return null;
  }

  const returns = [];
  for (let i = closes.length - periods; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const current = closes[i];
    if (!Number.isFinite(prev) || !Number.isFinite(current) || prev === 0) {
      return null;
    }
    returns.push((current - prev) / prev);
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function getDistanceToRecentHighPct(closes, period = 60) {
  if (!Array.isArray(closes) || closes.length < period) {
    return null;
  }

  const window = closes.slice(-period);
  const high = Math.max(...window);
  const current = closes[closes.length - 1];
  if (!Number.isFinite(high) || !Number.isFinite(current) || high === 0) {
    return null;
  }

  return ((current - high) / high) * 100;
}

function computeTrendScore({ currentClose, sma20, sma50, sma200, previousSma200 }) {
  let score = 0;

  if (currentClose > sma20) score += 15;
  if (currentClose > sma50) score += 20;
  if (currentClose > sma200) score += 25;
  if (sma20 > sma50) score += 15;
  if (sma50 > sma200) score += 15;
  if (previousSma200 != null && sma200 > previousSma200) score += 10;

  return round(score, 2);
}

function computeBearishTrendScore({ currentClose, sma20, sma50, sma200, previousSma200 }) {
  let score = 0;

  if (currentClose < sma20) score += 15;
  if (currentClose < sma50) score += 20;
  if (currentClose < sma200) score += 25;
  if (sma20 < sma50) score += 15;
  if (sma50 < sma200) score += 15;
  if (previousSma200 != null && sma200 < previousSma200) score += 10;

  return round(score, 2);
}

function computeRsiScore(rsiValue, profile) {
  if (!Number.isFinite(rsiValue)) {
    return 0;
  }

  const distance = Math.abs(rsiValue - profile.rsiTarget);
  let score = clamp(100 - (distance / 18) * 100, 0, 100);

  if (rsiValue > 75) {
    score -= 15;
  }

  if (rsiValue < 40) {
    score -= 20;
  }

  return round(clamp(score, 0, 100), 2);
}

function computeSellRsiScore(rsiValue, sellProfile) {
  if (!Number.isFinite(rsiValue)) {
    return 0;
  }

  const distance = Math.abs(rsiValue - sellProfile.rsiTarget);
  let score = clamp(100 - (distance / 18) * 100, 0, 100);

  if (rsiValue > 60) {
    score -= 20;
  }

  if (rsiValue < 25) {
    score -= 10;
  }

  return round(clamp(score, 0, 100), 2);
}

function buildRationale({ profile, trendScore, momentum20Score, momentum60Score, momentum120Score, rsiScore, breakoutScore }) {
  const weightedSignals = [
    { label: 'Trendstruktur', weight: profile.weights.trend || 0, score: trendScore },
    { label: '1-Monats-Momentum', weight: profile.weights.momentum20 || 0, score: momentum20Score },
    { label: '3-Monats-Momentum', weight: profile.weights.momentum60 || 0, score: momentum60Score },
    { label: '6-Monats-Momentum', weight: profile.weights.momentum120 || 0, score: momentum120Score },
    { label: 'RSI-Regime', weight: profile.weights.rsi || 0, score: rsiScore },
    { label: 'Naehe zum 60T-Hoch', weight: profile.weights.breakout || 0, score: breakoutScore },
  ]
    .filter(item => item.weight > 0 && Number.isFinite(item.score))
    .map(item => ({
      ...item,
      contribution: item.weight * item.score,
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map(item => item.label);

  if (weightedSignals.length === 0) {
    return 'Keine klare technische Begruendung verfuegbar.';
  }

  return `${profile.label}: staerkste Treiber sind ${weightedSignals.join(' und ')}.`;
}

function buildSellRationale({
  sellProfile,
  trendScore,
  momentum20Score,
  momentum60Score,
  momentum120Score,
  rsiScore,
  breakdownScore,
}) {
  const weightedSignals = [
    { label: 'Abwaertstrend', weight: sellProfile.weights.trend || 0, score: trendScore },
    { label: 'Schwaches 1M-Momentum', weight: sellProfile.weights.momentum20 || 0, score: momentum20Score },
    { label: 'Schwaches 3M-Momentum', weight: sellProfile.weights.momentum60 || 0, score: momentum60Score },
    { label: 'Schwaches 6M-Momentum', weight: sellProfile.weights.momentum120 || 0, score: momentum120Score },
    { label: 'Bearishes RSI-Regime', weight: sellProfile.weights.rsi || 0, score: rsiScore },
    { label: 'Abstand zum 60T-Hoch', weight: sellProfile.weights.breakdown || 0, score: breakdownScore },
  ]
    .filter(item => item.weight > 0 && Number.isFinite(item.score))
    .map(item => ({
      ...item,
      contribution: item.weight * item.score,
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map(item => item.label);

  if (weightedSignals.length === 0) {
    return 'Keine klare technische Begruendung verfuegbar.';
  }

  return `Verkaufskandidat: staerkste Treiber sind ${weightedSignals.join(' und ')}.`;
}

function analyzeTechnicalSetup({ dates, closes, investmentDurationMonths }) {
  const profile = getInvestmentProfile(investmentDurationMonths);
  const sellProfile = SELL_PROFILES[profile.key] || SELL_PROFILES.medium;

  if (!Array.isArray(closes) || closes.length < MIN_REQUIRED_PRICE_POINTS) {
    return {
      ok: false,
      insufficientData: true,
      error: `Zu wenige Kursdaten fuer das Duration-Ranking (mindestens ${MIN_REQUIRED_PRICE_POINTS} Handelstage erforderlich).`,
      profileKey: profile.key,
      profileLabel: profile.label,
    };
  }

  const sma20Series = computeSMA(closes, 20);
  const sma50Series = computeSMA(closes, 50);
  const sma200Series = computeSMA(closes, 200);
  const rsi14Series = computeRSI(closes, 14);
  const lastIdx = closes.length - 1;
  const currentClose = closes[lastIdx];
  const sma20 = sma20Series[lastIdx];
  const sma50 = sma50Series[lastIdx];
  const sma200 = sma200Series[lastIdx];
  const previousSma200 = sma200Series[Math.max(lastIdx - 20, 0)];
  const rsi14 = rsi14Series[lastIdx];

  if ([currentClose, sma20, sma50, sma200, rsi14].some(value => !Number.isFinite(value))) {
    return {
      ok: false,
      insufficientData: true,
      error: 'Technische Kennzahlen konnten nicht vollstaendig berechnet werden.',
      profileKey: profile.key,
      profileLabel: profile.label,
    };
  }

  const momentum20Pct = getPercentChange(closes, 20);
  const momentum60Pct = getPercentChange(closes, 60);
  const momentum120Pct = getPercentChange(closes, 120);
  const annualizedVolatilityPct = computeAnnualizedVolatilityPct(closes, 20);
  const distanceTo60dHighPct = getDistanceToRecentHighPct(closes, 60);

  const trendScore = computeTrendScore({
    currentClose,
    sma20,
    sma50,
    sma200,
    previousSma200,
  });
  const momentum20Score = scaleToScore(momentum20Pct, -12, 18);
  const momentum60Score = scaleToScore(momentum60Pct, -18, 28);
  const momentum120Score = scaleToScore(momentum120Pct, -25, 40);
  const rsiScore = computeRsiScore(rsi14, profile);
  const breakoutScore = inverseScaleToScore(Math.abs(distanceTo60dHighPct), 0, 15);
  const volatilityScore = inverseScaleToScore(annualizedVolatilityPct, 15, 45);

  const sellTrendScore = computeBearishTrendScore({
    currentClose,
    sma20,
    sma50,
    sma200,
    previousSma200,
  });
  const sellMomentum20Score = inverseScaleToScore(momentum20Pct, -12, 18);
  const sellMomentum60Score = inverseScaleToScore(momentum60Pct, -18, 28);
  const sellMomentum120Score = inverseScaleToScore(momentum120Pct, -25, 40);
  const sellRsiScore = computeSellRsiScore(rsi14, sellProfile);
  const breakdownScore = scaleToScore(-distanceTo60dHighPct, 0, 20);
  const sellVolatilityScore = scaleToScore(annualizedVolatilityPct, 15, 55);

  const finalScore = round(
    ((profile.weights.trend || 0) * trendScore)
      + ((profile.weights.momentum20 || 0) * momentum20Score)
      + ((profile.weights.momentum60 || 0) * momentum60Score)
      + ((profile.weights.momentum120 || 0) * momentum120Score)
      + ((profile.weights.rsi || 0) * rsiScore)
      + ((profile.weights.breakout || 0) * breakoutScore)
      + ((profile.weights.volatility || 0) * volatilityScore),
    2
  );

  const sellScore = round(
    ((sellProfile.weights.trend || 0) * sellTrendScore)
      + ((sellProfile.weights.momentum20 || 0) * sellMomentum20Score)
      + ((sellProfile.weights.momentum60 || 0) * sellMomentum60Score)
      + ((sellProfile.weights.momentum120 || 0) * sellMomentum120Score)
      + ((sellProfile.weights.rsi || 0) * sellRsiScore)
      + ((sellProfile.weights.breakdown || 0) * breakdownScore)
      + ((sellProfile.weights.volatility || 0) * sellVolatilityScore),
    2
  );

  let outlook = 'Schwach';
  if (finalScore >= 75) {
    outlook = 'Stark';
  } else if (finalScore >= 60) {
    outlook = 'Positiv';
  } else if (finalScore >= 45) {
    outlook = 'Neutral';
  }

  let sellOutlook = 'Unauffaellig';
  if (sellScore >= 75) {
    sellOutlook = 'Akut';
  } else if (sellScore >= 60) {
    sellOutlook = 'Erhoeht';
  } else if (sellScore >= 45) {
    sellOutlook = 'Beobachten';
  }

  return {
    ok: true,
    insufficientData: false,
    profileKey: profile.key,
    profileLabel: profile.label,
    score: finalScore,
    buyScore: finalScore,
    sellScore,
    outlook,
    buyOutlook: outlook,
    sellOutlook,
    currentDate: dates[lastIdx],
    currentClose: round(currentClose, 4),
    sma20: round(sma20, 4),
    sma50: round(sma50, 4),
    sma200: round(sma200, 4),
    rsi14: round(rsi14, 2),
    trendScore,
    momentum20Pct: round(momentum20Pct, 2),
    momentum60Pct: round(momentum60Pct, 2),
    momentum120Pct: round(momentum120Pct, 2),
    momentum20Score,
    momentum60Score,
    momentum120Score,
    breakoutScore,
    volatilityScore,
    annualizedVolatilityPct: round(annualizedVolatilityPct, 2),
    distanceTo60dHighPct: round(distanceTo60dHighPct, 2),
    sellTrendScore,
    sellMomentum20Score,
    sellMomentum60Score,
    sellMomentum120Score,
    sellRsiScore,
    breakdownScore,
    sellVolatilityScore,
    rationale: buildRationale({
      profile,
      trendScore,
      momentum20Score,
      momentum60Score,
      momentum120Score,
      rsiScore,
      breakoutScore,
    }),
    sellRationale: buildSellRationale({
      sellProfile,
      trendScore: sellTrendScore,
      momentum20Score: sellMomentum20Score,
      momentum60Score: sellMomentum60Score,
      momentum120Score: sellMomentum120Score,
      rsiScore: sellRsiScore,
      breakdownScore,
    }),
  };
}

async function analyzeInstrumentForDuration(instrument, { bypassCache = false, investmentDurationMonths }) {
  try {
    const history = await getPriceHistory(instrument, bypassCache);
    const result = analyzeTechnicalSetup({
      dates: history.dates,
      closes: history.closes,
      investmentDurationMonths,
    });

    return {
      assetClass: instrument.assetClass || 'etf',
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

async function getTopRecommendations({
  bypassCache = false,
  providerFilter = 'all',
  assetClass: assetClassInput = 'etf',
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

  const successful = analyzed.filter(item => item.ok === true);
  const skipped = analyzed.filter(item => item.ok !== true);
  const buyRecommendations = successful
    .slice()
    .sort((a, b) => (b.buyScore ?? b.score ?? 0) - (a.buyScore ?? a.score ?? 0))
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      score: item.buyScore ?? item.score,
    }));

  const sellRecommendations = successful
    .slice()
    .sort((a, b) => (b.sellScore ?? 0) - (a.sellScore ?? 0))
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      score: item.sellScore,
    }));

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
};