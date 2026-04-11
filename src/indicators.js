/**
 * src/indicators.js
 * Sammlung technischer Indikator-Funktionen.
 *
 * Aktuell enthalten:
 * - Simple Moving Average (SMA)
 *
 * Die Datei ist bewusst modular aufgebaut, damit spaeter z. B. EMA/RSI
 * im selben Stil ergaenzt werden koennen.
 */

'use strict';

/**
 * Berechnet einen Simple Moving Average (SMA) ueber eine Zahlenreihe.
 * Ergebnislaenge entspricht der Eingabelaenge.
 *
 * Fuer Indizes < (period - 1) wird null zurueckgegeben, weil dort
 * noch nicht genug Datenpunkte fuer einen vollstaendigen Durchschnitt vorliegen.
 *
 * @param {number[]} values
 * @param {number} period
 * @returns {(number|null)[]}
 */
function computeSMA(values, period) {
  const sma = new Array(values.length).fill(null);
  let rollingSum = 0;

  for (let i = 0; i < values.length; i++) {
    rollingSum += values[i];

    if (i >= period) {
      rollingSum -= values[i - period];
    }

    if (i >= period - 1) {
      sma[i] = rollingSum / period;
    }
  }

  return sma;
}

function computeRSI(values, period = 14) {
  const rsi = new Array(values.length).fill(null);

  if (!Array.isArray(values) || values.length <= period) {
    return rsi;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
      continue;
    }

    const rs = avgGain / avgLoss;
    rsi[i] = 100 - (100 / (1 + rs));
  }

  return rsi;
}

module.exports = { computeRSI, computeSMA };
