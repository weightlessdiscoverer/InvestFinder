'use strict';

/**
 * src/backtest.js
 *
 * Out-of-Sample-Backtest fuer das Empfehlungsmodell.
 *
 * Fuer jeden Titel im Universum wird die Kurshistorie in Fenster aufgeteilt:
 *   - Signalzeitpunkt t: MIN_REQUIRED_PRICE_POINTS <= t < closes.length - forwardDays
 *   - Vorwaertsrendite: (closes[t + forwardDays] / closes[t]) - 1
 *
 * Aggregierte Metriken:
 *   - Durchschnittliche Vorwaertsrendite je Signal (Buy / Hold / Sell)
 *   - Hit-Rate je Signal (Anteil positiver Renditen)
 *   - Spearman-Rangkorrelation (IC) zwischen buyScore und Vorwaertsrendite
 *   - Differenz zwischen Buy- und Sell-Rendite als Trennschaerfe
 *
 * Um Autokorrelation durch ueberlappende Fenster zu daempfen, wird nur
 * jeder fuenfte Handelstag als Signalzeitpunkt ausgewertet.
 */

const { getTickerHistory } = require('./yahooHistoryStore');
const { getEtfUniverse, normalizeAssetClass, normalizeProviderFilter } = require('./etfUniverseService');
const { MIN_REQUIRED_PRICE_POINTS, _internal: { analyzeTechnicalSetupCore } } = require('./technicalSetupAnalyzer');
const { getInvestmentProfile, PROFILES } = require('./recommendationProfiles');
const { round } = require('./recommendationScores');

const TRADING_DAYS_PER_MONTH = 21;
const SIGNAL_STRIDE = 5;

const PROFILE_KEYS = Object.keys(PROFILES);

/**
 * Berechnet den Spearman-Rangkorrelationskoeffizient.
 * Gibt null zurueck wenn weniger als 4 Paare vorhanden sind.
 *
 * @param {number[]} xArr
 * @param {number[]} yArr
 * @returns {number|null}
 */
function spearmanRankCorrelation(xArr, yArr) {
  const n = xArr.length;
  if (n < 4) return null;

  const rank = (arr) => {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    for (let i = 0; i < n; i++) {
      ranks[indexed[i].i] = i + 1;
    }
    return ranks;
  };

  const rx = rank(xArr);
  const ry = rank(yArr);
  const meanR = (n + 1) / 2;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const dA = rx[i] - meanR;
    const dB = ry[i] - meanR;
    num += dA * dB;
    denA += dA * dA;
    denB += dB * dB;
  }

  if (denA === 0 || denB === 0) return null;
  return num / Math.sqrt(denA * denB);
}

/**
 * Fuehrt den Backtest fuer eine einzelne Preishistorie durch.
 *
 * @param {{ dates: string[], closes: number[], investmentDurationMonths: number }} params
 * @returns {{ date: string, buyScore: number, sellScore: number, recommendation: string, forwardReturn: number }[]}
 */
function runBacktestForSeries({ dates, closes, investmentDurationMonths }) {
  const forwardDays = Math.round(investmentDurationMonths * TRADING_DAYS_PER_MONTH);
  const eligible = closes.length - forwardDays;

  if (eligible <= MIN_REQUIRED_PRICE_POINTS) {
    return [];
  }

  const results = [];

  for (let t = MIN_REQUIRED_PRICE_POINTS; t < eligible; t += SIGNAL_STRIDE) {
    const slicedDates = dates.slice(0, t + 1);
    const slicedCloses = closes.slice(0, t + 1);

    const analysis = analyzeTechnicalSetupCore({
      dates: slicedDates,
      closes: slicedCloses,
      investmentDurationMonths,
    });

    if (!analysis.ok) continue;

    const entryPrice = closes[t];
    const exitPrice = closes[t + forwardDays];

    if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || entryPrice <= 0) {
      continue;
    }

    results.push({
      date: dates[t],
      buyScore: analysis.buyScore,
      sellScore: analysis.sellScore,
      recommendation: analysis.recommendation,
      forwardReturn: (exitPrice / entryPrice) - 1,
    });
  }

  return results;
}

/**
 * Bildet Kennzahlen aus einer Liste von Backtest-Ergebnissen.
 *
 * @param {{ date: string, buyScore: number, sellScore: number, recommendation: string, forwardReturn: number }[]} allResults
 * @param {number} forwardDays
 * @returns {object|null}
 */
