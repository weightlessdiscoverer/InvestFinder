/**
 * app.js  –  Frontend logic for the InvestFinder Multi-Provider ETF Scanner.
 *
 * Responsibilities:
 *  - Handle "Scan starten" button click
 *  - Handle SMA and provider filter input
 *  - Call the backend API (/api/scan)
 *  - Show / hide loading indicator
 *  - Render results table and error list
 */

'use strict';

/* ── DOM references ─────────────────────────────────────────────────────── */
const btnScan = document.getElementById('btnScan');
const assetClassFilter = document.getElementById('assetClassFilter');
const signalModeSelect = document.getElementById('signalMode');
const smaPeriodInput = document.getElementById('smaPeriodInput');
const fastSmaPeriodInput = document.getElementById('fastSmaPeriodInput');
const slowSmaPeriodInput = document.getElementById('slowSmaPeriodInput');
const lookbackWeeksInput = document.getElementById('lookbackWeeksInput');
const providerFilter = document.getElementById('providerFilter');
const chkShowErrors = document.getElementById('chkShowErrors');
const maxAboveSmaPctInput = document.getElementById('maxAboveSmaPctInput');
const etfCountEl = document.getElementById('etfCount');
const assetHintLabel = document.getElementById('assetHintLabel');
const selectedSmaLabel = document.getElementById('selectedSmaLabel');
const loadingSection = document.getElementById('loadingSection');
const loadingStatus = document.getElementById('loadingStatus');
const errorBanner = document.getElementById('errorBanner');
const errorMessage = document.getElementById('errorMessage');
const summaryBar = document.getElementById('summaryBar');
const sumScanned = document.getElementById('sumScanned');
const sumMatches = document.getElementById('sumMatches');
const sumSma = document.getElementById('sumSma');
const sumErrors = document.getElementById('sumErrors');
const sumTime = document.getElementById('sumTime');
const resultsSection = document.getElementById('resultsSection');
const resultsBody = document.getElementById('resultsBody');
const noMatches = document.getElementById('noMatches');
const matchBadge = document.getElementById('matchBadge');
const resultsTitleLabel = document.getElementById('resultsTitleLabel');
const thSmaValue = document.getElementById('thSmaValue');
const errorsSection = document.getElementById('errorsSection');
const errorsBody = document.getElementById('errorsBody');
const errorBadge = document.getElementById('errorBadge');
const errorsTitleLabel = document.getElementById('errorsTitleLabel');
const syncStatusSection = document.getElementById('syncStatusSection');
const syncStateBadge = document.getElementById('syncStateBadge');
const syncProcessed = document.getElementById('syncProcessed');
const syncRateHits = document.getElementById('syncRateHits');
const syncCooldown = document.getElementById('syncCooldown');
const syncLastTicker = document.getElementById('syncLastTicker');
const syncTickerCount = document.getElementById('syncTickerCount');
const syncOldestUpdate = document.getElementById('syncOldestUpdate');
const syncFreshness = document.getElementById('syncFreshness');
const syncStatusNote = document.getElementById('syncStatusNote');
const tabMainBtn = document.getElementById('tabMainBtn');
const tabDurationBtn = document.getElementById('tabDurationBtn');
const tabDbBtn = document.getElementById('tabDbBtn');
const tabMainContent = document.getElementById('tabMainContent');
const tabDurationContent = document.getElementById('tabDurationContent');
const tabDbContent = document.getElementById('tabDbContent');
const durationAssetClassFilter = document.getElementById('durationAssetClassFilter');
const investmentDurationMonthsInput = document.getElementById('investmentDurationMonthsInput');
const btnRecommend = document.getElementById('btnRecommend');
const durationAssetHintLabel = document.getElementById('durationAssetHintLabel');
const recommendationLoadingSection = document.getElementById('recommendationLoadingSection');
const recommendationLoadingStatus = document.getElementById('recommendationLoadingStatus');
const recommendationErrorBanner = document.getElementById('recommendationErrorBanner');
const recommendationErrorMessage = document.getElementById('recommendationErrorMessage');
const recommendationSummaryBar = document.getElementById('recommendationSummaryBar');
const recSumAnalyzed = document.getElementById('recSumAnalyzed');
const recSumBestScore = document.getElementById('recSumBestScore');
const recSumProfile = document.getElementById('recSumProfile');
const recSumSkipped = document.getElementById('recSumSkipped');
const recSumTime = document.getElementById('recSumTime');
const recommendationSection = document.getElementById('recommendationSection');
const recommendationTitleLabel = document.getElementById('recommendationTitleLabel');
const allRecommendationTitleLabel = document.getElementById('allRecommendationTitleLabel');
const allRecommendationBadge = document.getElementById('allRecommendationBadge');
const allRecommendationBody = document.getElementById('allRecommendationBody');
const allRecommendationEmpty = document.getElementById('allRecommendationEmpty');
const allRecommendationTable = allRecommendationBody.closest('table');
const criteriaProfileName = document.getElementById('criteriaProfileName');
const criteriaDurationRange = document.getElementById('criteriaDurationRange');
const criteriaFormula = document.getElementById('criteriaFormula');
const criteriaTrendText = document.getElementById('criteriaTrendText');
const criteriaMomentumText = document.getElementById('criteriaMomentumText');
const criteriaRsiText = document.getElementById('criteriaRsiText');
const criteriaBreakoutText = document.getElementById('criteriaBreakoutText');
const criteriaVolatilityText = document.getElementById('criteriaVolatilityText');
const criteriaShortCard = document.getElementById('criteriaShortCard');
const criteriaMediumCard = document.getElementById('criteriaMediumCard');
const criteriaLongCard = document.getElementById('criteriaLongCard');
const dbEtfSection = document.getElementById('dbEtfSection');
const dbSectionTitleLabel = document.getElementById('dbSectionTitleLabel');
const dbEtfBadge = document.getElementById('dbEtfBadge');
const dbFreshnessBadge = document.getElementById('dbFreshnessBadge');
const dbEtfBody = document.getElementById('dbEtfBody');
const dbEtfEmpty = document.getElementById('dbEtfEmpty');
const dbAssetClassFilter = document.getElementById('dbAssetClassFilter');

const MIN_SMA_PERIOD = 2;
const MAX_SMA_PERIOD = 400;
const DEFAULT_SMA_PERIOD = 200;
const MIN_LOOKBACK_WEEKS = 0;
const MAX_LOOKBACK_WEEKS = 52;
const DEFAULT_LOOKBACK_WEEKS = 0;
const MIN_INVESTMENT_DURATION_MONTHS = 1;
const MAX_INVESTMENT_DURATION_MONTHS = 120;
const DEFAULT_INVESTMENT_DURATION_MONTHS = 12;
const ALLOWED_ASSET_CLASSES = new Set(['etf', 'dax40']);
const ALLOWED_PROVIDER_FILTERS = new Set(['all', 'ishares', 'xtrackers']);
const RECOMMENDATION_PROFILES = {
  short: {
    rangeLabel: '1 bis 3 Monate',
    profileLabel: 'Kurzfristig',
    formula: '20% Trend + 30% 1M-Momentum + 15% 3M-Momentum + 20% RSI + 10% Hoch-Naehe + 5% Volatilitaet',
    momentumText: '1-Monats-Momentum ist der staerkste Faktor. 3-Monats-Momentum fliesst als Bestaetigung ein, 6 Monate werden nicht gewichtet.',
    rsiText: 'RSI14 wird auf ein Momentum-Ziel von 62 bewertet. Zu heiss ueber 75 und zu schwach unter 40 wird zusaetzlich abgestraft.',
  },
  medium: {
    rangeLabel: '4 bis 12 Monate',
    profileLabel: 'Mittelfristig',
    formula: '30% Trend + 10% 1M-Momentum + 25% 3M-Momentum + 10% RSI + 10% Hoch-Naehe + 15% Volatilitaet',
    momentumText: '3-Monats-Momentum ist der wichtigste Bewegungsfaktor. 1 Monat dient nur als kurzfristige Feinjustierung, 6 Monate werden nicht gewichtet.',
    rsiText: 'RSI14 wird auf ein Ziel von 58 bewertet. Das bevorzugt intakten Aufwaertstrend ohne stark ueberdehntes Niveau.',
  },
  long: {
    rangeLabel: 'ab 13 Monaten',
    profileLabel: 'Langfristig',
    formula: '40% Trend + 20% 3M-Momentum + 20% 6M-Momentum + 5% RSI + 5% Hoch-Naehe + 10% Volatilitaet',
    momentumText: '3- und 6-Monats-Momentum zaehlen, kurzfristige 1-Monats-Bewegungen werden bewusst ausgeblendet.',
    rsiText: 'RSI14 wird auf ein moderateres Ziel von 55 bewertet. Langfristig zaehlt Trendstaerke mehr als kurzfristige Ueberhitzung.',
  },
};

