# InvestFinder – Multi-Provider ETF SMA Breakout Scanner

A locally running web app that scans ETFs from **iShares and Xtrackers** for **SMA breakout signals** (price crossing from below to above a selectable Simple Moving Average on a daily basis).

---

## Features

- 📈 Scans ETFs across multiple providers (currently iShares + Xtrackers)
- 🔢 Calculates selectable SMA periods (e.g. 20, 50, 100, 200) per ETF
- ✅ Detects breakout: `yesterday.close < yesterday.SMA(N)` **AND** `today.close > today.SMA(N)`
- ⚡ In-memory caching for raw price history (6 h TTL) to avoid repeated Yahoo calls when SMA changes
- 🧾 Includes ETF master data per hit: **Provider**, **Ticker**, **Name**, **ISIN**, optional **WKN**
- 🗂️ Separate master-data layer with static ticker mapping + in-memory cache (24 h TTL)
- 🛡️ Robust mapping by full Yahoo ticker (incl. exchange suffix) and ISIN format validation
- 🧱 Modular provider architecture with separate source modules and merged processing layer
- 🖥️ UI filter for provider scope: **Alle**, **nur iShares**, **nur Xtrackers**

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

Then open **http://localhost:3000** in your browser, choose SMA period + provider filter and click **"Scan starten"**.

The scan fetches ~420 days of daily price history for each ETF from Yahoo Finance and processes them in small batches with a short delay to stay within rate limits. A full scan typically takes **30–90 seconds**.

---

## Project Structure

```
InvestFinder/
├── server.js           # Express server – serves static files + /api/scan endpoint
├── src/
│   ├── analysis.js     # Scan orchestration, SMA validation, caching strategy
│   ├── dataService.js  # Yahoo Finance API calls (daily OHLCV data)
│   ├── etfList.js      # iShares data source (provider-tagged ETF master data)
│   ├── xtrackersList.js # Xtrackers data source (provider-tagged ETF master data)
│   ├── etfUniverseService.js # Provider-specific caching + merge + deduplication
│   ├── indicators.js   # Technical indicators (currently: SMA)
│   ├── masterDataService.js  # Stammdaten-Layer (Ticker → ISIN/WKN), Validierung, Cache
│   ├── signals.js      # Breakout signal detection logic
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

Scans ETFs from selected providers and returns matches.

**Query Parameters:**

| Param | Values | Description |
|-------|--------|-------------|
| `cache` | `false` | Bypass in-memory cache and force a fresh scan |
| `sma` | `20`, `50`, `100`, `200`, ... | SMA period (integer > 1, max 400; default: 200) |
| `provider` | `all`, `ishares`, `xtrackers` | Provider filter (default: `all`) |

**Response:**

```jsonc
{
  "ok": true,
  "scannedAt": "2025-01-15T08:30:00.000Z",
  "results": {
    "providerFilter": "all",
    "total": 100,
    "scanned": 100,
    "matches": [
      {
        "provider": "iShares",
        "ticker": "IWDA.AS",
        "name": "iShares Core MSCI World UCITS ETF",
        "isin": "IE00B4L5Y983",
        "wkn": "A0RPWH",
        "identifierSource": "iShares Core MSCI World UCITS ETF",
        "smaPeriod": 50,
        "smaLabel": "SMA50",
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

## Breakout Logic

```
SMA(N)[i] = average(close[i-(N-1)], ..., close[i])

Signal fires when:
  close[yesterday] < SMA(N)[yesterday]
  AND
  close[today]     > SMA(N)[today]
```

---

## Notes

- Yahoo Finance is a **public, unofficial API** – no API key is required but it is subject to rate limits. The app processes ETFs in batches of 5 with a 300 ms delay to mitigate this.
- ETF universes are cached **separately per provider** and then merged internally; this avoids unnecessary reloads and makes provider-level scaling easy.
- Bei SMA-Aenderungen werden vorhandene Kursdaten aus dem lokalen Cache wiederverwendet. Dadurch sind Folgescans (anderes N) deutlich schneller und vermeiden unnoetige API-Calls.
- Duplicate entries are prevented during merge via unique identity (ISIN first, fallback provider+ticker).
- ISIN wird beim Laden validiert (`^[A-Z0-9]{12}$`), um fehlerhafte Stammdaten auszufiltern.
- Some UCITS ETF tickers (e.g. `IWDA.AS`, `CSPX.L`) may occasionally return no data if Yahoo Finance has a data gap. These appear in the "Fehlerhafte ETFs" section.
- **This app is for informational purposes only and does not constitute financial advice.**
