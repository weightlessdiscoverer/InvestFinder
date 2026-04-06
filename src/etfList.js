/**
 * src/etfList.js
 * Statische iShares ETF-Quelle (Ticker, Name, ISIN, optionale WKN).
 *
 * Quelle: oeffentliche iShares Produktseiten / Factsheets.
 * Hinweis: Ticker koennen je Handelsplatz variieren.
 */

'use strict';

const ISHARES_ETFS = [
  {
    provider: 'iShares',
    ticker: 'IWDA.AS',
    name: 'iShares Core MSCI World UCITS ETF',
    isin: 'IE00B4L5Y983',
    wkn: 'A0RPWH',
  },
  {
    provider: 'iShares',
    ticker: 'CSPX.L',
    name: 'iShares Core S&P 500 UCITS ETF (Acc)',
    isin: 'IE00B5BMR087',
    wkn: 'A0YEDG',
  },
  {
    provider: 'iShares',
    ticker: 'ISAC.L',
    name: 'iShares Core MSCI ACWI UCITS ETF',
    isin: 'IE00B6R52259',
    wkn: 'A1JMDF',
  },
  {
    provider: 'iShares',
    ticker: 'IVV',
    name: 'iShares Core S&P 500 ETF',
    isin: 'US4642872000',
    wkn: 'A0M63R',
  },
  {
    provider: 'iShares',
    ticker: 'EEM',
    name: 'iShares MSCI Emerging Markets ETF',
    isin: 'US4642872349',
    wkn: 'A0HGZT',
  },
  {
    provider: 'iShares',
    ticker: 'AGG',
    name: 'iShares Core US Aggregate Bond ETF',
    isin: 'US4642872265',
    wkn: 'A0Q2AA',
  },
];

module.exports = ISHARES_ETFS;