/** Total number of ETFs in the current filter (filled after first response). */
let knownTotal = '…';
let currentAssetClass = 'etf';
let lastMatches = [];
let currentSignalMode = 'price-breakout';
let currentSmaPeriod = DEFAULT_SMA_PERIOD;
let currentFastSmaPeriod = 50;
let currentSlowSmaPeriod = 200;
let currentLookbackWeeks = DEFAULT_LOOKBACK_WEEKS;
let currentProviderFilter = 'all';
let syncStatusInterval = null;
let currentTab = 'main';
let currentRecommendationAssetClass = 'etf';
let currentInvestmentDurationMonths = DEFAULT_INVESTMENT_DURATION_MONTHS;
let recommendationStatusInterval = null;
let activeDurationFilterMenu = null;
let currentDbAssetClass = 'etf';

const DURATION_TABLE_KEYS = {
  all: 'all',
};

const DURATION_EMPTY_VALUE = '__EMPTY__';

const durationHeaderControls = {
  all: new Map(),
};

const durationTableStates = {
  all: {
    rows: [],
    sort: { key: null, direction: 'asc' },
    filters: {},
  },
};

/* ── Utility helpers ────────────────────────────────────────────────────── */

function setVisible(el, visible) {
  el.classList.toggle('hidden', !visible);
}

function fmt(val, decimals = 2) {
  if (val == null || isNaN(val)) return '–';
  return val.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(isoDate) {
  if (!isoDate) return '–';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('de-DE');
}

function fmtDateTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '-';
  return `${date.toLocaleDateString('de-DE')} ${date.toLocaleTimeString('de-DE')}`;
}

function fmtDuration(ms) {
  const safeMs = Number(ms) || 0;
  if (safeMs <= 0) return '0s';

  const totalSec = Math.ceil(safeMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

function formatFreshnessLabel(freshness) {
  if (!freshness || !freshness.label) {
    return 'Unbekannt';
  }

  if (freshness.ageInDays == null) {
    return freshness.label;
  }

  if (freshness.ageInDays === 0) {
    return `${freshness.label} (heute)`;
  }

  if (freshness.ageInDays === 1) {
    return `${freshness.label} (1 Tag)`;
  }

  return `${freshness.label} (${freshness.ageInDays} Tage)`;
}

function setFreshnessClass(el, level) {
  el.classList.remove('freshness-very-fresh', 'freshness-acceptable', 'freshness-stale', 'freshness-unknown');

  if (level === 'very-fresh') {
    el.classList.add('freshness-very-fresh');
    return;
  }

  if (level === 'acceptable') {
    el.classList.add('freshness-acceptable');
    return;
  }

  if (level === 'stale') {
    el.classList.add('freshness-stale');
    return;
  }

  el.classList.add('freshness-unknown');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildYahooQuoteUrl(ticker) {
  const symbol = String(ticker || '').trim().toUpperCase();
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
}

function renderTickerLink(ticker) {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol) {
    return '<span class="ticker-chip">-</span>';
  }

  const safeSymbol = escHtml(symbol);
  return `<a class="ticker-link" href="${buildYahooQuoteUrl(symbol)}" target="_blank" rel="noopener noreferrer"><span class="ticker-chip">${safeSymbol}</span></a>`;
}

function getSelectedSmaPeriod() {
  const raw = String(smaPeriodInput.value || '').trim();
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < MIN_SMA_PERIOD) {
    throw new Error(`Ungueltige SMA-Periode. Bitte eine ganze Zahl >= ${MIN_SMA_PERIOD} eingeben.`);
  }

  if (parsed > MAX_SMA_PERIOD) {
    throw new Error(`SMA-Periode zu gross. Maximal erlaubt: ${MAX_SMA_PERIOD}.`);
  }

  return parsed;
}

function getSelectedSignalMode() {
  const mode = String(signalModeSelect.value || 'price-breakout').trim();
  if (mode !== 'price-breakout' && mode !== 'sma-crossover') {
    throw new Error('Ungueltiger Signaltyp. Erlaubt: Kurs ueber SMA, SMA-Crossover.');
  }
  return mode;
}

function getSelectedFastSmaPeriod() {
  const raw = String(fastSmaPeriodInput.value || '').trim();
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < MIN_SMA_PERIOD) {
    throw new Error(`Ungueltige Fast-SMA-Periode. Bitte eine ganze Zahl >= ${MIN_SMA_PERIOD} eingeben.`);
  }

  if (parsed > MAX_SMA_PERIOD) {
    throw new Error(`Fast-SMA-Periode zu gross. Maximal erlaubt: ${MAX_SMA_PERIOD}.`);
  }

  return parsed;
}

function getSelectedSlowSmaPeriod() {
  const raw = String(slowSmaPeriodInput.value || '').trim();
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < MIN_SMA_PERIOD) {
    throw new Error(`Ungueltige Slow-SMA-Periode. Bitte eine ganze Zahl >= ${MIN_SMA_PERIOD} eingeben.`);
  }

  if (parsed > MAX_SMA_PERIOD) {
    throw new Error(`Slow-SMA-Periode zu gross. Maximal erlaubt: ${MAX_SMA_PERIOD}.`);
  }

  return parsed;
}

function getSelectedLookbackWeeks() {
  const raw = String(lookbackWeeksInput.value || '').trim();
  if (raw === '') {
    return DEFAULT_LOOKBACK_WEEKS;
  }
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < MIN_LOOKBACK_WEEKS) {
    throw new Error(`Ungueltige Lookback-Periode. Bitte eine ganze Zahl >= ${MIN_LOOKBACK_WEEKS} eingeben.`);
  }

  if (parsed > MAX_LOOKBACK_WEEKS) {
    throw new Error(`Lookback-Periode zu gross. Maximal erlaubt: ${MAX_LOOKBACK_WEEKS} Wochen.`);
  }

  return parsed;
}

function getSelectedProviderFilter() {
  const value = String(providerFilter.value || 'all').trim().toLowerCase();
  if (!ALLOWED_PROVIDER_FILTERS.has(value)) {
    throw new Error('Ungueltiger Anbieterfilter. Erlaubt: Alle, nur iShares, nur Xtrackers.');
  }
  return value;
}

