# patina-tariffs-proxy

Cloudflare Worker als API-Proxy zwischen iOS-App und EODHD.

- Hält den `EODHD_API_KEY` serverseitig (nie im App-Binary)
- Cached EODHD-Responses in Workers KV (1× pro Tag pro Symbol, statt 1× pro Vertriebler)
- Liefert normalisierte CAGR + Endkapital-Prognosen für Fonds-Vergleiche
- Pure TypeScript, vitest-getestet (`npm test`)

## Routes

### `GET /api/history`

Roh-EOD-Reihe eines Instruments für n Jahre rückwärts.

```
GET /api/history?isin=IE00B4L5Y983&years=10
```

| Param | Pflicht | Default | Range |
|---|---|---|---|
| `isin` | ✓ | — | 12 Zeichen ISO 6166 |
| `years` |  | `10` | `0.1 … 30` |

Response 200:

```json
{
  "isin": "IE00B4L5Y983",
  "symbol": "IWDA.XETRA",
  "count": 2547,
  "series": [
    { "date": "2015-06-12", "close": 35.12 },
    …
  ]
}
```

### `GET /api/compare`

Holt zwei Reihen, schneidet sie auf den gemeinsamen Zeitraum zu, berechnet
historische CAGR pro Instrument und projiziert auf `years` mit Kosten.

```
GET /api/compare?isin1=LU0099574567&isin2=IE00B4L5Y983
  &capital=10000&years=10
  &costsAnnual1=0.015&costsAnnual2=0.0022
  &costsOneTime1=0.05&costsOneTime2=0
```

| Param | Pflicht | Default | Range | Bedeutung |
|---|---|---|---|---|
| `isin1` | ✓ | — | ISIN | Aktiver Fonds |
| `isin2` | ✓ | — | ISIN | Benchmark ETF |
| `capital` |  | `10000` | `1 … 1e8` | Anlagekapital in € |
| `years` |  | `10` | `0.1 … 50` | Prognose-Horizont |
| `costsAnnual1/2` |  | `0` | `0 … 0.2` | TER + lfd. Kosten als Dezimalzahl |
| `costsOneTime1/2` |  | `0` | `0 … 0.2` | Ausgabeaufschlag als Anteil von `capital` |

Response 200:

```json
{
  "inputs": { "isin1": "…", "isin2": "…", "capital": 10000, "years": 10, … },
  "overlap": {
    "from": "2015-04-01",
    "to": "2026-06-12",
    "years": 11.2,
    "tradingDays": 2832
  },
  "series": {
    "isin1": { "symbol": "FF…", "start": 12.34, "end": 21.87, "cagr": 0.0541, "futureValue": 15842.11 },
    "isin2": { "symbol": "IWDA.XETRA", "start": 35.12, "end": 78.91, "cagr": 0.0791, "futureValue": 21408.55 }
  }
}
```

Fehlercodes:

| Status | Fall |
|---|---|
| 400 | ISIN-Format ungültig, gleiche ISIN doppelt, Param außerhalb Range |
| 404 | EODHD findet kein Symbol zur ISIN |
| 422 | Keine Überlappung der Zeitreihen, oder Überlappung < 1 Jahr |
| 500 | `EODHD_API_KEY` nicht konfiguriert, oder Upstream-Fehler |

## Deploy

Voraussetzung: Cloudflare-Account, `wrangler login` erfolgt.

```bash
cd workers/proxy
npm install

# KV-Namespace für den Cache anlegen — die ID in wrangler.toml eintragen
npx wrangler kv:namespace create CACHE
# → "kv_namespaces": [{ "binding": "CACHE", "id": "abc123…" }]

# EODHD-Key als Secret (interaktiv, Wert wird nicht geloggt)
npx wrangler secret put EODHD_API_KEY

# Lokaler Dev-Server (Cache läuft gegen den Remote-KV)
npm run dev

# Production-Deploy
npm run deploy
# → https://patina-tariffs-proxy.<your-subdomain>.workers.dev
```

Die Worker-URL kommt in die iOS-App als Basis-URL der API-Aufrufe.

## Cache-Verhalten

- `symbol:{ISIN}` — TTL 30 Tage. Symbol-Lookup ist quasi-statisch, ein Hit pro
  Monat und ISIN reicht.
