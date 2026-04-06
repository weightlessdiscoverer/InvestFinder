# InvestFinder – iShares ETF Golden Cross Scanner

A locally running web app that scans iShares ETFs for **SMA200 Golden Cross signals** (price crossing from below to above the 200-day Simple Moving Average on a daily basis).

---

## Features

- 📈 Scans ~100 iShares ETFs across global, regional, sector, bond and thematic categories
- 🔢 Calculates the 200-day SMA for each ETF using live data from Yahoo Finance
- ✅ Detects Golden Cross: `yesterday.close < yesterday.SMA200` **AND** `today.close > today.SMA200`
- ⚡ In-memory caching (6 h TTL) to avoid rate limits on repeated scans
- 🧾 Adds ETF identifiers per hit: **ISIN** and (if available) **WKN**
- 🗂️ Separate master-data layer with static ticker mapping + in-memory cache (24 h TTL)
- 🛡️ Robust mapping by full Yahoo ticker (incl. exchange suffix) and ISIN format validation
- 🖥️ Clean dark-mode UI with loading indicator, summary bar and sortable results table

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | Node.js + Express |
| Data API | Yahoo Finance (public, no API key required) |
| Frontend | Vanilla HTML / CSS / JavaScript |

---

## Requirements

- [Node.js](https://nodejs.org/) ≥ 18

---

## Setup & Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```

Then open **http://localhost:3000** in your browser and click **"Scan starten"**.

The scan fetches ~420 days of daily price history for each ETF from Yahoo Finance and processes them in small batches with a short delay to stay within rate limits. A full scan typically takes **30–90 seconds**.

---

## Project Structure

```
InvestFinder/
├── server.js           # Express server – serves static files + /api/scan endpoint
├── src/
│   ├── analysis.js     # SMA200 computation, Golden Cross detection, caching
│   ├── dataService.js  # Yahoo Finance API calls (daily OHLCV data)
│   ├── etfList.js      # Static list of ~100 iShares ETF tickers and names
│   ├── masterDataService.js  # Stammdaten-Layer (Ticker → ISIN/WKN), Validierung, Cache
│   ├── data/
│   │   └── etfMasterData.json # Statische Identifier-Quelle inkl. Herkunftsdokumentation
├── public/
│   ├── index.html      # Single-page UI
│   ├── style.css       # Dark-mode styling
│   └── app.js          # Frontend JavaScript (fetch, render, UI state)
├── package.json
└── README.md
```

---

## API

### `GET /api/scan`

Scans all iShares ETFs and returns matches.

**Query Parameters:**

| Param | Values | Description |
|-------|--------|-------------|
| `cache` | `false` | Bypass in-memory cache and force a fresh scan |

**Response:**

```jsonc
{
  "ok": true,
  "scannedAt": "2025-01-15T08:30:00.000Z",
  "results": {
    "total": 100,
    "scanned": 100,
    "matches": [
      {
        "ticker": "IWDA.AS",
        "name": "iShares Core MSCI World UCITS ETF",
        "isin": "IE00B4L5Y983",
        "wkn": "A0RPWH",
        "identifierSource": "iShares Core MSCI World UCITS ETF",
        "signal": true,
        "todayDate": "2025-01-15",
        "todayClose": 95.12,
        "todaySMA": 93.80,
        "yesterdayDate": "2025-01-14",
        "yesterdayClose": 93.50,
        "yesterdaySMA": 93.75
      }
    ],
    "errors": [
      { "ticker": "XYZ", "name": "...", "error": "No data for ticker XYZ" }
    ]
  }
}
```

---

## Golden Cross Logic

```
SMA200[i] = average(close[i-199], close[i-198], ..., close[i])

Signal fires when:
  close[yesterday] < SMA200[yesterday]
  AND
  close[today]     > SMA200[today]
```

---

## Notes

- Yahoo Finance is a **public, unofficial API** – no API key is required but it is subject to rate limits. The app processes ETFs in batches of 5 with a 300 ms delay to mitigate this.
- ISIN/WKN stammen aus `src/data/etfMasterData.json` (manuell gepflegte Stammdatenquelle). Wenn für einen ETF kein Eintrag vorhanden ist, liefert die API `"nicht verfügbar"`.
- Die Zuordnung erfolgt über den **vollständigen** Yahoo-Ticker (z. B. `IWDA.AS` vs. `IWDA.L`), um Verwechslungen zwischen Handelsplätzen/Regionen zu vermeiden.
- ISIN wird beim Laden validiert (`^[A-Z0-9]{12}$`). Ungültige Werte werden ignoriert und als `"nicht verfügbar"` ausgegeben.
- Some UCITS ETF tickers (e.g. `IWDA.AS`, `CSPX.L`) may occasionally return no data if Yahoo Finance has a data gap. These appear in the "Fehlerhafte ETFs" section.
- **This app is for informational purposes only and does not constitute financial advice.**
