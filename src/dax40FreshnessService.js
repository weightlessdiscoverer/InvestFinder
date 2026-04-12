/**
 * src/dax40FreshnessService.js
 * Regelmaessiger Aktualitaetscheck fuer die statische DAX40-Liste.
 *
 * Ablauf:
 * - Holt eine externe DAX-Zusammensetzung (Wikipedia EN/DE)
 * - Vergleicht gegen die lokale statische Liste (dax40List.js)
 * - Protokolliert Abweichungen (neu im Index / nicht mehr im Index)
 */

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const DAX40_STOCKS = require('./dax40List');
const { pruneTickerHistories } = require('./yahooHistoryStore');

const DAX40_LIST_FILE = path.join(__dirname, 'dax40List.js');

const WIKIPEDIA_DAX_URLS = [
  'https://en.wikipedia.org/wiki/DAX',
  'https://de.wikipedia.org/wiki/DAX',
];

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
};

const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const MIN_EXPECTED_DAX_COUNT = 30;

let checkIntervalHandle = null;
let checkInFlightPromise = null;

const status = {
  running: false,
  intervalMs: DEFAULT_CHECK_INTERVAL_MS,
  fetchTimeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
  autoUpdateEnabled: false,
  pruneHistoryEnabled: false,
  lastCheckedAt: null,
  lastOkAt: null,
  lastAutoUpdateAt: null,
  lastAutoUpdateResult: null,
  lastPruneAt: null,
  lastPruneResult: null,
  lastError: null,
  sourceUrl: null,
  localCount: getLocalTickers().length,
  remoteCount: null,
  mismatches: {
    missingInLocal: [],
    staleInLocal: [],
  },
  nextCheckAt: null,
};

