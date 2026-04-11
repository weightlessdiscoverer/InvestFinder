/**
 * src/signals.js
 * Enthält Logik zur Signalerkennung auf Basis technischer Indikatoren.
 */

'use strict';

const { computeSMA } = require('./indicators');

function getStartIdxForLookback(totalLength, minValidIdx, lookbackDays) {
  if (lookbackDays == null || lookbackDays <= 0) {
    return null;
  }
  return Math.max(minValidIdx, totalLength - lookbackDays - 1);
}

/**
 * Ermittelt einen Breakout von unten nach oben relativ zum SMA(N)
 * innerhalb eines optionalen Lookback-Zeitraums.
 *
 * Wenn lookbackDays nicht gesetzt: prueft nur Gestern vs. Heute
 * Wenn lookbackDays gesetzt: prueft alle Tage im Lookback-Zeitraum
 *
 * @param {{
 *   dates: string[],
 *   closes: number[],
 *   smaPeriod: number,
 *   lookbackDays?: number
 * }} input
 * @returns {object}
 */
function detectPriceBreakoutSignal({ dates, closes, smaPeriod, lookbackDays }) {
  const smaLabel = `SMA${smaPeriod}`;

  if (!Array.isArray(closes) || closes.length < smaPeriod + 1) {
    return {
      signal: false,
      insufficientData: true,
      error: `Zu wenige Kursdaten fuer ${smaLabel} (mindestens ${smaPeriod + 1} Handelstage erforderlich).`,
      smaPeriod,
      smaLabel,
      ...(lookbackDays && { lookbackDays }),
    };
  }

  const smaValues = computeSMA(closes, smaPeriod);

  if (lookbackDays == null || lookbackDays <= 0) {
    const todayIdx = closes.length - 1;
    const yesterdayIdx = closes.length - 2;

    const todayClose = closes[todayIdx];
    const yesterdayClose = closes[yesterdayIdx];
    const todaySMA = smaValues[todayIdx];
    const yesterdaySMA = smaValues[yesterdayIdx];

    if (todaySMA == null || yesterdaySMA == null) {
      return {
        signal: false,
        insufficientData: true,
        error: `Keine gueltigen SMA-Werte fuer ${smaLabel} verfuegbar.`,
        smaPeriod,
        smaLabel,
      };
    }

    const signal = yesterdayClose < yesterdaySMA && todayClose > todaySMA;
    const todaySpreadPct = ((todayClose - todaySMA) / todaySMA) * 100;
    const yesterdaySpreadPct = ((yesterdayClose - yesterdaySMA) / yesterdaySMA) * 100;
    const breakoutSteepnessPct = todaySpreadPct - yesterdaySpreadPct;

    return {
      signal,
      insufficientData: false,
      mode: 'price-breakout',
      smaPeriod,
      smaLabel,
      todayDate: dates[todayIdx],
      yesterdayDate: dates[yesterdayIdx],
      todayClose: +todayClose.toFixed(4),
      todaySMA: +todaySMA.toFixed(4),
      yesterdayClose: +yesterdayClose.toFixed(4),
      yesterdaySMA: +yesterdaySMA.toFixed(4),
      breakoutSteepnessPct: +breakoutSteepnessPct.toFixed(4),
    };
  }

  const startIdx = getStartIdxForLookback(closes.length, smaPeriod - 1, lookbackDays);
  let lastCrossingIdx = null;

  for (let i = startIdx; i < closes.length - 1; i++) {
    const prevClose = closes[i];
    const prevSMA = smaValues[i];
    const nextClose = closes[i + 1];
    const nextSMA = smaValues[i + 1];

    if (prevSMA != null && nextSMA != null && prevClose < prevSMA && nextClose > nextSMA) {
      lastCrossingIdx = i + 1;
    }
  }

  if (lastCrossingIdx == null) {
    return {
      signal: false,
      insufficientData: false,
      mode: 'price-breakout',
      smaPeriod,
      smaLabel,
      lookbackDays,
    };
  }

  const crossingClose = closes[lastCrossingIdx];
  const crossingSMA = smaValues[lastCrossingIdx];
  const crossingSpreadPct = ((crossingClose - crossingSMA) / crossingSMA) * 100;

  return {
    signal: true,
    insufficientData: false,
    mode: 'price-breakout',
    smaPeriod,
    smaLabel,
    lookbackDays,
    crossingDate: dates[lastCrossingIdx],
    todayDate: dates[closes.length - 1],
    todayClose: +closes[closes.length - 1].toFixed(4),
    todaySMA: +(smaValues[closes.length - 1] || 0).toFixed(4),
    breakoutDate: dates[lastCrossingIdx],
    breakoutClose: +crossingClose.toFixed(4),
    breakoutSMA: +crossingSMA.toFixed(4),
    breakoutSpreadPct: +crossingSpreadPct.toFixed(4),
  };
}

