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
const durationProviderFilter = document.getElementById('durationProviderFilter');
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
const durationBuyTabBtn = document.getElementById('durationBuyTabBtn');
const durationSellTabBtn = document.getElementById('durationSellTabBtn');
const buyRecommendationPanel = document.getElementById('buyRecommendationPanel');
const sellRecommendationPanel = document.getElementById('sellRecommendationPanel');
const buyRecommendationTitleLabel = document.getElementById('buyRecommendationTitleLabel');
const buyRecommendationBadge = document.getElementById('buyRecommendationBadge');
const buyRecommendationBody = document.getElementById('buyRecommendationBody');
const buyRecommendationEmpty = document.getElementById('buyRecommendationEmpty');
const sellRecommendationTitleLabel = document.getElementById('sellRecommendationTitleLabel');
const sellRecommendationBadge = document.getElementById('sellRecommendationBadge');
const sellRecommendationBody = document.getElementById('sellRecommendationBody');
const sellRecommendationEmpty = document.getElementById('sellRecommendationEmpty');
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
let currentRecommendationProviderFilter = 'all';
let currentInvestmentDurationMonths = DEFAULT_INVESTMENT_DURATION_MONTHS;
let currentRecommendationSubtab = 'buy';
let recommendationStatusInterval = null;

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

function getSelectedRecommendationProviderFilter() {
  const value = String(durationProviderFilter.value || 'all').trim().toLowerCase();
  if (!ALLOWED_PROVIDER_FILTERS.has(value)) {
    throw new Error('Ungueltiger Anbieterfilter. Erlaubt: Alle, nur iShares, nur Xtrackers.');
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
    dbSectionTitleLabel.textContent = '📚 DAX40-Einzelwerte mit vorhandenen DB-Daten';
    return;
  }

  providerFilter.disabled = false;
  assetHintLabel.textContent = 'ETFs (iShares/Xtrackers)';
  resultsTitleLabel.textContent = '✅ Breakout-Signale (ETFs)';
  errorsTitleLabel.textContent = '⚠️ Nicht abrufbare ETFs';
  dbSectionTitleLabel.textContent = '📚 ETFs mit vorhandenen DB-Daten';
}

