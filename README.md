# InvestFinder – Multi-Provider ETF SMA Breakout Scanner

A locally running web app that scans ETFs from **iShares and Xtrackers** for **SMA breakout signals** (price crossing from below to above a selectable Simple Moving Average on a daily basis).

---

## Features

- 📈 Scans ETFs across multiple providers (currently iShares + Xtrackers)
- 🔢 Calculates selectable SMA periods (e.g. 20, 50, 100, 200) per ETF
- ✅ Detects breakout: `yesterday.close < yesterday.SMA(N)` **AND** `today.close > today.SMA(N)`
- 🔀 Detects SMA crossover: `SMA(y)` crosses `SMA(z)` from below within optional lookback window
- ⚡ In-memory caching for raw price history (6 h TTL) to avoid repeated Yahoo calls when SMA changes
- 💾 Persistente Yahoo-Preis-Datenbank in `src/data/provider-cache/yahoo-history-db.json`
- 🔄 Background-Synchronisierung beim Start: ETFs mit aeltestem `updatedAt` werden zuerst aktualisiert
- 🧊 Automatischer Cooldown bei Yahoo-Rate-Limit (HTTP 429) mit anschliessender Fortsetzung
- 🖥️ Live-Sync-Status im Frontend (inkl. Cooldown-Restzeit und Cache-Stand)
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

# Optional: run automated tests
npm test
```

Then open **http://localhost:3000** in your browser, choose SMA period + provider filter and click **"Scan starten"**.

The scan fetches ~420 days of daily price history for each ETF from Yahoo Finance and processes them in small batches with a short delay to stay within rate limits. A full scan typically takes **30–90 seconds**.

Beim Serverstart wird zusaetzlich ein Hintergrundprozess gestartet, der den persistenten Yahoo-Cache nach und nach aktualisiert.
Dieser Prozess priorisiert ETFs mit dem aeltesten Aktualisierungszeitpunkt und pausiert automatisch in eine Cooldown-Phase, falls Yahoo ein Rate-Limit signalisiert.

### Linux Launcher (klickbar)

Wenn du die App wie eine installierte Anwendung starten willst, gibt es einen Launcher mit sauberem Stop-Verhalten.

```bash
# 1) Launcher in Anwendungsmenue installieren
npm run install:linux-launcher

# 2) App starten (optional direkt per Terminal)
npm run start:launcher
```

Alternativ kannst du im Dateimanager `scripts/start-investfinder.sh` direkt starten.

Wichtig:

- Das Startskript oeffnet den Browser automatisch.
- Wenn das Launcher-Terminal geschlossen wird (oder `Strg+C`), wird der Node-Server automatisch gestoppt.

---

## Project Structure

```
InvestFinder/
├── server.js           # Express server – serves static files + /api/scan endpoint
├── src/
│   ├── analysis.js     # Scan orchestration, SMA validation, caching strategy
│   ├── dataService.js  # Yahoo Finance API calls (daily OHLCV data)
│   ├── yahooHistoryStore.js # Persistente Yahoo-Historie (JSON-Store)
│   ├── yahooHistoryUpdater.js # Hintergrund-Update mit Cooldown/Resume
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

Scans Instrumente fuer den gewaehlten Asset-Typ und gibt Treffer zurueck.

**Query Parameters:**

| Param | Values | Description |
|-------|--------|-------------|
| `cache` | `false` | Bypass in-memory cache and force a fresh scan |
| `assetClass` | `etf`, `dax40` | Asset-Typ (default: `etf`) |
| `sma` | `20`, `50`, `100`, `200`, ... | SMA period for `price-breakout` mode (integer > 1, max 400; default: 200) |
| `fastSma` | `20`, `50`, ... | Fast SMA period for `sma-crossover` mode (optional; must be used together with `slowSma`) |
| `slowSma` | `50`, `100`, `200`, ... | Slow SMA period for `sma-crossover` mode (optional; must be used together with `fastSma`) |
| `lookbackDays` | `0`..`365` | Lookback period in days (default: `0`) |
| `lookbackWeeks` | `0`..`52` | Alternative lookback in weeks (converted to days internally) |
| `provider` | `all`, `ishares`, `xtrackers` | Provider filter (default: `all`) |

**Response:**

```jsonc
{
  "ok": true,
  "scannedAt": "2025-01-15T08:30:00.000Z",
  "results": {
    "assetClass": "etf",
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

### `GET /api/yahoo-sync-status`

Liefert den Status der Hintergrund-Synchronisierung inklusive Cooldown-Status und Cache-Zusammenfassung.

Beispiel:

```jsonc
{
  "ok": true,
  "status": {
    "running": true,
    "isCoolingDown": false,
    "cooldownRemainingMs": 0,
    "processedTickers": 42,
    "rateLimitHits": 1,
    "lastTicker": "IWDA.AS"
  },
  "summary": {
    "tickerCount": 120,
    "totalPoints": 35640,
    "oldestUpdate": "2026-04-05T10:00:00.000Z",
    "newestUpdate": "2026-04-06T08:12:00.000Z"
  },
  "checkedAt": "2026-04-06T08:12:05.000Z"
}
```

### `GET /api/available-instruments`

Liefert die Liste der Instrumente, fuer die in der lokalen Yahoo-Datenbank bereits Kursdaten vorhanden sind.

Optionaler Query-Parameter:

- `provider=all|ishares|xtrackers` (Default: `all`)
- `assetClass=etf|dax40` (Default: `etf`)

Legacy-Alias (rueckwaertskompatibel):

- `GET /api/available-etfs`

Beispiel:

```jsonc
{
  "ok": true,
  "assetClass": "etf",
  "providerFilter": "all",
  "count": 11,
  "items": [
    {
      "provider": "iShares",
      "ticker": "IWDA.AS",
      "name": "iShares Core MSCI World UCITS ETF",
      "isin": "IE00B4L5Y983",
      "wkn": "A0RPWH",
      "points": 292,
      "firstDate": "2025-02-10",
      "lastDate": "2026-04-02",
      "updatedAt": "2026-04-06T10:20:00.000Z"
    }
  ],
  "listedAt": "2026-04-06T10:25:00.000Z"
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
- Die persistente Yahoo-Datenbank liegt lokal unter `src/data/provider-cache/yahoo-history-db.json` und wird fortlaufend erweitert/aktualisiert.
- Das Cooldown-Intervall ist ueber `YAHOO_COOLDOWN_MS` konfigurierbar (Default: 60000 ms).
- Instrument universes are cached **separately per provider** and then merged internally; this avoids unnecessary reloads and makes provider-level scaling easy.
- Bei SMA-Aenderungen werden vorhandene Kursdaten aus dem lokalen Cache wiederverwendet. Dadurch sind Folgescans (anderes N) deutlich schneller und vermeiden unnoetige API-Calls.
- Duplicate entries are prevented during merge via unique identity (ISIN first, fallback provider+ticker).
- ISIN wird beim Laden validiert (`^[A-Z0-9]{12}$`), um fehlerhafte Stammdaten auszufiltern.
- Some UCITS ETF tickers (e.g. `IWDA.AS`, `CSPX.L`) may occasionally return no data if Yahoo Finance has a data gap. These appear in the "Fehlerhafte ETFs" section.
- **This app is for informational purposes only and does not constitute financial advice.**
