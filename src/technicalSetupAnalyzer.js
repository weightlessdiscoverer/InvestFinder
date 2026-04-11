'use strict';

const { computeRSI, computeSMA } = require('./indicators');
const { SELL_PROFILES, getInvestmentProfile } = require('./recommendationProfiles');
const {
  round,
  scaleToScore,
  inverseScaleToScore,
  getPercentChange,
  computeAnnualizedVolatilityPct,
  getDistanceToRecentHighPct,
  computeTrendScore,
  computeBearishTrendScore,
  computeRsiScore,
  computeSellRsiScore,
  deriveUnifiedRecommendation,
} = require('./recommendationScores');
const { buildRationale, buildSellRationale } = require('./recommendationRationale');

const MIN_REQUIRED_PRICE_POINTS = 220;
const STOP_LOSS_SEARCH_ITERATIONS = 18;

function analyzeTechnicalSetupCore({ dates, closes, investmentDurationMonths }) {
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

  const unifiedRecommendation = deriveUnifiedRecommendation({
    buyScore: finalScore,
    sellScore,
  });

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
    recommendation: unifiedRecommendation.recommendation,
    recommendationDelta: unifiedRecommendation.recommendationDelta,
    recommendationStrengthScore: unifiedRecommendation.recommendationStrengthScore,
    recommendationStrength: unifiedRecommendation.recommendationStrength,
    recommendationReason: unifiedRecommendation.recommendationReason,
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

function isSellRecommendationAtPrice({ dates, closes, investmentDurationMonths, candidatePrice }) {
  if (!Number.isFinite(candidatePrice) || candidatePrice < 0) {
    return false;
  }

  const adjustedCloses = closes.slice();
  adjustedCloses[adjustedCloses.length - 1] = candidatePrice;

  const result = analyzeTechnicalSetupCore({
    dates,
    closes: adjustedCloses,
    investmentDurationMonths,
  });

  return result.ok === true && result.recommendation === 'Sell';
}

function computeStopLossThreshold({ dates, closes, investmentDurationMonths, currentAnalysis }) {
  const currentClose = closes[closes.length - 1];
  if (!Number.isFinite(currentClose) || currentClose <= 0) {
    return null;
  }

  const analysis = currentAnalysis || analyzeTechnicalSetupCore({
    dates,
    closes,
    investmentDurationMonths,
  });
  if (analysis.ok !== true) {
    return null;
  }

  if (analysis.recommendation === 'Sell') {
    return round(currentClose, 4);
  }

  if (!isSellRecommendationAtPrice({
    dates,
    closes,
    investmentDurationMonths,
    candidatePrice: 0,
  })) {
    return null;
  }

  let low = 0;
  let high = currentClose;

  for (let i = 0; i < STOP_LOSS_SEARCH_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    if (isSellRecommendationAtPrice({
      dates,
      closes,
      investmentDurationMonths,
      candidatePrice: mid,
    })) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return round(low, 4);
}

function analyzeTechnicalSetup({ dates, closes, investmentDurationMonths }) {
  const analysis = analyzeTechnicalSetupCore({ dates, closes, investmentDurationMonths });
  if (analysis.ok !== true) {
    return analysis;
  }

  const stopLoss = computeStopLossThreshold({
    dates,
    closes,
    investmentDurationMonths,
    currentAnalysis: analysis,
  });

  return {
    ...analysis,
    stopLoss,
    stopLossBasis: stopLoss == null ? null : 'Sell-Schwelle',
  };
}

module.exports = {
  MIN_REQUIRED_PRICE_POINTS,
  analyzeTechnicalSetup,
  _internal: {
    analyzeTechnicalSetupCore,
    computeStopLossThreshold,
  },
};
