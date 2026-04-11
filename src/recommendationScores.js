'use strict';

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

function getStrengthLabel(strengthScore) {
  if (strengthScore >= 75) return 'Sehr stark';
  if (strengthScore >= 55) return 'Stark';
  if (strengthScore >= 35) return 'Mittel';
  return 'Schwach';
}

function deriveUnifiedRecommendation({ buyScore, sellScore }) {
  const safeBuy = Number.isFinite(buyScore) ? buyScore : 0;
  const safeSell = Number.isFinite(sellScore) ? sellScore : 0;
  const delta = round(safeBuy - safeSell, 2);
  const conviction = Math.abs(delta);

  let recommendation = 'Hold';
  let recommendationReason = 'Buy- und Sell-Signal sind weitgehend ausgeglichen.';
  if (delta >= 12) {
    recommendation = 'Buy';
    recommendationReason = 'Buy-Signal ueberwiegt das Sell-Signal deutlich.';
  } else if (delta <= -12) {
    recommendation = 'Sell';
    recommendationReason = 'Sell-Signal ueberwiegt das Buy-Signal deutlich.';
  }

  const primaryScore = recommendation === 'Sell' ? safeSell : safeBuy;
  const strengthScore = round(clamp((conviction * 0.65) + (primaryScore * 0.35), 0, 100), 2);

  return {
    recommendation,
    recommendationDelta: delta,
    recommendationStrengthScore: strengthScore,
    recommendationStrength: getStrengthLabel(strengthScore),
    recommendationReason,
  };
}

module.exports = {
  clamp,
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
};