- `eod:{symbol}:{fromDate}` — TTL bis 04:00 UTC am nächsten Werktag. EODHD
  publiziert EOD-Kurse im Lauf des Folgetags morgens; Cache läuft kurz vorher
  ab, sodass der erste Request am neuen Tag einen frischen Pull macht und
  alle nachfolgenden bedient werden.

Bei 50 Vertrieblern × 1 Vergleich/Tag × 2 ISINs sind das **2 EODHD-Calls/Tag**
statt 100 — egal wie oft die App refresht wird.

## iOS-Integration (Skizze)

```swift
struct CompareInput: Codable {
  let isin1: String
  let isin2: String
  var capital: Double = 10_000
  var years: Double = 10                // Double — Spec erlaubt 0.1 … 50
  var costsAnnual1: Double = 0.015      // 1,5 % TER aktiver Fonds
  var costsAnnual2: Double = 0.0022     // 0,22 % TER ETF
  var costsOneTime1: Double = 0.05      // 5 % AA aktiver Fonds
  var costsOneTime2: Double = 0
  var minYears: Double? = nil           // optional — Server-Default ist 1
}

struct CompareResponse: Decodable {
  let inputs: CompareInput              // Codable ⇒ Decodable, kein Crash
  let overlap: Overlap
  let series: SeriesPair
  let warnings: [String]                // bei Datenbasis < 1 Jahr befüllt
  struct Overlap: Decodable {
    let from: String; let to: String
    let years: Double; let tradingDays: Int
  }
  struct SeriesPair: Decodable { let isin1: SeriesResult; let isin2: SeriesResult }
  struct SeriesResult: Decodable {
    let symbol: String; let start: Double; let end: Double
    let cagr: Double; let futureValue: Double
  }
}

enum APIError: LocalizedError {
  case server(status: Int, message: String)
  case network(URLError)
  case decoding(Error)

  var errorDescription: String? {
    switch self {
    case .server(_, let message): return message               // endnutzertauglich vom Worker
    case .network(let e): return "Netzwerkfehler: \(e.localizedDescription)"
    case .decoding: return "Antwort vom Server konnte nicht gelesen werden."
    }
  }

  static func fromResponse(data: Data, response: URLResponse) -> APIError {
    let status = (response as? HTTPURLResponse)?.statusCode ?? -1
    struct ServerError: Decodable { let error: String }
    let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.error
      ?? "Unbekannter Fehler (HTTP \(status))"
    return .server(status: status, message: message)
  }
}

func compare(_ input: CompareInput) async throws -> CompareResponse {
  var c = URLComponents(string: "https://patina-tariffs.<sub>.workers.dev/api/compare")!
  var items: [URLQueryItem] = [
    .init(name: "isin1", value: input.isin1),
    .init(name: "isin2", value: input.isin2),
    .init(name: "capital", value: String(input.capital)),
    .init(name: "years", value: String(input.years)),
    .init(name: "costsAnnual1", value: String(input.costsAnnual1)),
    .init(name: "costsAnnual2", value: String(input.costsAnnual2)),
    .init(name: "costsOneTime1", value: String(input.costsOneTime1)),
    .init(name: "costsOneTime2", value: String(input.costsOneTime2)),
  ]
  if let m = input.minYears { items.append(.init(name: "minYears", value: String(m))) }
  c.queryItems = items

  do {
    let (data, response) = try await URLSession.shared.data(from: c.url!)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
      throw APIError.fromResponse(data: data, response: response)
    }
    do {
      return try JSONDecoder().decode(CompareResponse.self, from: data)
    } catch {
      throw APIError.decoding(error)
    }
  } catch let e as URLError {
    throw APIError.network(e)
  }
}
```

Error-Handling-Hinweis: Bei 404 (ISIN nicht gefunden) oder 422 (Historie zu
kurz) den `APIError.server.message` direkt in die UI bringen — die Worker-
Texte sind endnutzertauglich formuliert (z. B. *„Datenbasis 0,42 Jahre <
minYears=0,5"*). Die `warnings`-Liste in der Erfolgs-Response gehört unter
das Chart als nicht-blockierender Hinweis.

## Tests

```bash
npm test           # einmalig
npm run test:watch # während Entwicklung
npm run typecheck  # tsc --noEmit
```

Math-Engine + Normalisierung sind pure functions, alle Edge-Cases (negative
CAGR, Overlap < 1 Jahr, Kosten > Kapital, NaN/Infinity) sind abgedeckt.