function getSelectedAssetClass() {
  const value = String(assetClassFilter.value || 'etf').trim().toLowerCase();
  if (!ALLOWED_ASSET_CLASSES.has(value)) {
    throw new Error('Ungueltiger Asset-Typ. Erlaubt: etf, dax40.');
  }
  return value;
}

function getSelectedRecommendationAssetClass() {
  const value = String(durationAssetClassFilter.value || 'etf').trim().toLowerCase();
  if (!ALLOWED_ASSET_CLASSES.has(value)) {
    throw new Error('Ungueltiger Asset-Typ. Erlaubt: etf, dax40.');
  }
  return value;
}

function getSelectedInvestmentDurationMonths() {
  const raw = String(investmentDurationMonthsInput.value || '').trim();
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < MIN_INVESTMENT_DURATION_MONTHS) {
    throw new Error(`Ungueltige Anlagedauer. Bitte eine ganze Zahl >= ${MIN_INVESTMENT_DURATION_MONTHS} eingeben.`);
  }

  if (parsed > MAX_INVESTMENT_DURATION_MONTHS) {
    throw new Error(`Anlagedauer zu gross. Maximal erlaubt: ${MAX_INVESTMENT_DURATION_MONTHS} Monate.`);
  }

  return parsed;
}

function applyAssetClassUiState() {
  if (currentAssetClass === 'dax40') {
    providerFilter.value = 'all';
    providerFilter.disabled = true;
    assetHintLabel.textContent = 'DAX40-Einzelwerte';
    resultsTitleLabel.textContent = '✅ Breakout-Signale (DAX40-Einzelwerte)';
    errorsTitleLabel.textContent = '⚠️ Nicht abrufbare DAX40-Einzelwerte';
    return;
  }

  providerFilter.disabled = false;
  assetHintLabel.textContent = 'ETFs (iShares/Xtrackers)';
  resultsTitleLabel.textContent = '✅ Breakout-Signale (ETFs)';
  errorsTitleLabel.textContent = '⚠️ Nicht abrufbare ETFs';
}

function getSelectedDbAssetClass() {
  const value = String(dbAssetClassFilter.value || 'etf').trim().toLowerCase();
  if (!ALLOWED_ASSET_CLASSES.has(value)) {
    throw new Error('Ungueltiger DB-Filter. Erlaubt: etf, dax40.');
  }
  return value;
}

function applyDbAssetClassUiState() {
  if (currentDbAssetClass === 'dax40') {
    dbSectionTitleLabel.textContent = '📚 DAX40-Einzelwerte mit vorhandenen DB-Daten';
    dbEtfEmpty.textContent = 'Noch keine DAX40-Einzelwerte mit gespeicherten Yahoo-Daten vorhanden.';
    return;
  }

  dbSectionTitleLabel.textContent = '📚 ETFs mit vorhandenen DB-Daten';
  dbEtfEmpty.textContent = 'Noch keine ETFs mit gespeicherten Yahoo-Daten vorhanden.';
}

function applyRecommendationAssetClassUiState() {
  if (currentRecommendationAssetClass === 'dax40') {
    durationAssetHintLabel.textContent = 'DAX40-Einzelwerte';
    recommendationTitleLabel.textContent = '🏆 Buy/Hold/Sell Empfehlungen';
    allRecommendationTitleLabel.textContent = 'Empfehlung je DAX40-Einzelwert (Buy/Hold/Sell)';
    return;
  }

  durationAssetHintLabel.textContent = 'ETFs';
  recommendationTitleLabel.textContent = '🏆 Buy/Hold/Sell Empfehlungen';
  allRecommendationTitleLabel.textContent = 'Empfehlung je Einzelwert (Buy/Hold/Sell)';
}

function getRecommendationProfileByDuration(months) {
  if (months <= 3) return 'short';
  if (months <= 12) return 'medium';
  return 'long';
}

function updateRecommendationCriteriaInfo() {
  const profileKey = getRecommendationProfileByDuration(currentInvestmentDurationMonths);
  const profile = RECOMMENDATION_PROFILES[profileKey];

  criteriaProfileName.textContent = profile.profileLabel;
  criteriaDurationRange.textContent = profile.rangeLabel;
  criteriaFormula.textContent = profile.formula;
  criteriaTrendText.textContent = 'Trendscore von 0 bis 100: 15 Punkte fuer Kurs > SMA20, 20 fuer Kurs > SMA50, 25 fuer Kurs > SMA200, 15 fuer SMA20 > SMA50, 15 fuer SMA50 > SMA200 und 10 fuer einen steigenden SMA200.';
  criteriaMomentumText.textContent = `${profile.momentumText} Die Momentum-Scores werden auf 0 bis 100 normiert.`;
  criteriaRsiText.textContent = profile.rsiText;
  criteriaBreakoutText.textContent = 'Je naeher der aktuelle Kurs am 60-Tage-Hoch liegt, desto besser. Der Teilscore faellt von optimal bei 0% Abstand bis schwach bei etwa 15% Abstand.';
  criteriaVolatilityText.textContent = 'Die annualisierte 20-Tage-Volatilitaet wird invers bewertet: ruhiger ist besser. Etwa 15% ist stark, ab etwa 45% ist der Teilscore nahe 0.';

  criteriaShortCard.classList.toggle('active', profileKey === 'short');
  criteriaMediumCard.classList.toggle('active', profileKey === 'medium');
  criteriaLongCard.classList.toggle('active', profileKey === 'long');
}

function updateSignalLabels() {
  const priceBreakoutGroup = document.getElementById('priceBreakoutGroup');
  const smaCrossoverGroup = document.getElementById('smaCrossoverGroup');

  if (currentSignalMode === 'sma-crossover') {
    setVisible(priceBreakoutGroup, false);
    setVisible(smaCrossoverGroup, true);
    const label = `SMA${currentFastSmaPeriod} > SMA${currentSlowSmaPeriod}`;
    selectedSmaLabel.textContent = label;
    sumSma.textContent = label;
    thSmaValue.textContent = `SMA${currentFastSmaPeriod}/SMA${currentSlowSmaPeriod} (heute)`;
    return;
  }

  setVisible(priceBreakoutGroup, true);
  setVisible(smaCrossoverGroup, false);
  const label = `Kurs ueber SMA${currentSmaPeriod}`;
  selectedSmaLabel.textContent = label;
  sumSma.textContent = `SMA${currentSmaPeriod}`;
  thSmaValue.textContent = `SMA${currentSmaPeriod} (heute)`;
}

function setActiveTab(tab) {
  currentTab = tab === 'db' || tab === 'duration' ? tab : 'main';

  const mainActive = currentTab === 'main';
  const durationActive = currentTab === 'duration';
  const dbActive = currentTab === 'db';

  setVisible(tabMainContent, mainActive);
  setVisible(tabDurationContent, durationActive);
  setVisible(tabDbContent, dbActive);

  tabMainBtn.classList.toggle('active', mainActive);
  tabDurationBtn.classList.toggle('active', durationActive);
  tabDbBtn.classList.toggle('active', dbActive);

  if (dbActive) {
    loadDbEtfList();
  }
}

function setSyncBadgeState({ running, isCoolingDown }) {
  syncStateBadge.classList.remove('badge-sync-active', 'badge-sync-cooldown', 'badge-sync-stopped');

  if (!running) {
    syncStateBadge.textContent = 'gestoppt';
    syncStateBadge.classList.add('badge-sync-stopped');
    return;
  }

  if (isCoolingDown) {
    syncStateBadge.textContent = 'cooldown';
    syncStateBadge.classList.add('badge-sync-cooldown');
    return;
  }

  syncStateBadge.textContent = 'aktiv';
  syncStateBadge.classList.add('badge-sync-active');
}

