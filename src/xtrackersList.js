/**
 * src/xtrackersList.js
 * Statische Xtrackers ETF-Quelle (Ticker, Name, ISIN, optionale WKN).
 *
 * Quelle: oeffentliche Xtrackers Produktseiten / Factsheets.
 * Hinweis: Ticker koennen je Handelsplatz variieren.
 */

'use strict';

const XTRACKERS_ETFS = [
  {
    provider: 'Xtrackers',
    ticker: 'XDWD.DE',
    name: 'Xtrackers MSCI World UCITS ETF 1C',
    isin: 'IE00BJ0KDQ92',
    wkn: 'A1XB5U',
  },
  {
    provider: 'Xtrackers',
    ticker: 'XMME.DE',
    name: 'Xtrackers MSCI Emerging Markets UCITS ETF 1C',
    isin: 'IE00BTJRMP35',
    wkn: 'A12GVR',
  },
  {
    provider: 'Xtrackers',
    ticker: 'XDAX.DE',
    name: 'Xtrackers DAX UCITS ETF 1C',
    isin: 'LU0274211480',
    wkn: 'DBX1DA',
  },
  {
    provider: 'Xtrackers',
    ticker: 'XESC.DE',
    name: 'Xtrackers EURO STOXX 50 UCITS ETF 1C',
    isin: 'LU0380865021',
    wkn: 'DBX1EU',
  },
  {
    provider: 'Xtrackers',
    ticker: 'XNAS.DE',
    name: 'Xtrackers NASDAQ 100 UCITS ETF 1C',
    isin: 'IE00BMFKG444',
    wkn: 'A2N6RV',
  },
  {
    provider: 'Xtrackers',
    ticker: 'XDWS.DE',
    name: 'Xtrackers MSCI World ESG UCITS ETF 1C',
    isin: 'IE00BZ02LR44',
    wkn: null,
  },
];

module.exports = XTRACKERS_ETFS;
