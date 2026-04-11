'use strict';

function sortInstrumentsByProviderThenTicker(a, b) {
  if (a.provider !== b.provider) {
    return a.provider.localeCompare(b.provider);
  }
  return a.ticker.localeCompare(b.ticker);
}

function buildAvailableInstrumentItem(record, etf, defaultAssetClass) {
  if (!etf) {
    return null;
  }

  return {
    assetClass: etf.assetClass || defaultAssetClass,
    provider: etf.provider,
    ticker: etf.ticker,
    name: etf.name,
    isin: etf.isin || 'nicht verfügbar',
    wkn: etf.wkn || 'nicht verfügbar',
    points: record.points,
    firstDate: record.firstDate,
    lastDate: record.lastDate,
    updatedAt: record.updatedAt,
    freshness: record.freshness,
    dataSource: 'Yahoo Finance',
  };
}

function computeEffectiveFreshness(items, fallbackFreshness, classifyFreshness) {
  const oldestItemUpdate = items
    .map(item => item.updatedAt)
    .filter(Boolean)
    .sort()[0] || null;

  return items.length > 0
    ? classifyFreshness(oldestItemUpdate)
    : fallbackFreshness;
}

function createTickerLookup(universe) {
  return new Map(universe.map(etf => [String(etf.ticker || '').toUpperCase(), etf]));
}

function createAvailableInstrumentsHandler({
  normalizeAssetClass,
  normalizeProviderFilter,
  listAvailableTickerRecords,
  getEtfUniverse,
  getStoreSummary,
  classifyFreshness,
}) {
  return async function handleAvailableInstruments(req, res) {
    try {
      const assetClass = normalizeAssetClass(req.query.assetClass ?? 'etf');
      const providerFilter = normalizeProviderFilter(req.query.provider ?? 'all');

      const [records, universe, summary] = await Promise.all([
        listAvailableTickerRecords(),
        getEtfUniverse({ providerFilter, bypassCache: false, assetClass }),
        getStoreSummary(),
      ]);

      const byTicker = createTickerLookup(universe);

      const items = records
        .map(record => buildAvailableInstrumentItem(record, byTicker.get(record.ticker), assetClass))
        .filter(Boolean)
        .sort(sortInstrumentsByProviderThenTicker);

      const effectiveFreshness = computeEffectiveFreshness(items, summary.freshness, classifyFreshness);

      res.json({
        ok: true,
        assetClass,
        providerFilter,
        count: items.length,
        freshness: effectiveFreshness,
        items,
        listedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  };
}

module.exports = {
  createAvailableInstrumentsHandler,
};