function renderSyncStatus(payload) {
  const status = payload?.status || {};
  const summary = payload?.summary || {};

  setVisible(syncStatusSection, true);
  setSyncBadgeState(status);

  syncProcessed.textContent = String(status.processedTickers ?? 0);
  syncRateHits.textContent = String(status.rateLimitHits ?? 0);
  syncCooldown.textContent = fmtDuration(status.cooldownRemainingMs);
  syncLastTicker.textContent = status.lastTicker || '-';
  syncTickerCount.textContent = String(summary.tickerCount ?? 0);
  syncOldestUpdate.textContent = fmtDateTime(summary.oldestUpdate);
  syncFreshness.textContent = formatFreshnessLabel(summary.freshness);
  setFreshnessClass(syncFreshness, summary?.freshness?.level);

  const checkedAt = fmtDateTime(payload.checkedAt);
  if (!status.running) {
    syncStatusNote.textContent = `Synchronisierung ist aktuell nicht aktiv. Letzter Check: ${checkedAt}.`;
  } else if (status.isCoolingDown) {
    syncStatusNote.textContent = `Yahoo-Cooldown aktiv. Fortsetzung in ${fmtDuration(status.cooldownRemainingMs)} (Stand: ${checkedAt}).`;
  } else {
    syncStatusNote.textContent = `Synchronisierung laeuft. Letzter Check: ${checkedAt}.`;
  }
}

async function fetchAndRenderSyncStatus() {
  try {
    const response = await fetch('/api/yahoo-sync-status');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Unbekannter Sync-Status-Fehler');
    }
    renderSyncStatus(data);
  } catch (err) {
    setVisible(syncStatusSection, true);
    syncStateBadge.classList.remove('badge-sync-active', 'badge-sync-cooldown');
    syncStateBadge.classList.add('badge-sync-stopped');
    syncStateBadge.textContent = 'unbekannt';
    syncStatusNote.textContent = `Sync-Status konnte nicht geladen werden: ${err.message}`;
  }
}

function startSyncStatusPolling() {
  if (syncStatusInterval) {
    clearInterval(syncStatusInterval);
  }

  fetchAndRenderSyncStatus();
  syncStatusInterval = setInterval(fetchAndRenderSyncStatus, 15000);
}

/* ── Render functions ────────────────────────────────────────────────────── */

function getMaxAboveSmaPct() {
  const raw = String(maxAboveSmaPctInput.value || '').trim();
  if (raw === '') return null;
  const parsed = parseFloat(raw);
  return isNaN(parsed) || parsed < 0 ? null : parsed;
}

function getResultSpreadPct(result) {
  if (result.mode === 'sma-crossover') {
    if (result.todayFastSMA == null || result.todaySlowSMA == null || result.todaySlowSMA === 0) {
      return null;
    }
    return ((result.todayFastSMA - result.todaySlowSMA) / result.todaySlowSMA) * 100;
  }

  if (result.todaySMA == null || result.todayClose == null || result.todaySMA === 0) {
    return null;
  }
  return ((result.todayClose - result.todaySMA) / result.todaySMA) * 100;
}

function renderMatches(matches) {
  const maxPct = getMaxAboveSmaPct();
  const filtered = maxPct == null
    ? matches
    : matches.filter(r => {
        const spreadPct = getResultSpreadPct(r);
        if (spreadPct == null) return true;
        return spreadPct <= maxPct;
      });

  matchBadge.textContent = filtered.length;
  sumMatches.textContent = filtered.length;
  setVisible(resultsSection, true);

  if (filtered.length === 0) {
    setVisible(noMatches, true);
    resultsBody.innerHTML = '';
    return;
  }

  setVisible(noMatches, false);

  const sorted = [...filtered].sort((a, b) => {
    const spreadA = getResultSpreadPct(a) ?? 0;
    const spreadB = getResultSpreadPct(b) ?? 0;
    return spreadB - spreadA;
  });

  resultsBody.innerHTML = sorted
    .map(r => {
      const spreadPct = getResultSpreadPct(r);
      const spreadHtml = spreadPct != null
        ? `<span class="spread-positive">+${fmt(spreadPct, 2)} %</span>`
        : '–';
      const steepnessRaw = r.crossoverSteepnessPct ?? r.breakoutSteepnessPct;
      const steepnessHtml = steepnessRaw != null
        ? `<span class="spread-positive">+${fmt(steepnessRaw, 2)} %</span>`
        : '–';
      const isin = r.isin || 'nicht verfügbar';
      const wkn = r.wkn || 'nicht verfügbar';
      const signalLabel = r.signalLabel || r.smaLabel || `SMA${currentSmaPeriod}`;

      const dateValue = r.breakoutDate || r.crossingDate || r.todayDate;
      const priceValue = r.mode === 'sma-crossover' ? (r.todayFastSMA ?? r.crossoverFastSMA) : r.todayClose;
      const todayLineValue = r.mode === 'sma-crossover'
        ? `${fmt(r.todayFastSMA, 4)} / ${fmt(r.todaySlowSMA, 4)}`
        : fmt(r.todaySMA, 4);

      return `
        <tr>
          <td><span class="id-chip">${escHtml(r.provider || 'nicht verfügbar')}</span></td>
          <td>${escHtml(r.name)}</td>
          <td>${renderTickerLink(r.ticker)}</td>
          <td><span class="id-chip">${escHtml(isin)}</span></td>
          <td><span class="id-chip">${escHtml(wkn)}</span></td>
          <td><span class="id-chip">${escHtml(signalLabel)}</span></td>
          <td><span class="date-badge">${fmtDate(dateValue)}</span></td>
          <td class="num">${fmt(priceValue, 4)}</td>
          <td class="num">${todayLineValue}</td>
          <td class="num">${steepnessHtml}</td>
          <td class="num">${spreadHtml}</td>
        </tr>`;
    })
    .join('');
}

function renderErrors(errors) {
  errorBadge.textContent = errors.length;
  const show = chkShowErrors.checked && errors.length > 0;
  setVisible(errorsSection, show);

  errorsBody.innerHTML = errors
    .map(e => `
      <tr>
        <td><span class="id-chip">${escHtml(e.provider || 'nicht verfügbar')}</span></td>
        <td><span class="ticker-chip">${escHtml(e.ticker)}</span></td>
        <td>${escHtml(e.name)}</td>
        <td style="color: var(--color-text-muted); font-size: 0.82rem;">${escHtml(e.error || '–')}</td>
      </tr>`)
    .join('');
}

function renderSummary(data) {
  sumScanned.textContent = data.scanned ?? '–';
  sumSma.textContent = data.smaLabel || `SMA${currentSmaPeriod}`;
  sumErrors.textContent = data.errors.length;
  sumTime.textContent = data.scannedAt
    ? new Date(data.scannedAt).toLocaleTimeString('de-DE')
    : '–';
  setVisible(summaryBar, true);
}

function renderDbEtfList(items) {
  setVisible(dbEtfSection, true);
  dbEtfBadge.textContent = String(items.length);

  if (!items.length) {
    dbEtfBody.innerHTML = '';
    setVisible(dbEtfEmpty, true);
    return;
  }

  setVisible(dbEtfEmpty, false);

  dbEtfBody.innerHTML = items
    .map(item => `
      <tr>
        <td><span class="id-chip">${escHtml(item.provider || 'nicht verfügbar')}</span></td>
        <td>${escHtml(item.name || 'nicht verfügbar')}</td>
        <td>${renderTickerLink(item.ticker)}</td>
        <td><span class="id-chip">${escHtml(item.isin || 'nicht verfügbar')}</span></td>
        <td><span class="id-chip">${escHtml(item.wkn || 'nicht verfügbar')}</span></td>
        <td class="num">${fmt(item.points, 0)}</td>
        <td><span class="date-badge">${fmtDate(item.firstDate)}</span></td>
        <td><span class="date-badge">${fmtDate(item.lastDate)}</span></td>
        <td><span class="id-chip">${fmtDateTime(item.updatedAt)}</span></td>
        <td><span class="id-chip">${escHtml(item.dataSource || 'Yahoo Finance')}</span></td>
      </tr>
    `)
    .join('');
}