function decodeHtmlEntities(text) {
  if (!text) return '';

  return text
    .replace(/&#160;|&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripHtml(raw) {
  return decodeHtmlEntities(String(raw || ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLocalTickers() {
  return Array.from(
    new Set(
      DAX40_STOCKS
        .map(item => String(item.ticker || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function toAscii(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeCompanyName(value) {
  return toAscii(String(value || ''))
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWikitables(html) {
  return String(html || '').match(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>[\s\S]*?<\/table>/gi) || [];
}

function extractRows(tableHtml) {
  return String(tableHtml || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
}

function extractCells(rowHtml) {
  const cells = [];
  const regex = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
  let match = regex.exec(rowHtml);
  while (match) {
    cells.push(stripHtml(match[1]));
    match = regex.exec(rowHtml);
  }
  return cells;
}

function findTickerColumnIndex(headerCells) {
  const normalized = headerCells.map(cell => String(cell || '').toLowerCase());

  return normalized.findIndex(cell => {
    return (
      cell.includes('ticker')
      || cell.includes('symbol')
      || cell.includes('kuerzel')
      || cell.includes('k\u00fcrzel')
      || cell.includes('boersenkuerzel')
      || cell.includes('b\u00f6rsenk\u00fcrzel')
    );
  });
}

function findCompanyColumnIndex(headerCells) {
  const normalized = headerCells.map(cell => String(cell || '').toLowerCase());

  return normalized.findIndex(cell => {
    return (
      cell.includes('company')
      || cell.includes('constituent')
      || cell.includes('name')
      || cell.includes('unternehmen')
      || cell.includes('firma')
      || cell.includes('bezeichnung')
    );
  });
}

function normalizeTickerCandidate(value) {
  const compact = String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim();

  if (!compact) return null;

  const symbolMatch = compact.match(/[A-Z0-9]{2,5}(?:\.DE)?/);
  if (!symbolMatch) return null;

  let symbol = symbolMatch[0];
  if (/^\d+$/.test(symbol)) return null;

  if (!symbol.endsWith('.DE')) {
    symbol = `${symbol}.DE`;
  }

  return symbol;
}

function extractDaxRecordsFromWikipediaHtml(html) {
  const tables = extractWikitables(html);

  for (const table of tables) {
    const rows = extractRows(table);
    if (rows.length < 10) continue;

    const headerRow = rows.find(row => /<th\b/i.test(row));
    if (!headerRow) continue;

    const headerCells = extractCells(headerRow);
    const tickerColumnIndex = findTickerColumnIndex(headerCells);
    const companyColumnIndex = findCompanyColumnIndex(headerCells);
    if (tickerColumnIndex < 0) continue;

    const records = [];

    for (const row of rows) {
      if (!/<td\b/i.test(row) && !/<th\b/i.test(row)) {
        continue;
      }
      const cells = extractCells(row);
      if (!cells.length || tickerColumnIndex >= cells.length) {
        continue;
      }

      const ticker = normalizeTickerCandidate(cells[tickerColumnIndex]);
      if (ticker) {
        const companyCell = companyColumnIndex >= 0 && companyColumnIndex < cells.length
          ? cells[companyColumnIndex]
          : '';
        const name = normalizeCompanyName(companyCell) || ticker.replace('.DE', '');
        records.push({ ticker, name });
      }
    }

    const uniqueByTicker = new Map();
    for (const record of records) {
      if (!uniqueByTicker.has(record.ticker)) {
        uniqueByTicker.set(record.ticker, record);
      }
    }

    const unique = Array.from(uniqueByTicker.values());
    if (unique.length >= MIN_EXPECTED_DAX_COUNT) {
      return unique;
    }
  }

  return [];
}

async function fetchDaxRecordsFromWikipedia({ timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  const errors = [];

  for (const sourceUrl of WIKIPEDIA_DAX_URLS) {
    try {
      const response = await fetch(sourceUrl, {
        headers: REQUEST_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const records = extractDaxRecordsFromWikipediaHtml(html);

      if (records.length >= MIN_EXPECTED_DAX_COUNT) {
        return { records, sourceUrl };
      }

      throw new Error(`Keine verwertbare DAX-Liste im Seiteninhalt gefunden (Ticker: ${records.length}).`);
    } catch (err) {
      errors.push(`${sourceUrl}: ${err.message}`);
    }
  }

  throw new Error(`DAX-Quelle nicht abrufbar. Details: ${errors.join(' | ')}`);
}

function compareTickerSets(localTickers, remoteTickers) {
  const local = new Set(localTickers);
  const remote = new Set(remoteTickers);

  const missingInLocal = remoteTickers.filter(ticker => !local.has(ticker)).sort();
  const staleInLocal = localTickers.filter(ticker => !remote.has(ticker)).sort();

  return { missingInLocal, staleInLocal };
}

function escapeJsString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildUpdatedDaxRecords(remoteRecords, localRecords = DAX40_STOCKS) {
  const localByTicker = new Map(
    localRecords.map(item => [String(item.ticker || '').trim().toUpperCase(), item])
  );

  return remoteRecords.map(remote => {
    const ticker = String(remote.ticker || '').trim().toUpperCase();
    const local = localByTicker.get(ticker);

    return {
      provider: 'DAX40',
      ticker,
      name: local?.name || normalizeCompanyName(remote.name) || ticker.replace('.DE', ''),
      isin: local?.isin || '',
      wkn: local?.wkn || '',
    };
  });
}

function buildDax40ListModuleContent(records, sourceUrl) {
  const header = [
    '/**',
    ' * src/dax40List.js',
    ' * Statische Liste mit DAX40-Einzelwerten (Yahoo-Ticker auf Xetra/.DE).',
    ` * Automatisch aktualisiert durch dax40FreshnessService (${new Date().toISOString()}).`,
    ` * Quelle: ${sourceUrl}`,
    ' */',
    '',
    "'use strict';",
    '',
    'const DAX40_STOCKS = [',
  ];

  const body = records.map(item => {
    return `  { provider: 'DAX40', ticker: '${escapeJsString(item.ticker)}', name: '${escapeJsString(item.name)}', isin: '${escapeJsString(item.isin || '')}', wkn: '${escapeJsString(item.wkn || '')}' },`;
  });

  const footer = [
    '];',
    '',
    'module.exports = DAX40_STOCKS;',
    '',
  ];

  return [...header, ...body, ...footer].join('\n');
}

async function writeDax40List(records, sourceUrl) {
  const content = buildDax40ListModuleContent(records, sourceUrl);
  const tmpFile = `${DAX40_LIST_FILE}.${process.pid}.${Date.now()}.tmp`;

  await fs.writeFile(tmpFile, content, 'utf8');
  await fs.rename(tmpFile, DAX40_LIST_FILE);
}

function applyUpdatedRecordsInMemory(records) {
  DAX40_STOCKS.splice(0, DAX40_STOCKS.length, ...records);
}

async function maybeAutoUpdateDaxList({ hasMismatch, remoteRecords, sourceUrl, staleTickers = [] }) {
  if (!hasMismatch) {
    return { updated: false, reason: 'already-up-to-date', prune: null };
  }

  if (!status.autoUpdateEnabled) {
    return { updated: false, reason: 'auto-update-disabled', prune: null };
  }

  const updatedRecords = buildUpdatedDaxRecords(remoteRecords, DAX40_STOCKS);

  await writeDax40List(updatedRecords, sourceUrl);
  applyUpdatedRecordsInMemory(updatedRecords);

  status.lastAutoUpdateAt = new Date().toISOString();
  status.lastAutoUpdateResult = {
    updated: true,
    count: updatedRecords.length,
    sourceUrl,
  };

  let pruneResult = {
    enabled: status.pruneHistoryEnabled,
    deletedTickers: [],
    skippedTickers: [],
  };

  if (status.pruneHistoryEnabled && staleTickers.length > 0) {
    const pruned = await pruneTickerHistories(staleTickers);
    pruneResult = {
      enabled: true,
      deletedTickers: pruned.deletedTickers,
      skippedTickers: pruned.skippedTickers,
    };

    status.lastPruneAt = new Date().toISOString();
    status.lastPruneResult = pruneResult;
  } else {
    status.lastPruneResult = {
      enabled: status.pruneHistoryEnabled,
      deletedTickers: [],
      skippedTickers: staleTickers,
    };
  }

  return {
    updated: true,
    count: updatedRecords.length,
    prune: pruneResult,
  };
}

async function runDax40FreshnessCheck({ timeoutMs = status.fetchTimeoutMs } = {}) {
  const localTickers = getLocalTickers();
  status.localCount = localTickers.length;

  const { records: remoteRecords, sourceUrl } = await fetchDaxRecordsFromWikipedia({ timeoutMs });
  const remoteTickers = remoteRecords.map(record => record.ticker);
  const mismatches = compareTickerSets(localTickers, remoteTickers);

  status.lastCheckedAt = new Date().toISOString();
  status.lastOkAt = status.lastCheckedAt;
  status.lastError = null;
  status.sourceUrl = sourceUrl;
  status.remoteCount = remoteTickers.length;
  status.mismatches = mismatches;

  const hasMismatch = mismatches.missingInLocal.length > 0 || mismatches.staleInLocal.length > 0;

  const autoUpdateResult = await maybeAutoUpdateDaxList({
    hasMismatch,
    remoteRecords,
    sourceUrl,
    staleTickers: mismatches.staleInLocal,
  });

  if (autoUpdateResult.updated) {
    status.localCount = autoUpdateResult.count;
    status.mismatches = {
      missingInLocal: [],
      staleInLocal: [],
    };
    console.warn(`[DAX40 Freshness] Lokale DAX-Liste wurde automatisch aktualisiert (${autoUpdateResult.count} Werte).`);
    if (autoUpdateResult.prune?.enabled && autoUpdateResult.prune.deletedTickers.length > 0) {
      console.warn(`[DAX40 Freshness] Yahoo-History bereinigt, entfernt: ${autoUpdateResult.prune.deletedTickers.join(', ')}`);
    }
  } else {
    status.lastAutoUpdateResult = {
      updated: false,
      reason: autoUpdateResult.reason,
      at: new Date().toISOString(),
    };
  }

  if (hasMismatch && !autoUpdateResult.updated) {
    console.warn('[DAX40 Freshness] Die lokale DAX-Liste ist nicht aktuell.');
    if (mismatches.missingInLocal.length > 0) {
      console.warn(`[DAX40 Freshness] Neu im Index (lokal fehlend): ${mismatches.missingInLocal.join(', ')}`);
    }
    if (mismatches.staleInLocal.length > 0) {
      console.warn(`[DAX40 Freshness] Lokal enthalten, aber extern nicht gefunden: ${mismatches.staleInLocal.join(', ')}`);
    }
    console.warn(`[DAX40 Freshness] Quelle: ${sourceUrl}`);
  } else {
    console.log(`[DAX40 Freshness] OK (${localTickers.length} Werte), Quelle: ${sourceUrl}`);
  }

  return {
    hasMismatch,
    autoUpdate: autoUpdateResult,
    ...mismatches,
    remoteCount: remoteTickers.length,
    localCount: autoUpdateResult.updated ? autoUpdateResult.count : localTickers.length,
    sourceUrl,
  };
}

function scheduleNextCheck() {
  status.nextCheckAt = new Date(Date.now() + status.intervalMs).toISOString();
}

async function runCheckSafely() {
  if (checkInFlightPromise) {
    return checkInFlightPromise;
  }

  checkInFlightPromise = runDax40FreshnessCheck({ timeoutMs: status.fetchTimeoutMs })
    .catch(err => {
      status.lastCheckedAt = new Date().toISOString();
      status.lastError = err.message;
      console.warn(`[DAX40 Freshness] Check fehlgeschlagen: ${err.message}`);
      return null;
    })
    .finally(() => {
      checkInFlightPromise = null;
      if (status.running) {
        scheduleNextCheck();
      }
    });

  return checkInFlightPromise;
}

function startDax40FreshnessChecker({
  intervalMs = DEFAULT_CHECK_INTERVAL_MS,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  autoUpdateEnabled = false,
  pruneHistoryEnabled = false,
} = {}) {
  const parsedIntervalMs = Number(intervalMs);
  const parsedTimeoutMs = Number(fetchTimeoutMs);

  if (!Number.isFinite(parsedIntervalMs) || parsedIntervalMs < 60_000) {
    throw new Error('DAX40 Freshness intervalMs muss >= 60000 sein.');
  }
  if (!Number.isFinite(parsedTimeoutMs) || parsedTimeoutMs < 1_000) {
    throw new Error('DAX40 Freshness fetchTimeoutMs muss >= 1000 sein.');
  }

  status.running = true;
  status.intervalMs = parsedIntervalMs;
  status.fetchTimeoutMs = parsedTimeoutMs;
  status.autoUpdateEnabled = Boolean(autoUpdateEnabled);
  status.pruneHistoryEnabled = Boolean(pruneHistoryEnabled);

  if (checkIntervalHandle) {
    return;
  }

  runCheckSafely();
  scheduleNextCheck();

  checkIntervalHandle = setInterval(() => {
    runCheckSafely();
  }, status.intervalMs);

  if (typeof checkIntervalHandle.unref === 'function') {
    checkIntervalHandle.unref();
  }
}

function stopDax40FreshnessChecker() {
  if (checkIntervalHandle) {
    clearInterval(checkIntervalHandle);
    checkIntervalHandle = null;
  }
  status.running = false;
  status.nextCheckAt = null;
}

function getDax40FreshnessStatus() {
  return {
    ...status,
    mismatches: {
      missingInLocal: [...status.mismatches.missingInLocal],
      staleInLocal: [...status.mismatches.staleInLocal],
    },
  };
}

module.exports = {
  startDax40FreshnessChecker,
  stopDax40FreshnessChecker,
  runDax40FreshnessCheck,
  getDax40FreshnessStatus,
  _internal: {
    decodeHtmlEntities,
    stripHtml,
    extractDaxRecordsFromWikipediaHtml,
    normalizeTickerCandidate,
    compareTickerSets,
    buildUpdatedDaxRecords,
    buildDax40ListModuleContent,
  },
};
