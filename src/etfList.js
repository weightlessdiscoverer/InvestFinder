/**
 * src/etfList.js
 * Static list of iShares ETFs with their Yahoo Finance ticker symbols.
 * Each entry contains: ticker, name.
 *
 * Sources: iShares product pages (blackrock.com/ishares).
 * Covers major global, regional, sector, bond and thematic ETFs.
 */

'use strict';

const ISHARES_ETFS = [
  // ── Global / World ──────────────────────────────────────────────────────────
  { ticker: 'IWDA.AS',  name: 'iShares Core MSCI World UCITS ETF' },
  { ticker: 'SWDA.L',   name: 'iShares Core MSCI World UCITS ETF (GBP)' },
  { ticker: 'IWDA.L',   name: 'iShares Core MSCI World UCITS ETF (USD Dist)' },
  { ticker: 'URTH',     name: 'iShares MSCI World ETF (USD)' },
  { ticker: 'ACWI',     name: 'iShares MSCI ACWI ETF' },
  { ticker: 'ACWX',     name: 'iShares MSCI ACWI ex US ETF' },
  { ticker: 'ISAC.L',   name: 'iShares Core MSCI ACWI UCITS ETF' },

  // ── USA ─────────────────────────────────────────────────────────────────────
  { ticker: 'IVV',      name: 'iShares Core S&P 500 ETF' },
  { ticker: 'IWB',      name: 'iShares Russell 1000 ETF' },
  { ticker: 'IWM',      name: 'iShares Russell 2000 ETF' },
  { ticker: 'IJH',      name: 'iShares Core S&P Mid-Cap ETF' },
  { ticker: 'IJR',      name: 'iShares Core S&P Small-Cap ETF' },
  { ticker: 'IWF',      name: 'iShares Russell 1000 Growth ETF' },
  { ticker: 'IWD',      name: 'iShares Russell 1000 Value ETF' },
  { ticker: 'ITOT',     name: 'iShares Core S&P Total US Stock Market ETF' },
  { ticker: 'IYY',      name: 'iShares Dow Jones US ETF' },

  // ── Europe ──────────────────────────────────────────────────────────────────
  { ticker: 'IMEU.AS',  name: 'iShares Core MSCI Europe UCITS ETF' },
  { ticker: 'IEUR',     name: 'iShares Core MSCI Europe ETF' },
  { ticker: 'IEV',      name: 'iShares Europe ETF' },
  { ticker: 'EZU',      name: 'iShares MSCI Eurozone ETF' },
  { ticker: 'EWG',      name: 'iShares MSCI Germany ETF' },
  { ticker: 'EWU',      name: 'iShares MSCI United Kingdom ETF' },
  { ticker: 'EWQ',      name: 'iShares MSCI France ETF' },
  { ticker: 'EWI',      name: 'iShares MSCI Italy ETF' },
  { ticker: 'EWP',      name: 'iShares MSCI Spain ETF' },
  { ticker: 'EWD',      name: 'iShares MSCI Sweden ETF' },
  { ticker: 'EWN',      name: 'iShares MSCI Netherlands ETF' },
  { ticker: 'EWL',      name: 'iShares MSCI Switzerland ETF' },
  { ticker: 'DJSC.L',   name: 'iShares EURO STOXX Small Cap UCITS ETF' },

  // ── Emerging Markets ────────────────────────────────────────────────────────
  { ticker: 'IEMG',     name: 'iShares Core MSCI Emerging Markets ETF' },
  { ticker: 'EEM',      name: 'iShares MSCI Emerging Markets ETF' },
  { ticker: 'EEMS',     name: 'iShares MSCI Emerging Markets Small-Cap ETF' },
  { ticker: 'EWZ',      name: 'iShares MSCI Brazil ETF' },
  { ticker: 'EWJ',      name: 'iShares MSCI Japan ETF' },
  { ticker: 'FXI',      name: 'iShares China Large-Cap ETF' },
  { ticker: 'MCHI',     name: 'iShares MSCI China ETF' },
  { ticker: 'INDA',     name: 'iShares MSCI India ETF' },
  { ticker: 'EWY',      name: 'iShares MSCI South Korea ETF' },
  { ticker: 'EWA',      name: 'iShares MSCI Australia ETF' },
  { ticker: 'EWT',      name: 'iShares MSCI Taiwan ETF' },
  { ticker: 'EWC',      name: 'iShares MSCI Canada ETF' },
  { ticker: 'EIDO',     name: 'iShares MSCI Indonesia ETF' },
  { ticker: 'EPOL',     name: 'iShares MSCI Poland ETF' },
  { ticker: 'ECH',      name: 'iShares MSCI Chile ETF' },
  { ticker: 'EWW',      name: 'iShares MSCI Mexico ETF' },

  // ── Asia-Pacific ────────────────────────────────────────────────────────────
  { ticker: 'IAPD.L',   name: 'iShares Core MSCI Pacific ex-Japan UCITS ETF' },
  { ticker: 'AAXJ',     name: 'iShares MSCI All Country Asia ex Japan ETF' },
  { ticker: 'IPAC',     name: 'iShares Core MSCI Pacific ETF' },

  // ── Sectors (US) ────────────────────────────────────────────────────────────
  { ticker: 'IYW',      name: 'iShares US Technology ETF' },
  { ticker: 'IYH',      name: 'iShares US Healthcare ETF' },
  { ticker: 'IYF',      name: 'iShares US Financials ETF' },
  { ticker: 'IYE',      name: 'iShares US Energy ETF' },
  { ticker: 'IYC',      name: 'iShares US Consumer Discretionary ETF' },
  { ticker: 'IYK',      name: 'iShares US Consumer Staples ETF' },
  { ticker: 'IYJ',      name: 'iShares US Industrials ETF' },
  { ticker: 'IYM',      name: 'iShares US Basic Materials ETF' },
  { ticker: 'IDU',      name: 'iShares US Utilities ETF' },
  { ticker: 'IYR',      name: 'iShares US Real Estate ETF' },
  { ticker: 'IYZ',      name: 'iShares US Telecommunications ETF' },
  { ticker: 'SOXX',     name: 'iShares Semiconductor ETF' },
  { ticker: 'IGV',      name: 'iShares Expanded Tech-Software Sector ETF' },
  { ticker: 'IBB',      name: 'iShares Biotechnology ETF' },
  { ticker: 'IAT',      name: 'iShares US Regional Banks ETF' },

  // ── Bonds (US) ──────────────────────────────────────────────────────────────
  { ticker: 'AGG',      name: 'iShares Core US Aggregate Bond ETF' },
  { ticker: 'TLT',      name: 'iShares 20+ Year Treasury Bond ETF' },
  { ticker: 'IEF',      name: 'iShares 7-10 Year Treasury Bond ETF' },
  { ticker: 'SHY',      name: 'iShares 1-3 Year Treasury Bond ETF' },
  { ticker: 'LQD',      name: 'iShares iBoxx $ Investment Grade Corporate Bond ETF' },
  { ticker: 'HYG',      name: 'iShares iBoxx $ High Yield Corporate Bond ETF' },
  { ticker: 'MBB',      name: 'iShares MBS ETF' },
  { ticker: 'TIP',      name: 'iShares TIPS Bond ETF' },
  { ticker: 'GOVT',     name: 'iShares US Treasury Bond ETF' },
  { ticker: 'IGIB',     name: 'iShares Intermediate-Term Corporate Bond ETF' },

  // ── Bonds (Global / UCITS) ──────────────────────────────────────────────────
  { ticker: 'IGLO.L',   name: 'iShares Core Global Aggregate Bond UCITS ETF' },
  { ticker: 'SEMB.L',   name: 'iShares J.P. Morgan EM Bond UCITS ETF' },
  { ticker: 'IBTS.L',   name: 'iShares $ Treasury Bond 1-3yr UCITS ETF' },
  { ticker: 'IDTM.L',   name: 'iShares $ Treasury Bond 20+yr UCITS ETF' },
  { ticker: 'EUNH.DE',  name: 'iShares Core Euro Government Bond UCITS ETF' },
  { ticker: 'IBCI.AS',  name: 'iShares € Inflation Linked Govt Bond UCITS ETF' },
  { ticker: 'LQDE.L',   name: 'iShares $ Corp Bond UCITS ETF' },
  { ticker: 'IHYG.L',   name: 'iShares $ High Yield Corp Bond UCITS ETF' },

  // ── Thematic / Factor ───────────────────────────────────────────────────────
  { ticker: 'IQQH.DE',  name: 'iShares Global Clean Energy UCITS ETF' },
  { ticker: 'ICLN',     name: 'iShares Global Clean Energy ETF' },
  { ticker: 'IGF',      name: 'iShares Global Infrastructure ETF' },
  { ticker: 'WOOD',     name: 'iShares Global Timber & Forestry ETF' },
  { ticker: 'FILL',     name: 'iShares MSCI Global Energy Producers ETF' },
  { ticker: 'IQQW.DE',  name: 'iShares MSCI World Quality Factor UCITS ETF' },
  { ticker: 'IWMO.L',   name: 'iShares Edge MSCI World Momentum Factor UCITS ETF' },
  { ticker: 'IWVL.L',   name: 'iShares Edge MSCI World Value Factor UCITS ETF' },
  { ticker: 'IWQU.L',   name: 'iShares Edge MSCI World Quality Factor UCITS ETF' },
  { ticker: 'MVOL.L',   name: 'iShares Edge MSCI World Minimum Volatility UCITS ETF' },
  { ticker: 'SIZE',     name: 'iShares MSCI USA Size Factor ETF' },
  { ticker: 'VLUE',     name: 'iShares MSCI USA Value Factor ETF' },
  { ticker: 'MTUM',     name: 'iShares MSCI USA Momentum Factor ETF' },
  { ticker: 'QUAL',     name: 'iShares MSCI USA Quality Factor ETF' },
  { ticker: 'USMV',     name: 'iShares MSCI USA Min Vol Factor ETF' },

  // ── Commodities ─────────────────────────────────────────────────────────────
  { ticker: 'IAU',      name: 'iShares Gold Trust' },
  { ticker: 'SLV',      name: 'iShares Silver Trust' },
  { ticker: 'CSPX.L',   name: 'iShares Core S&P 500 UCITS ETF (Acc)' },
  { ticker: 'CSNDX.L',  name: 'iShares Nasdaq 100 UCITS ETF' },
];

module.exports = ISHARES_ETFS;