function renderDbFreshness(freshness) {
  dbFreshnessBadge.textContent = formatFreshnessLabel(freshness);
  setFreshnessClass(dbFreshnessBadge, freshness?.level);
}

function renderRecommendationSummary(data, scannedAt) {
  const best = data.allRecommendations?.[0] || data.recommendations?.[0] || null;

  recSumAnalyzed.textContent = data.successful ?? data.analyzed ?? '–';
  recSumBestScore.textContent = best ? fmt(best.recommendationStrengthScore, 1) : '–';
  recSumProfile.textContent = data.profileLabel || '–';
  recSumSkipped.textContent = data.skipped ?? '–';
  recSumTime.textContent = scannedAt
    ? new Date(scannedAt).toLocaleTimeString('de-DE')
    : '–';
  setVisible(recommendationSummaryBar, true);
}

function getRecommendationClass(recommendation) {
  if (recommendation === 'Buy') return 'action-buy';
  if (recommendation === 'Sell') return 'action-sell';
  return 'action-hold';
}

function fallbackValue(value) {
  return value == null || value === '' ? 'nicht verfuegbar' : value;
}

function toNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toFilterKey(rawValue) {
  if (rawValue == null || rawValue === '') {
    return DURATION_EMPTY_VALUE;
  }
  return String(rawValue);
}

function compareByType(a, b, type) {
  const valueA = a == null || a === '' ? null : a;
  const valueB = b == null || b === '' ? null : b;

  if (valueA == null && valueB == null) return 0;
  if (valueA == null) return 1;
  if (valueB == null) return -1;

  if (type === 'number') {
    const numA = Number(valueA);
    const numB = Number(valueB);

    if (!Number.isFinite(numA) && !Number.isFinite(numB)) return 0;
    if (!Number.isFinite(numA)) return 1;
    if (!Number.isFinite(numB)) return -1;

    return numA - numB;
  }

  return String(valueA).localeCompare(String(valueB), 'de-DE', {
    numeric: true,
    sensitivity: 'base',
  });
}

function getDurationTableConfigs() {
  return {
    all: {
      tableEl: allRecommendationTable,
      bodyEl: allRecommendationBody,
      emptyEl: allRecommendationEmpty,
      badgeEl: allRecommendationBadge,
      emptyText: 'Keine technisch bewertbaren Einzelwerte gefunden.',
      columns: [
        { key: 'rank', index: 0, type: 'number', getValue: item => item.rank, formatValue: value => String(value ?? '–') },
        { key: 'provider', index: 1, type: 'text', getValue: item => fallbackValue(item.provider), formatValue: value => String(value ?? '–') },
        { key: 'name', index: 2, type: 'text', getValue: item => fallbackValue(item.name), formatValue: value => String(value ?? '–') },
        { key: 'ticker', index: 3, type: 'text', getValue: item => fallbackValue(item.ticker), formatValue: value => String(value ?? '–') },
        { key: 'currentClose', index: 4, type: 'number', getValue: item => toNumberOrNull(item.currentClose), formatValue: value => (value == null ? '–' : fmt(value, 2)) },
        { key: 'stopLoss', index: 5, type: 'number', getValue: item => {
          if (item.recommendation === 'Sell') return null;
          return toNumberOrNull(item.stopLoss);
        }, formatValue: value => value == null ? '–' : fmt(value, 2) },
        { key: 'recommendation', index: 6, type: 'text', getValue: item => fallbackValue(item.recommendation || 'Hold'), formatValue: value => String(value ?? '–') },
        { key: 'recommendationStrengthScore', index: 7, type: 'number', getValue: item => toNumberOrNull(item.recommendationStrengthScore), formatValue: value => (value == null ? '–' : fmt(value, 1)) },
        { key: 'recommendationStrength', index: 8, type: 'text', getValue: item => fallbackValue(item.recommendationStrength), formatValue: value => String(value ?? '–') },
        { key: 'buyScore', index: 9, type: 'number', getValue: item => toNumberOrNull(item.buyScore), formatValue: value => (value == null ? '–' : fmt(value, 1)) },
        { key: 'sellScore', index: 10, type: 'number', getValue: item => toNumberOrNull(item.sellScore), formatValue: value => (value == null ? '–' : fmt(value, 1)) },
        { key: 'recommendationDelta', index: 11, type: 'number', getValue: item => toNumberOrNull(item.recommendationDelta), formatValue: value => (value == null ? '–' : `${value >= 0 ? '+' : ''}${fmt(value, 2)}`) },
        { key: 'recommendationReason', index: 12, type: 'text', getValue: item => fallbackValue(item.recommendationReason), formatValue: value => String(value ?? '–') },
      ],
    },
  };
}

function getDurationColumnConfig(tableKey, columnKey) {
  const configs = getDurationTableConfigs();
  return configs[tableKey]?.columns?.find(column => column.key === columnKey) || null;
}

function getDurationColumnFilterKeys(tableKey, columnKey) {
  const state = durationTableStates[tableKey];
  const column = getDurationColumnConfig(tableKey, columnKey);
  if (!state || !column) return [];

  const uniqueValues = new Map();
  for (const row of state.rows) {
    const rawValue = column.getValue(row);
    const key = toFilterKey(rawValue);
    if (!uniqueValues.has(key)) {
      uniqueValues.set(key, rawValue);
    }
  }

  return [...uniqueValues.entries()].sort((a, b) => compareByType(a[1], b[1], column.type));
}

function applyDurationTableTransforms(tableKey) {
  const state = durationTableStates[tableKey];
  const configs = getDurationTableConfigs();
  const tableConfig = configs[tableKey];

  if (!state || !tableConfig) {
    return [];
  }

  let rows = [...state.rows];

  for (const column of tableConfig.columns) {
    const selected = state.filters[column.key];
    if (!selected) continue;

    rows = rows.filter(row => {
      const valueKey = toFilterKey(column.getValue(row));
      return selected.has(valueKey);
    });
  }

  if (state.sort.key) {
    const sortColumn = tableConfig.columns.find(column => column.key === state.sort.key);
    if (sortColumn) {
      const directionMultiplier = state.sort.direction === 'desc' ? -1 : 1;
      rows.sort((rowA, rowB) => {
        const valueA = sortColumn.getValue(rowA);
        const valueB = sortColumn.getValue(rowB);
        return compareByType(valueA, valueB, sortColumn.type) * directionMultiplier;
      });
    }
  }

  return rows;
}

function updateDurationHeaderIndicators(tableKey) {
  const state = durationTableStates[tableKey];
  const controls = durationHeaderControls[tableKey];
  if (!state || !controls) return;

  controls.forEach((control, columnKey) => {
    const hasFilter = state.filters[columnKey] instanceof Set;
    const isSorted = state.sort.key === columnKey;
    const sortDirection = isSorted ? (state.sort.direction === 'desc' ? 'absteigend' : 'aufsteigend') : 'keine Sortierung';
    const filterLabel = hasFilter ? 'Filter aktiv' : 'Filter aus';

    control.button.classList.toggle('active', hasFilter || isSorted);
    control.button.textContent = isSorted
      ? (state.sort.direction === 'desc' ? '▼' : '▲')
      : '▾';
    control.button.title = `${filterLabel}, ${sortDirection}`;
  });
}

