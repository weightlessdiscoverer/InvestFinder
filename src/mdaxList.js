/**
 * src/mdaxList.js
 * Statische Liste mit MDAX-Einzelwerten (Yahoo-Ticker auf Xetra/.DE).
 * Quelle: https://en.wikipedia.org/wiki/MDAX
 */

'use strict';

const MDAX_STOCKS = [
  { provider: 'MDAX', ticker: 'AIXA.DE', name: 'Aixtron SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'AT1.DE', name: 'Aroundtown SA', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'NDA.DE', name: 'Aurubis AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'AG1.DE', name: 'AUTO1 Group SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'BC8.DE', name: 'Bechtle AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'BFSA.DE', name: 'Befesa S.A.', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'GBF.DE', name: 'Bilfinger SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'AFX.DE', name: 'Carl Zeiss Meditec AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'EVD.DE', name: 'CTS Eventim AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'DHER.DE', name: 'Delivery Hero SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'DWNI.DE', name: 'Deutsche Wohnen SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'DWS.DE', name: 'DWS Group GmbH & Co. KGaA', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'EVK.DE', name: 'Evonik Industries AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'EVT.DE', name: 'Evotec SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'FTK.DE', name: 'flatexDEGIRO AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'FRA.DE', name: 'Fraport AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'FNTN.DE', name: 'freenet AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'FPE3.DE', name: 'FUCHS SE Vz.', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'G1A.DE', name: 'GEA Group AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'GXI.DE', name: 'Gerresheimer AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'HLE.DE', name: 'HELLA GmbH & Co. KGaA', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'HFG.DE', name: 'HelloFresh SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'HAG.DE', name: 'HENSOLDT AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'HOT.DE', name: 'HOCHTIEF AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'BOSS.DE', name: 'HUGO BOSS AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'JEN.DE', name: 'Jenoptik AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'JUN3.DE', name: 'Jungheinrich AG Vz.', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'SDF.DE', name: 'K+S AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'KGX.DE', name: 'KION GROUP AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'KBX.DE', name: 'Knorr-Bremse AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'KRN.DE', name: 'Krones AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'LXS.DE', name: 'LANXESS AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'LEG.DE', name: 'LEG Immobilien SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'LHA.DE', name: 'Deutsche Lufthansa AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'NEM.DE', name: 'Nemetschek SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'NDX1.DE', name: 'Nordex SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'PUM.DE', name: 'PUMA SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'RAA.DE', name: 'RATIONAL AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'RDC.DE', name: 'Redcare Pharmacy N.V.', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'RRTL.DE', name: 'RTL Group S.A.', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'G24.DE', name: 'Scout24 SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'WAF.DE', name: 'Siltronic AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'SAX.DE', name: 'Stroeer SE & Co. KGaA', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'TEG.DE', name: 'TAG Immobilien AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'TLX.DE', name: 'Talanx AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'TMV.DE', name: 'TeamViewer SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'TKA.DE', name: 'thyssenkrupp AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: '8TRA.DE', name: 'TRATON SE', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'TUI1.DE', name: 'TUI AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'UTDI.DE', name: 'United Internet AG', isin: '', wkn: '' },
  { provider: 'MDAX', ticker: 'WCH.DE', name: 'Wacker Chemie AG', isin: '', wkn: '' },
];

module.exports = MDAX_STOCKS;
