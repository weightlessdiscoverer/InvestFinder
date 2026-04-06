/**
 * src/signals.js
 * Enthält Logik zur Signalerkennung auf Basis technischer Indikatoren.
 */

'use strict';

const { computeSMA } = require('./indicators');

/**
 * Ermittelt einen Breakout von unten nach oben relativ zum SMA(N):
 * - gestriger Schlusskurs < gestriger SMA(N)
 * - heutiger Schlusskurs > heutiger SMA(N)
 *
 * @param {{ dates: string[], closes: number[], smaPeriod: number }} input
 * @returns {{
 *   signal: boolean,
 *   insufficientData: boolean,
 *   error?: string,
 *   smaPeriod: number,
 *   smaLabel: string,
 *   todayDate?: string,
 *   yesterdayDate?: string,
 *   todayClose?: number,
 *   todaySMA?: number,
 *   yesterdayClose?: number,
 *   yesterdaySMA?: number,
 *   breakoutSteepnessPct?: number,
 * }}
 */
function detectBreakoutSignal({ dates, closes, smaPeriod }) {
  const smaLabel = `SMA${smaPeriod}`;

  // Fuer zwei aufeinanderfolgende Vergleiche werden mindestens N+1 Werte benoetigt.
  if (!Array.isArray(closes) || closes.length < smaPeriod + 1) {
    return {
      signal: false,
      insufficientData: true,
      error: `Zu wenige Kursdaten fuer ${smaLabel} (mindestens ${smaPeriod + 1} Handelstage erforderlich).`,
      smaPeriod,
      smaLabel,
    };
  }

  const smaValues = computeSMA(closes, smaPeriod);
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

module.exports = { detectBreakoutSignal };
