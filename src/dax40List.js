/**
 * src/dax40List.js
 * Statische Liste mit DAX40-Einzelwerten (Yahoo-Ticker auf Xetra/.DE).
 */

'use strict';

const DAX40_STOCKS = [
  { provider: 'DAX40', ticker: 'ADS.DE', name: 'adidas AG', isin: '', wkn: 'A1EWWW' },
  { provider: 'DAX40', ticker: 'AIR.DE', name: 'Airbus SE', isin: '', wkn: '938914' },
  { provider: 'DAX40', ticker: 'ALV.DE', name: 'Allianz SE', isin: '', wkn: '840400' },
  { provider: 'DAX40', ticker: 'BAS.DE', name: 'BASF SE', isin: '', wkn: 'BASF11' },
  { provider: 'DAX40', ticker: 'BAYN.DE', name: 'Bayer AG', isin: '', wkn: 'BAY001' },
  { provider: 'DAX40', ticker: 'BEI.DE', name: 'Beiersdorf AG', isin: '', wkn: '520000' },
  { provider: 'DAX40', ticker: 'BMW.DE', name: 'BMW AG', isin: '', wkn: '519000' },
  { provider: 'DAX40', ticker: 'BNR.DE', name: 'Brenntag SE', isin: '', wkn: 'A1DAHH' },
  { provider: 'DAX40', ticker: 'CBK.DE', name: 'Commerzbank AG', isin: '', wkn: 'CBK100' },
  { provider: 'DAX40', ticker: 'CON.DE', name: 'Continental AG', isin: '', wkn: '543900' },
  { provider: 'DAX40', ticker: '1COV.DE', name: 'Covestro AG', isin: '', wkn: '606214' },
  { provider: 'DAX40', ticker: 'DB1.DE', name: 'Deutsche Boerse AG', isin: '', wkn: '581005' },
  { provider: 'DAX40', ticker: 'DBK.DE', name: 'Deutsche Bank AG', isin: '', wkn: '514000' },
  { provider: 'DAX40', ticker: 'DHL.DE', name: 'DHL Group', isin: '', wkn: '555200' },
  { provider: 'DAX40', ticker: 'DTE.DE', name: 'Deutsche Telekom AG', isin: '', wkn: '555750' },
  { provider: 'DAX40', ticker: 'EOAN.DE', name: 'E.ON SE', isin: '', wkn: 'ENAG99' },
  { provider: 'DAX40', ticker: 'ENR.DE', name: 'Siemens Energy AG', isin: '', wkn: 'ENER6Y' },
  { provider: 'DAX40', ticker: 'FRE.DE', name: 'Fresenius SE & Co. KGaA', isin: '', wkn: '578560' },
  { provider: 'DAX40', ticker: 'FME.DE', name: 'Fresenius Medical Care AG', isin: '', wkn: '578580' },
  { provider: 'DAX40', ticker: 'HEI.DE', name: 'Heidelberg Materials AG', isin: '', wkn: '604700' },
  { provider: 'DAX40', ticker: 'HEN3.DE', name: 'Henkel AG & Co. KGaA', isin: '', wkn: '604843' },
  { provider: 'DAX40', ticker: 'HNR1.DE', name: 'Hannover Rueck SE', isin: '', wkn: '840221' },
  { provider: 'DAX40', ticker: 'IFX.DE', name: 'Infineon Technologies AG', isin: '', wkn: '623100' },
  { provider: 'DAX40', ticker: 'LIN.DE', name: 'Linde plc', isin: '', wkn: 'A2DSYC' },
  { provider: 'DAX40', ticker: 'MBG.DE', name: 'Mercedes-Benz Group AG', isin: '', wkn: '710000' },
  { provider: 'DAX40', ticker: 'MRK.DE', name: 'Merck KGaA', isin: '', wkn: '659990' },
  { provider: 'DAX40', ticker: 'MTX.DE', name: 'MTU Aero Engines AG', isin: '', wkn: 'A0D9PT' },
  { provider: 'DAX40', ticker: 'MUV2.DE', name: 'Muenchener Rueck AG', isin: '', wkn: '843002' },
  { provider: 'DAX40', ticker: 'P911.DE', name: 'Porsche AG', isin: '', wkn: 'PAG911' },
  { provider: 'DAX40', ticker: 'PAH3.DE', name: 'Porsche Automobil Holding SE', isin: '', wkn: 'PAH003' },
  { provider: 'DAX40', ticker: 'QIA.DE', name: 'QIAGEN N.V.', isin: '', wkn: 'A400D5' },
  { provider: 'DAX40', ticker: 'RHM.DE', name: 'Rheinmetall AG', isin: '', wkn: '703000' },
  { provider: 'DAX40', ticker: 'RWE.DE', name: 'RWE AG', isin: '', wkn: '703712' },
  { provider: 'DAX40', ticker: 'SAP.DE', name: 'SAP SE', isin: '', wkn: '716460' },
  { provider: 'DAX40', ticker: 'SART.DE', name: 'Sartorius AG', isin: '', wkn: '716563' },
  { provider: 'DAX40', ticker: 'SHL.DE', name: 'Siemens Healthineers AG', isin: '', wkn: 'SHL100' },
  { provider: 'DAX40', ticker: 'SIE.DE', name: 'Siemens AG', isin: '', wkn: '723610' },
  { provider: 'DAX40', ticker: 'SY1.DE', name: 'Symrise AG', isin: '', wkn: 'SYM999' },
  { provider: 'DAX40', ticker: 'VNA.DE', name: 'Vonovia SE', isin: '', wkn: 'A1ML7J' },
  { provider: 'DAX40', ticker: 'VOW3.DE', name: 'Volkswagen AG Vz.', isin: '', wkn: '766403' },
  { provider: 'DAX40', ticker: 'ZAL.DE', name: 'Zalando SE', isin: '', wkn: 'ZAL111' },
];

module.exports = DAX40_STOCKS;
