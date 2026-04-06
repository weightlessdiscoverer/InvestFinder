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
const smaPeriodInput = document.getElementById('smaPeriodInput');
const providerFilter = document.getElementById('providerFilter');
const chkShowErrors = document.getElementById('chkShowErrors');
const etfCountEl = document.getElementById('etfCount');
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
const thSmaValue = document.getElementById('thSmaValue');
const errorsSection = document.getElementById('errorsSection');
const errorsBody = document.getElementById('errorsBody');
const errorBadge = document.getElementById('errorBadge');
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
const tabDbBtn = document.getElementById('tabDbBtn');
const tabMainContent = document.getElementById('tabMainContent');
const tabDbContent = document.getElementById('tabDbContent');
const dbEtfSection = document.getElementById('dbEtfSection');
const dbEtfBadge = document.getElementById('dbEtfBadge');
const dbFreshnessBadge = document.getElementById('dbFreshnessBadge');
const dbEtfBody = document.getElementById('dbEtfBody');
const dbEtfEmpty = document.getElementById('dbEtfEmpty');

const MIN_SMA_PERIOD = 2;
const MAX_SMA_PERIOD = 400;
const DEFAULT_SMA_PERIOD = 200;
const ALLOWED_PROVIDER_FILTERS = new Set(['all', 'ishares', 'xtrackers']);

/** Total number of ETFs in the current filter (filled after first response). */
let knownTotal = '…';
let currentSmaPeriod = DEFAULT_SMA_PERIOD;
let currentProviderFilter = 'all';
let syncStatusInterval = null;
let currentTab = 'main';

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

function getSelectedProviderFilter() {
  const value = String(providerFilter.value || 'all').trim().toLowerCase();
  if (!ALLOWED_PROVIDER_FILTERS.has(value)) {
    throw new Error('Ungueltiger Anbieterfilter. Erlaubt: Alle, nur iShares, nur Xtrackers.');
  }
  return value;
}

function updateSmaLabels(smaPeriod) {
  const label = `SMA${smaPeriod}`;
  selectedSmaLabel.textContent = label;
  sumSma.textContent = label;
  thSmaValue.textContent = `${label} (heute)`;
}

function setActiveTab(tab) {
  currentTab = tab === 'db' ? 'db' : 'main';

  const mainActive = currentTab === 'main';
  setVisible(tabMainContent, mainActive);
  setVisible(tabDbContent, !mainActive);

  tabMainBtn.classList.toggle('active', mainActive);
  tabDbBtn.classList.toggle('active', !mainActive);

  if (!mainActive) {
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

function renderMatches(matches) {
  matchBadge.textContent = matches.length;
  setVisible(resultsSection, true);

  if (matches.length === 0) {
    setVisible(noMatches, true);
    resultsBody.innerHTML = '';
    return;
  }

  setVisible(noMatches, false);

  const sorted = [...matches].sort((a, b) => {
    const spreadA = a.todaySMA ? (a.todayClose - a.todaySMA) / a.todaySMA : 0;
    const spreadB = b.todaySMA ? (b.todayClose - b.todaySMA) / b.todaySMA : 0;
    return spreadB - spreadA;
  });

  resultsBody.innerHTML = sorted
    .map(r => {
      const spreadPct = r.todaySMA
        ? ((r.todayClose - r.todaySMA) / r.todaySMA) * 100
        : null;
      const spreadHtml = spreadPct != null
        ? `<span class="spread-positive">+${fmt(spreadPct, 2)} %</span>`
        : '–';
      const isin = r.isin || 'nicht verfügbar';
      const wkn = r.wkn || 'nicht verfügbar';

      return `
        <tr>
          <td><span class="id-chip">${escHtml(r.provider || 'nicht verfügbar')}</span></td>
          <td>${escHtml(r.name)}</td>
          <td>${renderTickerLink(r.ticker)}</td>
          <td><span class="id-chip">${escHtml(isin)}</span></td>
          <td><span class="id-chip">${escHtml(wkn)}</span></td>
          <td><span class="id-chip">${escHtml(r.smaLabel || `SMA${currentSmaPeriod}`)}</span></td>
          <td><span class="date-badge">${fmtDate(r.todayDate)}</span></td>
          <td class="num">${fmt(r.todayClose, 4)}</td>
          <td class="num">${fmt(r.todaySMA, 4)}</td>
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
  sumMatches.textContent = data.matches.length;
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

async function loadDbEtfList() {
  try {
    const params = new URLSearchParams({ provider: currentProviderFilter });
    const response = await fetch(`/api/available-etfs?${params.toString()}`);
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

async function runScan() {
  let smaPeriod;
  let provider;

  try {
    smaPeriod = getSelectedSmaPeriod();
    provider = getSelectedProviderFilter();
  } catch (validationErr) {
    errorMessage.textContent = validationErr.message;
    setVisible(errorBanner, true);
    return;
  }

  currentSmaPeriod = smaPeriod;
  currentProviderFilter = provider;
  updateSmaLabels(currentSmaPeriod);

  setVisible(errorBanner, false);
  setVisible(loadingSection, true);
  setVisible(resultsSection, false);
  setVisible(errorsSection, false);
  setVisible(summaryBar, false);
  btnScan.disabled = true;
  startStatusAnimation();

  try {
    const params = new URLSearchParams({
      sma: String(currentSmaPeriod),
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

    if (data.results?.smaPeriod) {
      currentSmaPeriod = data.results.smaPeriod;
      updateSmaLabels(currentSmaPeriod);
    }
    if (data.results?.providerFilter) {
      currentProviderFilter = data.results.providerFilter;
      providerFilter.value = currentProviderFilter;
    }

    renderSummary({ ...data.results, scannedAt: data.scannedAt });
    renderMatches(data.results.matches ?? []);
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

/* ── Event listeners ─────────────────────────────────────────────────────── */

btnScan.addEventListener('click', () => runScan());

smaPeriodInput.addEventListener('change', () => {
  try {
    currentSmaPeriod = getSelectedSmaPeriod();
    updateSmaLabels(currentSmaPeriod);
    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

providerFilter.addEventListener('change', () => {
  try {
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

chkShowErrors.addEventListener('change', () => {
  const errorCount = parseInt(errorBadge.textContent, 10) || 0;
  setVisible(errorsSection, chkShowErrors.checked && errorCount > 0);
});

tabMainBtn.addEventListener('click', () => setActiveTab('main'));
tabDbBtn.addEventListener('click', () => setActiveTab('db'));

/* ── Initialisation ──────────────────────────────────────────────────────── */

etfCountEl.textContent = knownTotal;
updateSmaLabels(currentSmaPeriod);
startSyncStatusPolling();
setActiveTab('main');