function aggregateBacktestResults(allResults, forwardDays) {
  if (allResults.length < 2) return null;

  const bySignal = { Buy: [], Hold: [], Sell: [] };
  const buyScores = [];
  const forwardReturns = [];

  for (const r of allResults) {
    const bucket = bySignal[r.recommendation];
    if (bucket) bucket.push(r.forwardReturn);
    buyScores.push(r.buyScore);
    forwardReturns.push(r.forwardReturn);
  }

  const summarize = (returns) => {
    if (returns.length === 0) return null;
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const annualized = forwardDays > 0 ? (Math.pow(1 + avg, 252 / forwardDays) - 1) : avg;
    const hitRate = returns.filter(r => r > 0).length / returns.length;
    return {
      count: returns.length,
      avgForwardReturnPct: round(avg * 100, 2),
      annualizedReturnPct: round(annualized * 100, 2),
      hitRatePct: round(hitRate * 100, 1),
    };
  };

  const ic = spearmanRankCorrelation(buyScores, forwardReturns);

  const buyAvg = bySignal.Buy.length > 0
    ? bySignal.Buy.reduce((a, b) => a + b, 0) / bySignal.Buy.length
    : null;
  const sellAvg = bySignal.Sell.length > 0
    ? bySignal.Sell.reduce((a, b) => a + b, 0) / bySignal.Sell.length
    : null;

  const separationPct = (buyAvg != null && sellAvg != null)
    ? round((buyAvg - sellAvg) * 100, 2)
    : null;

  return {
    sampleSize: allResults.length,
    infoCoefficient: ic != null ? round(ic, 3) : null,
    icInterpretation: interpretIC(ic),
    separationPct,
    separationInterpretation: interpretSeparation(separationPct),
    bySignal: {
      Buy: summarize(bySignal.Buy),
      Hold: summarize(bySignal.Hold),
      Sell: summarize(bySignal.Sell),
    },
  };
}

function interpretIC(ic) {
  if (ic == null) return 'Zu wenig Daten';
  const abs = Math.abs(ic);
  if (abs >= 0.1) return 'Bedeutsam';
  if (abs >= 0.05) return 'Schwach';
  return 'Kein Zusammenhang';
}

function interpretSeparation(sepPct) {
  if (sepPct == null) return 'Nicht messbar';
  if (sepPct >= 4) return 'Klare Trennschaerfe';
  if (sepPct >= 1) return 'Leichte Trennschaerfe';
  return 'Keine Trennschaerfe';
}

/**
 * Fuehrt den Out-of-Sample-Backtest fuer ein gesamtes Instrument-Universum durch.
 *
 * @param {{ assetClass?: string, providerFilter?: string, investmentDurationMonths: number }} params
 * @returns {Promise<object>}
 */
async function runUniverseBacktest({ assetClass = 'etf', providerFilter = 'all', investmentDurationMonths }) {
  const normalizedAssetClass = normalizeAssetClass(assetClass);
  const normalizedProvider = normalizeProviderFilter(providerFilter);
  const profile = getInvestmentProfile(investmentDurationMonths);
  const forwardDays = Math.round(investmentDurationMonths * TRADING_DAYS_PER_MONTH);
  const minRequired = MIN_REQUIRED_PRICE_POINTS + forwardDays + SIGNAL_STRIDE;

  const universe = await getEtfUniverse({
    providerFilter: normalizedProvider,
    assetClass: normalizedAssetClass,
    bypassCache: false,
  });

  const allResults = [];
  let instrumentsAnalyzed = 0;
  let instrumentsSkipped = 0;

  for (const instrument of universe) {
    const history = await getTickerHistory(instrument.ticker);

    if (!history || !Array.isArray(history.dates) || history.dates.length < minRequired) {
      instrumentsSkipped++;
      continue;
    }

    const results = runBacktestForSeries({
      dates: history.dates,
      closes: history.closes,
      investmentDurationMonths,
    });

    allResults.push(...results);
    instrumentsAnalyzed++;
  }

  return {
    assetClass: normalizedAssetClass,
    providerFilter: normalizedProvider,
    investmentDurationMonths,
    forwardDays,
    profileKey: profile.key,
    profileLabel: profile.label,
    instrumentsAnalyzed,
    instrumentsSkipped,
    ...aggregateBacktestResults(allResults, forwardDays),
  };
}

/**
 * Fuehrt den Backtest fuer alle drei Profile (short / medium / long) durch.
 * Nutzt die kuerzeren Horizonte, wo weniger Daten verfuegbar sind.
 *
 * @param {{ assetClass?: string, providerFilter?: string }} params
 * @returns {Promise<{ profiles: object, runAt: string }>}
 */
async function runFullBacktest({ assetClass = 'etf', providerFilter = 'all' } = {}) {
  const HORIZON_MONTHS = { short: 3, medium: 6, long: 12 };
  const profiles = {};

  for (const key of PROFILE_KEYS) {
    const months = HORIZON_MONTHS[key];
    profiles[key] = await runUniverseBacktest({
      assetClass,
      providerFilter,
      investmentDurationMonths: months,
    });
  }

  return {
    profiles,
    runAt: new Date().toISOString(),
  };
}

module.exports = {
  runFullBacktest,
  runUniverseBacktest,
  _internal: {
    runBacktestForSeries,
    aggregateBacktestResults,
    spearmanRankCorrelation,
    interpretIC,
    interpretSeparation,
  },
};