function closeDurationFilterMenu() {
  if (!activeDurationFilterMenu) return;
  activeDurationFilterMenu.remove();
  activeDurationFilterMenu = null;
}

function rerenderDurationTable(tableKey) {
  renderAllRecommendations(durationTableStates.all.rows, true);
}

function openDurationFilterMenu(tableKey, columnKey, anchorElement) {
  closeDurationFilterMenu();

  const state = durationTableStates[tableKey];
  const column = getDurationColumnConfig(tableKey, columnKey);
  if (!state || !column) return;

  const uniqueEntries = getDurationColumnFilterKeys(tableKey, columnKey);
  const allKeys = uniqueEntries.map(([key]) => key);
  const existingFilter = state.filters[columnKey];
  const draftSelection = existingFilter ? new Set(existingFilter) : new Set(allKeys);

  const menu = document.createElement('div');
  menu.className = 'duration-filter-menu';
  menu.addEventListener('click', evt => evt.stopPropagation());

  const sortActions = document.createElement('div');
  sortActions.className = 'duration-filter-actions';

  const sortAscBtn = document.createElement('button');
  sortAscBtn.type = 'button';
  sortAscBtn.className = 'duration-filter-action-btn';
  sortAscBtn.textContent = 'Sortieren A-Z / Klein-Gross';
  sortAscBtn.addEventListener('click', () => {
    state.sort = { key: columnKey, direction: 'asc' };
    rerenderDurationTable(tableKey);
  });

  const sortDescBtn = document.createElement('button');
  sortDescBtn.type = 'button';
  sortDescBtn.className = 'duration-filter-action-btn';
  sortDescBtn.textContent = 'Sortieren Z-A / Gross-Klein';
  sortDescBtn.addEventListener('click', () => {
    state.sort = { key: columnKey, direction: 'desc' };
    rerenderDurationTable(tableKey);
  });

  const clearSortBtn = document.createElement('button');
  clearSortBtn.type = 'button';
  clearSortBtn.className = 'duration-filter-action-btn';
  clearSortBtn.textContent = 'Sortierung entfernen';
  clearSortBtn.addEventListener('click', () => {
    if (state.sort.key === columnKey) {
      state.sort = { key: null, direction: 'asc' };
      rerenderDurationTable(tableKey);
    }
  });

  sortActions.append(sortAscBtn, sortDescBtn, clearSortBtn);

  const divider = document.createElement('div');
  divider.className = 'duration-filter-divider';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'duration-filter-search';
  searchInput.placeholder = 'Werte filtern...';

  const optionsActions = document.createElement('div');
  optionsActions.className = 'duration-filter-options-actions';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.type = 'button';
  selectAllBtn.className = 'duration-filter-link-btn';
  selectAllBtn.textContent = 'Alle';

  const clearAllBtn = document.createElement('button');
  clearAllBtn.type = 'button';
  clearAllBtn.className = 'duration-filter-link-btn';
  clearAllBtn.textContent = 'Keine';

  const resetFilterBtn = document.createElement('button');
  resetFilterBtn.type = 'button';
  resetFilterBtn.className = 'duration-filter-link-btn';
  resetFilterBtn.textContent = 'Zuruecksetzen';

  optionsActions.append(selectAllBtn, clearAllBtn, resetFilterBtn);

  const optionsList = document.createElement('div');
  optionsList.className = 'duration-filter-options';

  function applyDraftFilter() {
    if (draftSelection.size === allKeys.length) {
      delete state.filters[columnKey];
    } else {
      state.filters[columnKey] = new Set(draftSelection);
    }
    rerenderDurationTable(tableKey);
  }

  function renderOptionList() {
    const searchValue = searchInput.value.trim().toLowerCase();
    optionsList.innerHTML = '';

    for (const [key, rawValue] of uniqueEntries) {
      const displayValue = column.formatValue(rawValue);
      const matchesSearch = searchValue === '' || displayValue.toLowerCase().includes(searchValue);
      if (!matchesSearch) continue;

      const optionLabel = document.createElement('label');
      optionLabel.className = 'duration-filter-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = draftSelection.has(key);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          draftSelection.add(key);
        } else {
          draftSelection.delete(key);
        }
        applyDraftFilter();
      });

      const valueText = document.createElement('span');
      valueText.textContent = displayValue;

      optionLabel.append(checkbox, valueText);
      optionsList.appendChild(optionLabel);
    }

    if (!optionsList.children.length) {
      const empty = document.createElement('div');
      empty.className = 'duration-filter-no-options';
      empty.textContent = 'Keine Werte gefunden';
      optionsList.appendChild(empty);
    }
  }

  selectAllBtn.addEventListener('click', () => {
    for (const key of allKeys) {
      draftSelection.add(key);
    }
    applyDraftFilter();
    renderOptionList();
  });

  clearAllBtn.addEventListener('click', () => {
    draftSelection.clear();
    applyDraftFilter();
    renderOptionList();
  });

  resetFilterBtn.addEventListener('click', () => {
    for (const key of allKeys) {
      draftSelection.add(key);
    }
    delete state.filters[columnKey];
    rerenderDurationTable(tableKey);
    renderOptionList();
  });

  searchInput.addEventListener('input', renderOptionList);

  menu.append(sortActions, divider, searchInput, optionsActions, optionsList);
  document.body.appendChild(menu);
  activeDurationFilterMenu = menu;

  const anchorRect = anchorElement.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const top = anchorRect.bottom + window.scrollY + 6;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - menuRect.width - 12;
  const left = Math.max(window.scrollX + 12, Math.min(anchorRect.left + window.scrollX, maxLeft));
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  renderOptionList();
  searchInput.focus();
}

function initDurationTableHeaderControls() {
  const configs = getDurationTableConfigs();

  for (const tableKey of Object.values(DURATION_TABLE_KEYS)) {
    const tableConfig = configs[tableKey];
    if (!tableConfig?.tableEl?.tHead?.rows?.[0]) continue;

    const headerRow = tableConfig.tableEl.tHead.rows[0];
    for (const column of tableConfig.columns) {
      const th = headerRow.cells[column.index];
      if (!th || th.dataset.filterReady === '1') continue;

      const titleText = th.textContent.trim();
      th.dataset.filterReady = '1';
      th.classList.add('th-filter-enabled');
      th.textContent = '';

      const wrap = document.createElement('div');
      wrap.className = 'th-filter-wrap';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'th-filter-label';
      labelSpan.textContent = titleText;

      const filterBtn = document.createElement('button');
      filterBtn.type = 'button';
      filterBtn.className = 'th-filter-btn';
      filterBtn.textContent = '▾';
      filterBtn.title = 'Sortieren und filtern';
      filterBtn.addEventListener('click', evt => {
        evt.stopPropagation();
        openDurationFilterMenu(tableKey, column.key, filterBtn);
      });

      wrap.append(labelSpan, filterBtn);
      th.appendChild(wrap);

      durationHeaderControls[tableKey].set(column.key, {
        button: filterBtn,
        label: labelSpan,
      });
    }

    updateDurationHeaderIndicators(tableKey);
  }

  document.addEventListener('click', () => {
    closeDurationFilterMenu();
  });

  document.addEventListener('keydown', evt => {
    if (evt.key === 'Escape') {
      closeDurationFilterMenu();
    }
  });
}

