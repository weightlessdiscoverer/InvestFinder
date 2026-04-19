'use strict';

const DEFAULT_SMA_PERIOD = 200;
const MIN_SMA_PERIOD = 2;
const MAX_SMA_PERIOD = 400;
const DEFAULT_FAST_SMA_PERIOD = 50;
const DEFAULT_SLOW_SMA_PERIOD = 200;
const DEFAULT_LOOKBACK_DAYS = 0;
const MAX_LOOKBACK_DAYS = 365;
const DEFAULT_PERFORMANCE_DAYS = 0;
const MAX_PERFORMANCE_DAYS = 250;
const MAX_PERFORMANCE_PCT = 1000;

function normalizeSmaPeriod(smaPeriodInput) {
  if (smaPeriodInput == null || smaPeriodInput === '') {
    return DEFAULT_SMA_PERIOD;
  }

  const parsed = Number(smaPeriodInput);
  if (!Number.isInteger(parsed) || parsed < MIN_SMA_PERIOD) {
    throw new Error(`Ungueltige SMA-Periode. Bitte eine ganze Zahl >= ${MIN_SMA_PERIOD} angeben.`);
  }

  if (parsed > MAX_SMA_PERIOD) {
    throw new Error(
      `SMA-Periode ${parsed} ist zu gross. Maximal erlaubt: ${MAX_SMA_PERIOD}.`
    );
  }

  return parsed;
}

function normalizeOptionalSmaPeriod(periodInput, fieldLabel) {
  if (periodInput == null || periodInput === '') {
    return null;
  }

  try {
    return normalizeSmaPeriod(periodInput);
  } catch (err) {
    throw new Error(`${fieldLabel}: ${err.message}`);
  }
}

function normalizeSignalConfig({ smaPeriodInput, fastSmaPeriodInput, slowSmaPeriodInput }) {
  const fastSmaPeriod = normalizeOptionalSmaPeriod(fastSmaPeriodInput, 'Fast-SMA');
  const slowSmaPeriod = normalizeOptionalSmaPeriod(slowSmaPeriodInput, 'Slow-SMA');

  const hasFast = fastSmaPeriod != null;
  const hasSlow = slowSmaPeriod != null;

  if (hasFast !== hasSlow) {
    throw new Error('Fuer SMA-Crossover muessen Fast-SMA und Slow-SMA gemeinsam gesetzt werden.');
  }

  if (hasFast && hasSlow) {
    if (fastSmaPeriod === slowSmaPeriod) {
      throw new Error('Fast-SMA und Slow-SMA muessen unterschiedlich sein.');
    }

    return {
      mode: 'sma-crossover',
      fastSmaPeriod,
      slowSmaPeriod,
      fastSmaLabel: `SMA${fastSmaPeriod}`,
      slowSmaLabel: `SMA${slowSmaPeriod}`,
    };
  }

  const smaPeriod = normalizeSmaPeriod(smaPeriodInput);
  return {
    mode: 'price-breakout',
    smaPeriod,
    smaLabel: `SMA${smaPeriod}`,
  };
}

function normalizeLookbackDays(lookbackDaysInput) {
  if (lookbackDaysInput == null || lookbackDaysInput === '') {
    return DEFAULT_LOOKBACK_DAYS;
  }

  const parsed = Number(lookbackDaysInput);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Ungueltige Lookback-Periode. Bitte eine ganze Zahl >= 0 angeben.');
  }

  if (parsed > MAX_LOOKBACK_DAYS) {
    throw new Error(
      `Lookback-Periode ${parsed} ist zu gross. Maximal erlaubt: ${MAX_LOOKBACK_DAYS} Tage.`
    );
  }

  return parsed;
}

function normalizePerformanceDays(daysInput) {
  if (daysInput == null || daysInput === '') {
    return 0;
  }

  const parsed = Number(daysInput);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Ungueltige Performance-Tage. Bitte eine ganze Zahl >= 0 angeben.');
  }

  if (parsed > MAX_PERFORMANCE_DAYS) {
    throw new Error(`Performance-Tage ${parsed} ist zu gross. Maximal erlaubt: ${MAX_PERFORMANCE_DAYS}.`);
  }

  return parsed;
}

function normalizeMinPerformancePct(pctInput) {
  if (pctInput == null || pctInput === '') {
    return null;
  }

  const parsed = Number(pctInput);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error('Ungueltige Mindestperformance. Bitte einen Wert >= 0 angeben.');
  }

  if (parsed > MAX_PERFORMANCE_PCT) {
    throw new Error(`Mindestperformance ${parsed} % ist zu hoch. Maximal erlaubt: ${MAX_PERFORMANCE_PCT} %.`);
  }

  return parsed;
}

module.exports = {
  DEFAULT_SMA_PERIOD,
  MIN_SMA_PERIOD,
  MAX_SMA_PERIOD,
  DEFAULT_FAST_SMA_PERIOD,
  DEFAULT_SLOW_SMA_PERIOD,
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
  DEFAULT_PERFORMANCE_DAYS,
  MAX_PERFORMANCE_DAYS,
  MAX_PERFORMANCE_PCT,
  normalizeSmaPeriod,
  normalizeSignalConfig,
  normalizeLookbackDays,
  normalizePerformanceDays,
  normalizeMinPerformancePct,
};
