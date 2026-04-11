/**
 * src/signals.js
 * Enthält Logik zur Signalerkennung auf Basis technischer Indikatoren.
 */

'use strict';

const { computeSMA } = require('./indicators');
const { getStartIdxForLookback } = require('./signalShared');
const { createDetectSmaCrossoverSignal } = require('./smaCrossoverSignal');

const detectSmaCrossoverSignal = createDetectSmaCrossoverSignal({
  computeSMA,
  getStartIdxForLookback,
});

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