function applyRecommendationAssetClassUiState() {
  if (currentRecommendationAssetClass === 'dax40') {
    durationProviderFilter.value = 'all';
    durationProviderFilter.disabled = true;
    durationAssetHintLabel.textContent = 'DAX40-Einzelwerte';
    recommendationTitleLabel.textContent = '🏆 Kauf- und Verkaufskandidaten nach Anlagedauer';
    buyRecommendationTitleLabel.textContent = 'Top 3 Kaufkandidaten DAX40';
    sellRecommendationTitleLabel.textContent = 'Top 3 Verkaufskandidaten DAX40';
    return;
  }

  durationProviderFilter.disabled = false;
  durationAssetHintLabel.textContent = 'ETFs';
  recommendationTitleLabel.textContent = '🏆 Kauf- und Verkaufskandidaten nach Anlagedauer';
  buyRecommendationTitleLabel.textContent = 'Top 3 Kaufkandidaten';
  sellRecommendationTitleLabel.textContent = 'Top 3 Verkaufskandidaten';
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

function getScoreClass(score) {
  if (score >= 75) return 'score-strong';
  if (score >= 45) return 'score-neutral';
  return 'score-weak';
}

function renderRecommendationSummary(data, scannedAt) {
  const best = data.buyRecommendations?.[0] || data.recommendations?.[0] || null;

  recSumAnalyzed.textContent = data.successful ?? data.analyzed ?? '–';
  recSumBestScore.textContent = best ? fmt(best.score, 1) : '–';
  recSumProfile.textContent = data.profileLabel || '–';
  recSumSkipped.textContent = data.skipped ?? '–';
  recSumTime.textContent = scannedAt
    ? new Date(scannedAt).toLocaleTimeString('de-DE')
    : '–';
  setVisible(recommendationSummaryBar, true);
}

function setActiveRecommendationSubtab(tab) {
  currentRecommendationSubtab = tab === 'sell' ? 'sell' : 'buy';

  const showBuy = currentRecommendationSubtab === 'buy';
  setVisible(buyRecommendationPanel, showBuy);
  setVisible(sellRecommendationPanel, !showBuy);

  durationBuyTabBtn.classList.toggle('active', showBuy);
  durationSellTabBtn.classList.toggle('active', !showBuy);
}

function renderBuyRecommendations(items) {
  buyRecommendationBadge.textContent = String(items.length);
  setVisible(recommendationSection, true);

  if (!items.length) {
    buyRecommendationBody.innerHTML = '';
    setVisible(buyRecommendationEmpty, true);
    return;
  }

  setVisible(buyRecommendationEmpty, false);
  buyRecommendationBody.innerHTML = items
    .map(item => `
      <tr>
        <td><span class="rank-pill">${item.rank}</span></td>
        <td><span class="id-chip">${escHtml(item.provider || 'nicht verfügbar')}</span></td>
        <td>${escHtml(item.name || 'nicht verfügbar')}</td>
        <td>${renderTickerLink(item.ticker)}</td>
        <td><span class="id-chip">${escHtml(item.isin || 'nicht verfügbar')}</span></td>
        <td><span class="id-chip">${escHtml(item.wkn || 'nicht verfügbar')}</span></td>
        <td class="num"><span class="score-pill ${getScoreClass(item.score)}">${fmt(item.score, 1)}</span></td>
        <td><span class="id-chip">${escHtml(item.profileLabel || '–')}</span></td>
        <td class="num">${item.momentum20Pct != null ? `${fmt(item.momentum20Pct, 2)} %` : '–'}</td>
        <td class="num">${item.momentum60Pct != null ? `${fmt(item.momentum60Pct, 2)} %` : '–'}</td>
        <td class="num">${item.momentum120Pct != null ? `${fmt(item.momentum120Pct, 2)} %` : '–'}</td>
        <td class="num">${fmt(item.rsi14, 2)}</td>
        <td class="num">${item.annualizedVolatilityPct != null ? `${fmt(item.annualizedVolatilityPct, 2)} %` : '–'}</td>
        <td><div class="recommendation-rationale">${escHtml(item.rationale || '–')}</div></td>
      </tr>`)
    .join('');
}

function renderSellRecommendations(items) {
  sellRecommendationBadge.textContent = String(items.length);
  setVisible(recommendationSection, true);

  if (!items.length) {
    sellRecommendationBody.innerHTML = '';
    setVisible(sellRecommendationEmpty, true);
    return;
  }

  setVisible(sellRecommendationEmpty, false);
  sellRecommendationBody.innerHTML = items
    .map(item => `
      <tr>
        <td><span class="rank-pill">${item.rank}</span></td>
        <td><span class="id-chip">${escHtml(item.provider || 'nicht verfügbar')}</span></td>
        <td>${escHtml(item.name || 'nicht verfügbar')}</td>
        <td>${renderTickerLink(item.ticker)}</td>
        <td><span class="id-chip">${escHtml(item.isin || 'nicht verfügbar')}</span></td>
        <td><span class="id-chip">${escHtml(item.wkn || 'nicht verfügbar')}</span></td>
        <td class="num"><span class="score-pill score-weak">${fmt(item.score, 1)}</span></td>
        <td><span class="id-chip">${escHtml(item.sellOutlook || '–')}</span></td>
        <td class="num">${item.momentum20Pct != null ? `${fmt(item.momentum20Pct, 2)} %` : '–'}</td>
        <td class="num">${item.momentum60Pct != null ? `${fmt(item.momentum60Pct, 2)} %` : '–'}</td>
        <td class="num">${item.momentum120Pct != null ? `${fmt(item.momentum120Pct, 2)} %` : '–'}</td>
        <td class="num">${fmt(item.rsi14, 2)}</td>
        <td class="num">${item.annualizedVolatilityPct != null ? `${fmt(item.annualizedVolatilityPct, 2)} %` : '–'}</td>
        <td><div class="recommendation-rationale">${escHtml(item.sellRationale || '–')}</div></td>
      </tr>`)
    .join('');
}

async function loadDbEtfList() {
  try {
    const params = new URLSearchParams({
      provider: currentProviderFilter,
      assetClass: currentAssetClass,
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
  'Ermittle Kauf- und Verkaufskandidaten …',
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
  let provider;
  let investmentDurationMonths;

  try {
    assetClass = getSelectedRecommendationAssetClass();
    investmentDurationMonths = getSelectedInvestmentDurationMonths();
    provider = assetClass === 'dax40' ? 'all' : getSelectedRecommendationProviderFilter();
  } catch (validationErr) {
    recommendationErrorMessage.textContent = validationErr.message;
    setVisible(recommendationErrorBanner, true);
    return;
  }

  currentRecommendationAssetClass = assetClass;
  currentRecommendationProviderFilter = provider;
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
      provider: currentRecommendationProviderFilter,
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

    if (data.results?.providerFilter) {
      currentRecommendationProviderFilter = data.results.providerFilter;
      durationProviderFilter.value = currentRecommendationProviderFilter;
    }

    if (data.results?.investmentDurationMonths) {
      currentInvestmentDurationMonths = data.results.investmentDurationMonths;
      investmentDurationMonthsInput.value = currentInvestmentDurationMonths;
    }

    applyRecommendationAssetClassUiState();
    renderRecommendationSummary(data.results, data.scannedAt);
    renderBuyRecommendations(data.results.buyRecommendations || data.results.recommendations || []);
    renderSellRecommendations(data.results.sellRecommendations || []);
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
durationBuyTabBtn.addEventListener('click', () => setActiveRecommendationSubtab('buy'));
durationSellTabBtn.addEventListener('click', () => setActiveRecommendationSubtab('sell'));

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
    if (currentTab === 'db') {
      loadDbEtfList();
    }
    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

durationProviderFilter.addEventListener('change', () => {
  try {
    if (currentRecommendationAssetClass === 'dax40') {
      durationProviderFilter.value = 'all';
      return;
    }
    currentRecommendationProviderFilter = getSelectedRecommendationProviderFilter();
    setVisible(recommendationErrorBanner, false);
  } catch (err) {
    recommendationErrorMessage.textContent = err.message;
    setVisible(recommendationErrorBanner, true);
  }
});

assetClassFilter.addEventListener('change', () => {
  try {
    currentAssetClass = getSelectedAssetClass();
    applyAssetClassUiState();

    if (currentTab === 'db') {
      loadDbEtfList();
    }

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
currentRecommendationProviderFilter = getSelectedRecommendationProviderFilter();
currentInvestmentDurationMonths = getSelectedInvestmentDurationMonths();
applyAssetClassUiState();
applyRecommendationAssetClassUiState();
updateRecommendationCriteriaInfo();
updateSignalLabels();
setActiveRecommendationSubtab('buy');
startSyncStatusPolling();
setActiveTab('main');
