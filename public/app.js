/**
 * app.js  –  Frontend logic for the InvestFinder ETF SMA Breakout Scanner.
 *
 * Responsibilities:
 *  - Handle "Scan starten" / "Neu laden" button clicks
 *  - Call the backend API (/api/scan)
 *  - Show / hide loading indicator
 *  - Render results table and error list
 */

'use strict';

/* ── DOM references ─────────────────────────────────────────────────────── */
const btnScan         = document.getElementById('btnScan');
const btnRefresh      = document.getElementById('btnRefresh');
const smaPeriodInput  = document.getElementById('smaPeriodInput');
const chkShowErrors   = document.getElementById('chkShowErrors');
const etfCountEl      = document.getElementById('etfCount');
const selectedSmaLabel = document.getElementById('selectedSmaLabel');
const loadingSection  = document.getElementById('loadingSection');
const loadingStatus   = document.getElementById('loadingStatus');
const errorBanner     = document.getElementById('errorBanner');
const errorMessage    = document.getElementById('errorMessage');
const summaryBar      = document.getElementById('summaryBar');
const sumScanned      = document.getElementById('sumScanned');
const sumMatches      = document.getElementById('sumMatches');
const sumSma          = document.getElementById('sumSma');
const sumErrors       = document.getElementById('sumErrors');
const sumTime         = document.getElementById('sumTime');
const resultsSection  = document.getElementById('resultsSection');
const resultsBody     = document.getElementById('resultsBody');
const noMatches       = document.getElementById('noMatches');
const matchBadge      = document.getElementById('matchBadge');
const thSmaValue      = document.getElementById('thSmaValue');
const errorsSection   = document.getElementById('errorsSection');
const errorsBody      = document.getElementById('errorsBody');
const errorBadge      = document.getElementById('errorBadge');

const MIN_SMA_PERIOD = 2;
const MAX_SMA_PERIOD = 400;
const DEFAULT_SMA_PERIOD = 200;

/** Total number of ETFs in the universe (filled after first response). */
let knownTotal = '…';
let currentSmaPeriod = DEFAULT_SMA_PERIOD;

/* ── Utility helpers ────────────────────────────────────────────────────── */

/**
 * Show/hide an element using the .hidden CSS class.
 * @param {HTMLElement} el
 * @param {boolean} visible
 */
function setVisible(el, visible) {
  el.classList.toggle('hidden', !visible);
}

/**
 * Format a number to a fixed number of decimal places.
 * @param {number|null} val
 * @param {number} decimals
 * @returns {string}
 */
