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

module.exports = { computeSMA };
