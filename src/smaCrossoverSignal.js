'use strict';

function hasCrossUp(prevFast, prevSlow, nextFast, nextSlow) {
  return prevFast != null
    && prevSlow != null
    && nextFast != null
    && nextSlow != null
    && prevFast < prevSlow
    && nextFast > nextSlow;
}

function toSpreadPct(fast, slow) {
  return ((fast - slow) / slow) * 100;
}

function buildInsufficientDataResponse({ fastSmaPeriod, slowSmaPeriod, fastLabel, slowLabel, minRequired, lookbackDays }) {
  return {
    signal: false,
    insufficientData: true,
    error: `Zu wenige Kursdaten fuer ${fastLabel}/${slowLabel} (mindestens ${minRequired} Handelstage erforderlich).`,
    mode: 'sma-crossover',
    fastSmaPeriod,
    slowSmaPeriod,
    fastSmaLabel: fastLabel,
    slowSmaLabel: slowLabel,
    ...(lookbackDays && { lookbackDays }),
  };
}

function buildMissingSmaResponse({ fastSmaPeriod, slowSmaPeriod, fastLabel, slowLabel }) {
  return {
    signal: false,
    insufficientData: true,
    error: `Keine gueltigen SMA-Werte fuer ${fastLabel}/${slowLabel} verfuegbar.`,
    mode: 'sma-crossover',
    fastSmaPeriod,
    slowSmaPeriod,
    fastSmaLabel: fastLabel,
    slowSmaLabel: slowLabel,
  };
}

function buildNoLookbackResponse({ dates, fastValues, slowValues, fastSmaPeriod, slowSmaPeriod, fastLabel, slowLabel }) {
  const todayIdx = dates.length - 1;
  const yesterdayIdx = dates.length - 2;

  const todayFast = fastValues[todayIdx];
  const todaySlow = slowValues[todayIdx];
  const yesterdayFast = fastValues[yesterdayIdx];
  const yesterdaySlow = slowValues[yesterdayIdx];

  if (todayFast == null || todaySlow == null || yesterdayFast == null || yesterdaySlow == null) {
    return buildMissingSmaResponse({ fastSmaPeriod, slowSmaPeriod, fastLabel, slowLabel });
  }

  const signal = hasCrossUp(yesterdayFast, yesterdaySlow, todayFast, todaySlow);
  const todaySpreadPct = toSpreadPct(todayFast, todaySlow);
  const yesterdaySpreadPct = toSpreadPct(yesterdayFast, yesterdaySlow);
  const steepness = +(todaySpreadPct - yesterdaySpreadPct).toFixed(4);

  return {
    signal,
    insufficientData: false,
    mode: 'sma-crossover',
    fastSmaPeriod,
    slowSmaPeriod,
    fastSmaLabel: fastLabel,
    slowSmaLabel: slowLabel,
    todayDate: dates[todayIdx],
    yesterdayDate: dates[yesterdayIdx],
    todayFastSMA: +todayFast.toFixed(4),
    todaySlowSMA: +todaySlow.toFixed(4),
    yesterdayFastSMA: +yesterdayFast.toFixed(4),
    yesterdaySlowSMA: +yesterdaySlow.toFixed(4),
    crossoverSteepnessPct: steepness,
    todaySMA: +todaySlow.toFixed(4),
    breakoutSteepnessPct: steepness,
  };
}

function findLastCrossoverIndex({
  fastValues,
  slowValues,
  closesLength,
  minValidIdx,
  lookbackDays,
  getStartIdxForLookback,
}) {
  const startIdx = getStartIdxForLookback(closesLength, minValidIdx, lookbackDays);
  let lastCrossingIdx = null;

  for (let i = startIdx; i < closesLength - 1; i += 1) {
    if (hasCrossUp(fastValues[i], slowValues[i], fastValues[i + 1], slowValues[i + 1])) {
      lastCrossingIdx = i + 1;
    }
  }

  return lastCrossingIdx;
}

function createDetectSmaCrossoverSignal({ computeSMA, getStartIdxForLookback }) {
  return function detectSmaCrossoverSignal({ dates, closes, fastSmaPeriod, slowSmaPeriod, lookbackDays }) {
    const fastLabel = `SMA${fastSmaPeriod}`;
    const slowLabel = `SMA${slowSmaPeriod}`;
    const minRequired = Math.max(fastSmaPeriod, slowSmaPeriod) + 1;

    if (!Array.isArray(closes) || closes.length < minRequired) {
      return buildInsufficientDataResponse({
        fastSmaPeriod,
        slowSmaPeriod,
        fastLabel,
        slowLabel,
        minRequired,
        lookbackDays,
      });
    }

    const fastValues = computeSMA(closes, fastSmaPeriod);
    const slowValues = computeSMA(closes, slowSmaPeriod);

    if (lookbackDays == null || lookbackDays <= 0) {
      return buildNoLookbackResponse({
        dates,
        fastValues,
        slowValues,
        fastSmaPeriod,
        slowSmaPeriod,
        fastLabel,
        slowLabel,
      });
    }

    const minValidIdx = Math.max(fastSmaPeriod, slowSmaPeriod) - 1;
    const lastCrossingIdx = findLastCrossoverIndex({
      fastValues,
      slowValues,
      closesLength: closes.length,
      minValidIdx,
      lookbackDays,
      getStartIdxForLookback,
    });

    if (lastCrossingIdx == null) {
      return {
        signal: false,
        insufficientData: false,
        mode: 'sma-crossover',
        fastSmaPeriod,
        slowSmaPeriod,
        fastSmaLabel: fastLabel,
        slowSmaLabel: slowLabel,
        lookbackDays,
      };
    }

    const crossoverFast = fastValues[lastCrossingIdx];
    const crossoverSlow = slowValues[lastCrossingIdx];

    return {
      signal: true,
      insufficientData: false,
      mode: 'sma-crossover',
      fastSmaPeriod,
      slowSmaPeriod,
      fastSmaLabel: fastLabel,
      slowSmaLabel: slowLabel,
      lookbackDays,
      crossingDate: dates[lastCrossingIdx],
      breakoutDate: dates[lastCrossingIdx],
      crossoverDate: dates[lastCrossingIdx],
      crossoverFastSMA: +crossoverFast.toFixed(4),
      crossoverSlowSMA: +crossoverSlow.toFixed(4),
      crossoverSpreadPct: +toSpreadPct(crossoverFast, crossoverSlow).toFixed(4),
      todayDate: dates[closes.length - 1],
      todayFastSMA: +(fastValues[closes.length - 1] || 0).toFixed(4),
      todaySlowSMA: +(slowValues[closes.length - 1] || 0).toFixed(4),
      todaySMA: +(slowValues[closes.length - 1] || 0).toFixed(4),
    };
  };
}

module.exports = {
  createDetectSmaCrossoverSignal,
};