function fmt(val, decimals = 2) {
  if (val == null || isNaN(val)) return '–';
  return val.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format an ISO date string to locale date (dd.mm.yyyy).
 * @param {string|null} isoDate
 * @returns {string}
 */
function fmtDate(isoDate) {
  if (!isoDate) return '–';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('de-DE');
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Parse and validate SMA period from user input.
 * @returns {number}
 * @throws {Error}
 */
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

/**
 * Updates labels that reference the currently selected SMA period.
 * @param {number} smaPeriod
 */
function updateSmaLabels(smaPeriod) {
  const label = `SMA${smaPeriod}`;
  selectedSmaLabel.textContent = label;
  sumSma.textContent = label;
  thSmaValue.textContent = `${label} (heute)`;
}

/* ── Render functions ────────────────────────────────────────────────────── */

/**
 * Render the matches (SMA breakout signals) into the results table.
 * @param {object[]} matches
 */
function renderMatches(matches) {
  matchBadge.textContent = matches.length;
  setVisible(resultsSection, true);

  if (matches.length === 0) {
    setVisible(noMatches, true);
    resultsBody.innerHTML = '';
    return;
  }

  setVisible(noMatches, false);

  // Sort by percentage distance above selected SMA descending.
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
          <td><span class="ticker-chip">${escHtml(r.ticker)}</span></td>
          <td>${escHtml(r.name)}</td>
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

/**
 * Render the errors table.
 * @param {object[]} errors
 */
function renderErrors(errors) {
  errorBadge.textContent = errors.length;
  const show = chkShowErrors.checked && errors.length > 0;
  setVisible(errorsSection, show);

  errorsBody.innerHTML = errors
    .map(e => `
      <tr>
        <td><span class="ticker-chip">${escHtml(e.ticker)}</span></td>
        <td>${escHtml(e.name)}</td>
        <td style="color: var(--color-text-muted); font-size: 0.82rem;">${escHtml(e.error || '–')}</td>
      </tr>`)
    .join('');
}

/**
 * Update the summary bar with scan statistics.
 * @param {{ total: number, scanned: number, matches: object[], errors: object[], scannedAt: string }} data
 */
function renderSummary(data) {
  sumScanned.textContent  = data.scanned ?? '–';
  sumMatches.textContent  = data.matches.length;
  sumSma.textContent      = data.smaLabel || `SMA${currentSmaPeriod}`;
  sumErrors.textContent   = data.errors.length;
  sumTime.textContent     = data.scannedAt
    ? new Date(data.scannedAt).toLocaleTimeString('de-DE')
    : '–';
  setVisible(summaryBar, true);
}

/* ── Scan logic ──────────────────────────────────────────────────────────── */

/** Animated loading status messages to keep the UI lively during the scan. */
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

/**
 * Perform the ETF scan by calling the backend API.
 * @param {boolean} bypassCache  When true, forces a fresh scan ignoring the cache.
 */
async function runScan(bypassCache = false) {
  let smaPeriod;
  try {
    smaPeriod = getSelectedSmaPeriod();
  } catch (validationErr) {
    errorMessage.textContent = validationErr.message;
    setVisible(errorBanner, true);
    return;
  }

  currentSmaPeriod = smaPeriod;
  updateSmaLabels(currentSmaPeriod);

  // Reset UI state
  setVisible(errorBanner, false);
  setVisible(loadingSection, true);
  setVisible(resultsSection, false);
  setVisible(errorsSection, false);
  setVisible(summaryBar, false);
  btnScan.disabled    = true;
  btnRefresh.disabled = true;
  startStatusAnimation();

  try {
    const params = new URLSearchParams({ sma: String(currentSmaPeriod) });
    if (bypassCache) params.set('cache', 'false');
    const url = `/api/scan?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Unbekannter Serverfehler');
    }

    // Update total ETF count in the hint
    etfCountEl.textContent = data.results?.total ?? knownTotal;
    knownTotal = data.results?.total ?? knownTotal;

    // Render results
    if (data.results?.smaPeriod) {
      currentSmaPeriod = data.results.smaPeriod;
      updateSmaLabels(currentSmaPeriod);
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
    btnScan.disabled    = false;
    btnRefresh.disabled = false;
  }
}

/* ── Event listeners ─────────────────────────────────────────────────────── */

btnScan.addEventListener('click', () => runScan(false));
btnRefresh.addEventListener('click', () => runScan(true));

smaPeriodInput.addEventListener('change', () => {
  try {
    const nextSma = getSelectedSmaPeriod();
    currentSmaPeriod = nextSma;
    updateSmaLabels(nextSma);
    setVisible(errorBanner, false);
  } catch (err) {
    errorMessage.textContent = err.message;
    setVisible(errorBanner, true);
  }
});

chkShowErrors.addEventListener('change', () => {
  // Rerender errors section visibility based on checkbox state
  const errorCount = parseInt(errorBadge.textContent) || 0;
  setVisible(errorsSection, chkShowErrors.checked && errorCount > 0);
});

/* ── Initialisation ──────────────────────────────────────────────────────── */

// Show the total ETF count once the page loads (fetched from etfList length)
// We reveal it from the API response; show a placeholder for now.
etfCountEl.textContent = knownTotal;
updateSmaLabels(currentSmaPeriod);