function renderStopLoss(item) {
  if (item.recommendation === 'Sell') return '–';
  const basis = item.stopLossBasis || 'Sell-Schwelle';
  const price = item.stopLoss;
  if (price == null || !Number.isFinite(price)) return '–';
  return `<span class="stop-loss-price">${fmt(price, 2)}</span><br><span class="stop-loss-basis">${basis}</span>`;
}

function renderAllRecommendations(items, preserveState = false) {
  if (!preserveState) {
    durationTableStates.all.rows = Array.isArray(items) ? items : [];
  }

  const visibleItems = applyDurationTableTransforms(DURATION_TABLE_KEYS.all);
  allRecommendationBadge.textContent = String(visibleItems.length);
  setVisible(recommendationSection, true);

  if (!visibleItems.length) {
    allRecommendationBody.innerHTML = '';
    setVisible(allRecommendationEmpty, true);
    allRecommendationEmpty.textContent = durationTableStates.all.rows.length
      ? 'Keine Zeilen fuer die aktuellen Filter gefunden.'
      : 'Keine technisch bewertbaren Einzelwerte gefunden.';
    updateDurationHeaderIndicators(DURATION_TABLE_KEYS.all);
    return;
  }

  setVisible(allRecommendationEmpty, false);
  allRecommendationBody.innerHTML = visibleItems
    .map(item => {
      const actionClass = getRecommendationClass(item.recommendation);
      const delta = Number.isFinite(item.recommendationDelta)
        ? `${item.recommendationDelta >= 0 ? '+' : ''}${fmt(item.recommendationDelta, 2)}`
        : '–';

      return `
        <tr>
          <td><span class="rank-pill">${item.rank}</span></td>
          <td><span class="id-chip">${escHtml(item.provider || 'nicht verfügbar')}</span></td>
          <td>${escHtml(item.name || 'nicht verfügbar')}</td>
          <td>${renderTickerLink(item.ticker)}</td>
          <td class="num">${fmt(item.currentClose, 2)}</td>
          <td class="num">${renderStopLoss(item)}</td>
          <td><span class="recommendation-action ${actionClass}">${escHtml(item.recommendation || 'Hold')}</span></td>
          <td class="num"><span class="score-pill">${fmt(item.recommendationStrengthScore, 1)}</span></td>
          <td><span class="id-chip">${escHtml(item.recommendationStrength || '–')}</span></td>
          <td class="num">${fmt(item.buyScore, 1)}</td>
          <td class="num">${fmt(item.sellScore, 1)}</td>
          <td class="num">${delta}</td>
          <td><div class="recommendation-rationale">${escHtml(item.recommendationReason || '–')}</div></td>
        </tr>`;
    })
    .join('');

  updateDurationHeaderIndicators(DURATION_TABLE_KEYS.all);
}

async function loadDbEtfList() {
  try {
    const params = new URLSearchParams({
      provider: 'all',
      assetClass: currentDbAssetClass,
    });
    const response = await fetch(`/api/available-instruments?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Unbekannter Fehler beim Laden der DB-Liste');
    }

    renderDbFreshness(data.freshness);
    renderDbEtfList(data.items || []);
  } catch (err) {
    setVisible(dbEtfSection, true);
    dbEtfBadge.textContent = '0';
    renderDbFreshness(null);
    dbEtfBody.innerHTML = '';
    setVisible(dbEtfEmpty, true);
    dbEtfEmpty.textContent = `DB-Liste konnte nicht geladen werden: ${err.message}`;
  }
}

/* ── Scan logic ──────────────────────────────────────────────────────────── */

const STATUS_MESSAGES = [
  'Lade Kursdaten …',
  'Berechne SMA …',
  'Suche Breakout-Signale …',
  'Fast fertig …',
];
const RECOMMENDATION_STATUS_MESSAGES = [
  'Analysiere Trendstruktur …',
  'Bewerte Momentum je Anlagedauer …',
  'Pruefe RSI und Volatilitaet …',
  'Ermittle Buy/Hold/Sell Uebersicht …',
];
let statusInterval = null;

function startStatusAnimation() {
  let idx = 0;
  loadingStatus.textContent = STATUS_MESSAGES[0];
  statusInterval = setInterval(() => {
    idx = (idx + 1) % STATUS_MESSAGES.length;
    loadingStatus.textContent = STATUS_MESSAGES[idx];
  }, 4000);
}

function stopStatusAnimation() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

function startRecommendationStatusAnimation() {
  let idx = 0;
  recommendationLoadingStatus.textContent = RECOMMENDATION_STATUS_MESSAGES[0];
  recommendationStatusInterval = setInterval(() => {
    idx = (idx + 1) % RECOMMENDATION_STATUS_MESSAGES.length;
    recommendationLoadingStatus.textContent = RECOMMENDATION_STATUS_MESSAGES[idx];
  }, 3500);
}

function stopRecommendationStatusAnimation() {
  if (recommendationStatusInterval) {
    clearInterval(recommendationStatusInterval);
    recommendationStatusInterval = null;
  }
}

async function runScan() {
  let signalMode;
  let smaPeriod;
  let fastSmaPeriod;
  let slowSmaPeriod;
  let provider;
  let assetClass;
  let lookbackWeeks;

  try {
    assetClass = getSelectedAssetClass();
    signalMode = getSelectedSignalMode();
    smaPeriod = getSelectedSmaPeriod();
    fastSmaPeriod = getSelectedFastSmaPeriod();
    slowSmaPeriod = getSelectedSlowSmaPeriod();
    lookbackWeeks = getSelectedLookbackWeeks();

    if (signalMode === 'sma-crossover' && fastSmaPeriod === slowSmaPeriod) {
      throw new Error('Fast-SMA und Slow-SMA muessen unterschiedlich sein.');
    }

    provider = assetClass === 'dax40' ? 'all' : getSelectedProviderFilter();
  } catch (validationErr) {
    errorMessage.textContent = validationErr.message;
    setVisible(errorBanner, true);
    return;
  }

  currentAssetClass = assetClass;
  currentSignalMode = signalMode;
  currentSmaPeriod = smaPeriod;
  currentFastSmaPeriod = fastSmaPeriod;
  currentSlowSmaPeriod = slowSmaPeriod;
  currentLookbackWeeks = lookbackWeeks;
  currentProviderFilter = provider;
  applyAssetClassUiState();
  updateSignalLabels();

  setVisible(errorBanner, false);
  setVisible(loadingSection, true);
  setVisible(resultsSection, false);
  setVisible(errorsSection, false);
  setVisible(summaryBar, false);
  btnScan.disabled = true;
  startStatusAnimation();

  try {
    const params = new URLSearchParams({
      assetClass: currentAssetClass,
      sma: String(currentSmaPeriod),
      ...(currentSignalMode === 'sma-crossover' && {
        fastSma: String(currentFastSmaPeriod),
        slowSma: String(currentSlowSmaPeriod),
      }),
      ...(currentLookbackWeeks > 0 && { lookbackWeeks: String(currentLookbackWeeks) }),
      provider: currentProviderFilter,
    });

    const response = await fetch(`/api/scan?${params.toString()}`);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Unbekannter Serverfehler');
    }

    etfCountEl.textContent = data.results?.total ?? knownTotal;
    knownTotal = data.results?.total ?? knownTotal;

    if (data.results?.assetClass) {
      currentAssetClass = data.results.assetClass;
      assetClassFilter.value = currentAssetClass;
      applyAssetClassUiState();
    }

    if (data.results?.mode) {
      currentSignalMode = data.results.mode;
      signalModeSelect.value = currentSignalMode;
    }

    if (data.results?.smaPeriod) {
      currentSmaPeriod = data.results.smaPeriod;
      smaPeriodInput.value = currentSmaPeriod;
    }

    if (data.results?.fastSmaPeriod) {
      currentFastSmaPeriod = data.results.fastSmaPeriod;
      fastSmaPeriodInput.value = currentFastSmaPeriod;
    }

    if (data.results?.slowSmaPeriod) {
      currentSlowSmaPeriod = data.results.slowSmaPeriod;
      slowSmaPeriodInput.value = currentSlowSmaPeriod;
    }

    if (data.results?.lookbackDays != null) {
      currentLookbackWeeks = Math.floor(Number(data.results.lookbackDays) / 7);
      lookbackWeeksInput.value = currentLookbackWeeks;
    }

    if (data.results?.providerFilter) {
      currentProviderFilter = data.results.providerFilter;
      providerFilter.value = currentProviderFilter;
    }

    updateSignalLabels();

    lastMatches = data.results.matches ?? [];
    renderSummary({ ...data.results, scannedAt: data.scannedAt });
    renderMatches(lastMatches);
    renderErrors(data.results.errors ?? []);
  } catch (err) {
    errorMessage.textContent = `Fehler beim Scan: ${err.message}`;
    setVisible(errorBanner, true);
  } finally {
    stopStatusAnimation();
    setVisible(loadingSection, false);
    btnScan.disabled = false;
  }
}

async function runRecommendations() {
  let assetClass;
  let investmentDurationMonths;

  closeDurationFilterMenu();

  try {
    assetClass = getSelectedRecommendationAssetClass();
    investmentDurationMonths = getSelectedInvestmentDurationMonths();
  } catch (validationErr) {
    recommendationErrorMessage.textContent = validationErr.message;
    setVisible(recommendationErrorBanner, true);
    return;
  }

  currentRecommendationAssetClass = assetClass;
  currentInvestmentDurationMonths = investmentDurationMonths;
  applyRecommendationAssetClassUiState();

  setVisible(recommendationErrorBanner, false);
  setVisible(recommendationLoadingSection, true);
  setVisible(recommendationSection, false);
  setVisible(recommendationSummaryBar, false);
  btnRecommend.disabled = true;
  startRecommendationStatusAnimation();

  try {
    const params = new URLSearchParams({
      assetClass: currentRecommendationAssetClass,
      provider: 'all',
      investmentDurationMonths: String(currentInvestmentDurationMonths),
      limit: '3',
    });

    const response = await fetch(`/api/recommendations?${params.toString()}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Unbekannter Serverfehler');
    }

    if (data.results?.assetClass) {
      currentRecommendationAssetClass = data.results.assetClass;
      durationAssetClassFilter.value = currentRecommendationAssetClass;
    }

    if (data.results?.investmentDurationMonths) {
      currentInvestmentDurationMonths = data.results.investmentDurationMonths;
      investmentDurationMonthsInput.value = currentInvestmentDurationMonths;
    }

    applyRecommendationAssetClassUiState();
    renderRecommendationSummary(data.results, data.scannedAt);
    renderAllRecommendations(data.results.allRecommendations || []);
  } catch (err) {
    recommendationErrorMessage.textContent = `Fehler bei den Empfehlungen: ${err.message}`;
    setVisible(recommendationErrorBanner, true);
  } finally {
    stopRecommendationStatusAnimation();
    setVisible(recommendationLoadingSection, false);
    btnRecommend.disabled = false;
  }
}

