'use strict';

const DEFAULT_INVESTMENT_DURATION_MONTHS = 12;
const MIN_INVESTMENT_DURATION_MONTHS = 1;
const MAX_INVESTMENT_DURATION_MONTHS = 120;
const DEFAULT_RECOMMENDATION_LIMIT = 3;
const MAX_RECOMMENDATION_LIMIT = 10;

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

module.exports = {
  DEFAULT_INVESTMENT_DURATION_MONTHS,
  MIN_INVESTMENT_DURATION_MONTHS,
  MAX_INVESTMENT_DURATION_MONTHS,
  DEFAULT_RECOMMENDATION_LIMIT,
  MAX_RECOMMENDATION_LIMIT,
  PROFILES,
  SELL_PROFILES,
  normalizeInvestmentDurationMonths,
  normalizeRecommendationLimit,
  getInvestmentProfile,
};