/**
 * Ermittelt SMA-Crossovers von unten nach oben:
 * SMA(fast) kreuzt SMA(slow) von unten nach oben.
 *
 * @param {{
 *   dates: string[],
 *   closes: number[],
 *   fastSmaPeriod: number,
 *   slowSmaPeriod: number,
 *   lookbackDays?: number
 * }} input
 * @returns {object}
 */
function detectSmaCrossoverSignal({ dates, closes, fastSmaPeriod, slowSmaPeriod, lookbackDays }) {
  const fastLabel = `SMA${fastSmaPeriod}`;
  const slowLabel = `SMA${slowSmaPeriod}`;
  const minRequired = Math.max(fastSmaPeriod, slowSmaPeriod) + 1;

  if (!Array.isArray(closes) || closes.length < minRequired) {
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

  const fastValues = computeSMA(closes, fastSmaPeriod);
  const slowValues = computeSMA(closes, slowSmaPeriod);

  const hasCrossUp = (prevFast, prevSlow, nextFast, nextSlow) => {
    return prevFast != null && prevSlow != null && nextFast != null && nextSlow != null && prevFast < prevSlow && nextFast > nextSlow;
  };

  const toSpreadPct = (fast, slow) => ((fast - slow) / slow) * 100;

  if (lookbackDays == null || lookbackDays <= 0) {
    const todayIdx = closes.length - 1;
    const yesterdayIdx = closes.length - 2;

    const todayFast = fastValues[todayIdx];
    const todaySlow = slowValues[todayIdx];
    const yesterdayFast = fastValues[yesterdayIdx];
    const yesterdaySlow = slowValues[yesterdayIdx];

    if (todayFast == null || todaySlow == null || yesterdayFast == null || yesterdaySlow == null) {
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

    const signal = hasCrossUp(yesterdayFast, yesterdaySlow, todayFast, todaySlow);
    const todaySpreadPct = toSpreadPct(todayFast, todaySlow);
    const yesterdaySpreadPct = toSpreadPct(yesterdayFast, yesterdaySlow);

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
      crossoverSteepnessPct: +(todaySpreadPct - yesterdaySpreadPct).toFixed(4),
      todaySMA: +todaySlow.toFixed(4),
      breakoutSteepnessPct: +(todaySpreadPct - yesterdaySpreadPct).toFixed(4),
    };
  }

  const minValidIdx = Math.max(fastSmaPeriod, slowSmaPeriod) - 1;
  const startIdx = getStartIdxForLookback(closes.length, minValidIdx, lookbackDays);
  let lastCrossingIdx = null;

  for (let i = startIdx; i < closes.length - 1; i++) {
    if (hasCrossUp(fastValues[i], slowValues[i], fastValues[i + 1], slowValues[i + 1])) {
      lastCrossingIdx = i + 1;
    }
  }

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
}

/**
 * Rueckwaertskompatibler Wrapper:
 * - Default: price-breakout
 * - Bei gesetztem fastSmaPeriod + slowSmaPeriod: sma-crossover
 */
function detectBreakoutSignal(input) {
  if (input && input.fastSmaPeriod != null && input.slowSmaPeriod != null) {
    return detectSmaCrossoverSignal(input);
  }
  return detectPriceBreakoutSignal(input);
}

module.exports = {
  detectBreakoutSignal,
  detectPriceBreakoutSignal,
  detectSmaCrossoverSignal,
  _internal: {
    getStartIdxForLookback,
  },
};