/* ── Event listeners ─────────────────────────────────────────────────────── */

btnScan.addEventListener('click', () => runScan());
btnRecommend.addEventListener('click', () => runRecommendations());

signalModeSelect.addEventListener('change', () => {
  try {
    currentSignalMode = getSelectedSignalMode();
    updateSignalLabels();
    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

smaPeriodInput.addEventListener('change', () => {
  try {
    currentSmaPeriod = getSelectedSmaPeriod();
    updateSignalLabels();
    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

fastSmaPeriodInput.addEventListener('change', () => {
  try {
    currentFastSmaPeriod = getSelectedFastSmaPeriod();
    updateSignalLabels();
    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

slowSmaPeriodInput.addEventListener('change', () => {
  try {
    currentSlowSmaPeriod = getSelectedSlowSmaPeriod();
    updateSignalLabels();
    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

lookbackWeeksInput.addEventListener('change', () => {
  try {
    currentLookbackWeeks = getSelectedLookbackWeeks();
    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

providerFilter.addEventListener('change', () => {
  try {
    if (currentAssetClass === 'dax40') {
      providerFilter.value = 'all';
      return;
    }
    currentProviderFilter = getSelectedProviderFilter();
    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

assetClassFilter.addEventListener('change', () => {
  try {
    currentAssetClass = getSelectedAssetClass();
    applyAssetClassUiState();

    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

durationAssetClassFilter.addEventListener('change', () => {
  try {
    currentRecommendationAssetClass = getSelectedRecommendationAssetClass();
    applyRecommendationAssetClassUiState();
    setVisible(recommendationErrorBanner, false);
  } catch (err) {
    recommendationErrorMessage.textContent = err.message;
    setVisible(recommendationErrorBanner, true);
  }
});

dbAssetClassFilter.addEventListener('change', () => {
  try {
    currentDbAssetClass = getSelectedDbAssetClass();
    applyDbAssetClassUiState();

    if (currentTab === 'db') {
      loadDbEtfList();
    }
  } catch (err) {
    setVisible(dbEtfSection, true);
    dbEtfBody.innerHTML = '';
    dbEtfBadge.textContent = '0';
    setVisible(dbEtfEmpty, true);
    dbEtfEmpty.textContent = err.message;
  }
});

investmentDurationMonthsInput.addEventListener('change', () => {
  try {
    currentInvestmentDurationMonths = getSelectedInvestmentDurationMonths();
    updateRecommendationCriteriaInfo();
    setVisible(recommendationErrorBanner, false);
  } catch (err) {
    recommendationErrorMessage.textContent = err.message;
    setVisible(recommendationErrorBanner, true);
  }
});

chkShowErrors.addEventListener('change', () => {
  const errorCount = parseInt(errorBadge.textContent, 10) || 0;
  setVisible(errorsSection, chkShowErrors.checked && errorCount > 0);
});

maxAboveSmaPctInput.addEventListener('input', () => {
  if (lastMatches.length > 0) {
    renderMatches(lastMatches);
  }
});

tabMainBtn.addEventListener('click', () => setActiveTab('main'));
tabDurationBtn.addEventListener('click', () => setActiveTab('duration'));
tabDbBtn.addEventListener('click', () => setActiveTab('db'));

/* ── Initialisation ──────────────────────────────────────────────────────── */

etfCountEl.textContent = knownTotal;
currentAssetClass = getSelectedAssetClass();
currentSignalMode = getSelectedSignalMode();
currentSmaPeriod = getSelectedSmaPeriod();
currentFastSmaPeriod = getSelectedFastSmaPeriod();
currentSlowSmaPeriod = getSelectedSlowSmaPeriod();
currentLookbackWeeks = getSelectedLookbackWeeks();
currentRecommendationAssetClass = getSelectedRecommendationAssetClass();
currentInvestmentDurationMonths = getSelectedInvestmentDurationMonths();
currentDbAssetClass = getSelectedDbAssetClass();
applyAssetClassUiState();
applyRecommendationAssetClassUiState();
applyDbAssetClassUiState();
updateRecommendationCriteriaInfo();
updateSignalLabels();
initDurationTableHeaderControls();
startSyncStatusPolling();
setActiveTab('main');
