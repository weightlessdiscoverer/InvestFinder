/**
 * src/sp500List.js
 * Statische Liste mit S&P 500-Einzelwerten (Yahoo-Ticker).
 * Quelle: https://en.wikipedia.org/wiki/List_of_S%26P_500_companies
 */

'use strict';

const SP500_STOCKS = [
  { provider: 'SP500', ticker: 'AAPL', name: 'Apple Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'MSFT', name: 'Microsoft Corporation', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'AMZN', name: 'Amazon.com Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'GOOGL', name: 'Alphabet Inc. Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'GOOG', name: 'Alphabet Inc. Class C', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'META', name: 'Meta Platforms Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'TSLA', name: 'Tesla Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'NVDA', name: 'NVIDIA Corporation', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'JPM', name: 'JPMorgan Chase & Co.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'JNJ', name: 'Johnson & Johnson', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'V', name: 'Visa Inc. Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'PG', name: 'Procter & Gamble Co.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'UNH', name: 'UnitedHealth Group Incorporated', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'HD', name: 'Home Depot Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'MA', name: 'Mastercard Incorporated Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'BAC', name: 'Bank of America Corp.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'PFE', name: 'Pfizer Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'KO', name: 'Coca-Cola Co.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'DIS', name: 'Walt Disney Co.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'ADBE', name: 'Adobe Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'NFLX', name: 'Netflix Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'CRM', name: 'Salesforce Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'XOM', name: 'Exxon Mobil Corporation', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'ABT', name: 'Abbott Laboratories', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'COST', name: 'Costco Wholesale Corporation', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'CMCSA', name: 'Comcast Corporation Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'AVGO', name: 'Broadcom Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'ACN', name: 'Accenture plc Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'TXN', name: 'Texas Instruments Incorporated', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'VZ', name: 'Verizon Communications Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'WMT', name: 'Walmart Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'INTC', name: 'Intel Corporation', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'QCOM', name: 'QUALCOMM Incorporated', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'HON', name: 'Honeywell International Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'IBM', name: 'International Business Machines Corporation', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'ORCL', name: 'Oracle Corporation', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'CSCO', name: 'Cisco Systems Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'AMD', name: 'Advanced Micro Devices Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'INTU', name: 'Intuit Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'NOW', name: 'ServiceNow Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'UBER', name: 'Uber Technologies Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'SPOT', name: 'Spotify Technology S.A.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'PYPL', name: 'PayPal Holdings Inc.', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'SQ', name: 'Block Inc. Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'ZM', name: 'Zoom Video Communications Inc. Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'SHOP', name: 'Shopify Inc. Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'PLTR', name: 'Palantir Technologies Inc. Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'COIN', name: 'Coinbase Global Inc. Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'RIVN', name: 'Rivian Automotive Inc. Class A', isin: '', wkn: '' },
  { provider: 'SP500', ticker: 'LCID', name: 'Lucid Group Inc.', isin: '', wkn: '' },
];

module.exports = SP500_STOCKS;