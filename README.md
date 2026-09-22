# patina-tariffs

Tarif-, Fonds-, Kredit- und Ratingdatenbank für tecis-Vermittler.
Git-versionierte JSON-Quelldaten, automatische Schema-Validierung,
statisch gebautes Web-Frontend im Stil eines Informers (Filter, Suche,
Detailseiten, Vergleich).

```
┌── Redaktion (PR im Repo)
│        │
│        ▼
│   GitHub Actions: validate (schema + cross-refs) → build
│        │
│        ▼
│   dist/tariffs.json + funds.json + insurance.json + …  ──► Konsumenten (API/Download)
│   web/dist/                                            ──► GitHub Pages (Informer-UI)
```

## Datenstruktur

```
data/
├── funds/<ISIN>.json                   # ETFs & Investmentfonds
├── insurance/
│   ├── life/<id>.json                  # Lebens- und Rentenversicherung
│   ├── occupational-disability/<id>.json   # BU
│   ├── health/<id>.json                # PKV / Beihilfe
│   └── property/<id>.json              # Sach, Haftpflicht
├── credit/
│   ├── mortgage/<id>.json              # Baufinanzierung
│   └── installment/<id>.json           # Ratenkredit
└── ratings/<id>.json                   # Franke & Bornberg, Morningstar, …
```

**Konvention:** Der Primärschlüssel ist gleich dem Dateinamen.
Für Fonds ist das die ISIN, für Tarife/Kredite/Ratings eine
kebab-case-ID (`alte-leipziger-secur-bu`).

## Schemas

Vier JSON Schemas (Draft 2020-12) in `schemas/`:

| Datei | Pflichtfelder |
|---|---|
| `fund.schema.json` | `isin`, `name`, `provider`, `assetClass`, `ter`, `currency`, `fundType`, `distribution` |
| `insurance.schema.json` | `id`, `category`, `provider`, `name` |
| `credit.schema.json` | `id`, `type`, `provider`, `name` |
| `rating.schema.json` | `id`, `source`, `targetType`, `targetId`, `rating`, `ratingDate` |

Schemas sind strikt (`additionalProperties: false`) — neue Felder müssen
erst ins Schema. Das verhindert stille Datendrift.

## Einen neuen Eintrag pflegen

1. Datei anlegen, z. B. `data/funds/IE00B4L5Y983.json`.
2. Lokal validieren: `npm run validate`.
3. Pull Request öffnen — CI prüft das Schema und Cross-Refs (Rating → Tarif).
4. Nach Merge baut die Action `dist/` und deployt die Site automatisch.

## Lokal entwickeln

```bash
npm install            # Validierungsdeps
npm run validate       # Schema-Check
npm run build:data     # baut dist/ + web/src/data/tariffs.json
npm --prefix web install
npm --prefix web run dev   # Astro-Devserver auf http://localhost:4321
```

### Marktdaten-Sync (EODHD)

`npm run sync:prices` zieht für jeden `data/funds/<ISIN>.json` per
[EODHD-API](https://eodhd.com):

- `latestPrice`, `latestPriceDate` (aus `/real-time`)
- `performance.{m1, m3, m6, ytd, y1, y3, y5, y10}` (berechnet aus `/eod`)
- `_eodhdSymbol` (gecachter ISIN → Symbol-Lookup)

```bash
EODHD_API_KEY=dein_key npm run sync:prices
```

Ohne API-Key überspringt das Skript still (Exit 0) — CI bricht nicht.
In GitHub liegt der Key als Secret `EODHD_API_KEY` und wird täglich
über `.github/workflows/sync.yml` ausgeführt.

**Optional — Fundamentals (NAV, Allokationen, Holdings, Yield):**

EODHD lizenziert Non-US-Fundamentals als separates Add-on. Mit reinem EOD-Plan
liefern XETRA-/EUFUND-ISINs auf `/fundamentals` ein `403`. Daher ist der
Fundamentals-Pull standardmäßig **deaktiviert**. Wenn dein Plan das Add-on
abdeckt, aktiviere ihn explizit:

```bash
EODHD_API_KEY=dein_key EODHD_FUNDAMENTALS=1 npm run sync:prices
```

Die Schema-Felder (`nav`, `sectorAllocation`, `countryAllocation`,
`topHoldings`, `yield`) bleiben im Schema und können manuell über den
Override-Layer befüllt werden, auch wenn der Sync sie nicht setzt.

Stammdaten (assetClass, currency, provider, …) bleiben unangetastet;
gesynced werden nur volatile Marktdaten und Allokationen.

Oder alles auf einmal:

```bash
npm run build          # validate + data + site
```

## Live-API-Proxy (Cloudflare Worker)

Für On-Demand-Abfragen mit aktueller Historie und CAGR-Berechnung lebt unter
`workers/proxy/` ein Cloudflare Worker. Er proxy't EODHD, cached die Antworten
serverseitig (Workers KV) und liefert normalisierte Vergleichsdaten an die
iOS-App.

```bash
cd workers/proxy
npm install
npm test           # Unit-Tests (CAGR, FutureValue, Normalisierung)
npx wrangler kv:namespace create CACHE     # ID in wrangler.toml eintragen
npx wrangler secret put EODHD_API_KEY
npm run deploy
```

Routes: `/api/history`, `/api/compare`. Details und iOS-Integrations-Skizze
in [`workers/proxy/README.md`](workers/proxy/README.md).

## PatinaCharts iOS-App

Die iOS-App holt sich **eine** Datei, direkt über GitHub-Raw:

```
https://raw.githubusercontent.com/nyko073006/patina-tariffs/main/tariffs.json
```

Damit das funktioniert, muss dieses Repo **öffentlich** sein. Solange es
privat ist, liefert Raw einen 404 und die App bleibt still auf ihrem
einkompilierten Stand — ohne sichtbaren Fehler.

### Wo die Daten liegen

| Pfad | Zweck |
|---|---|
| `data/app/funds/<ISIN>.json` | Fonds im App-Schema, ein Datensatz pro Datei |
| `data/app/tarife/<slug>.json` | Versicherungstarife im App-Schema |
| `tariffs.json` (Root) | generiert, committet — **das ist der Endpoint** |

`data/app/` ist bewusst getrennt von `data/funds/`: letzteres gehört dem
EODHD-Sync und hat ein anderes Schema (TER in Prozent statt als Anteil,
keine Renditen, keine Kategorien). Der Sync fasst `data/app/` nicht an.

`dist/tariffs.json` aus `npm run build:data` ist etwas anderes — das
Bundle fürs Web-Frontend. Nicht verwechseln.

### Quartals-Update einer Fondsrendite

1. Factsheet oder PRIIPs-KID der KVG ziehen (Wertentwicklung nach
   BVI-Methode — das ist die Quelle, auf die ein Berater im Protokoll
   verweisen kann; ein API-Kurs ist das nicht).
2. In `data/app/funds/<ISIN>.json` zwei Felder setzen:
   ```json
   "historischeBruttorendite": 0.0751,
   "historischePeriode": "15 Jahre (2011–2026)"
   ```
   `historischeBruttorendite` ist ein **Anteil**, nicht Prozent: 7,51 % = `0.0751`.
3. `npm run build:ios` — schreibt `tariffs.json` neu.
4. Committen und pushen. Die Berater haben den Wert binnen 24 Stunden
   (Cache-TTL in der App), ohne App-Update.

Auf `main` übernimmt das der Workflow `ios-bundle.yml` automatisch; in
einem PR prüft er nur, ob `tariffs.json` zum Stand von `data/app/` passt.

### Was der Build abfängt

`scripts/build-ios.mjs` bricht ab bei: unbekannten Kategorien (die App
würde solche Einträge über `compactMap` **still** verwerfen), kaputten
UUIDs oder ISINs, doppelten Schlüsseln, Prozent-statt-Anteil-Verwechslung
und wenn das Bundle schrumpfen würde (`--force` übergeht das). Warnungen
gibt es bei Renditen über 12 % p.a. und fehlenden WKNs.

Zusätzlich mergt die App einen Payload gegen ihren Bundle-Stand, statt
ihn zu ersetzen: der Endpoint kann ergänzen und aktualisieren, aber nie
löschen.

## Konsum durch Vermittler-Tools

Nach jedem Merge in `main` liegen die Datenbundles unter:

- `https://<pages-domain>/api/tariffs.json` — alles gebündelt
- `https://<pages-domain>/api/funds.json` — nur Fonds
- `https://<pages-domain>/api/insurance.json` — nur Versicherung
- `https://<pages-domain>/api/credit.json` — nur Kredit
- `https://<pages-domain>/api/index.json` — Manifest mit Hashes (für ETag-Caching)

Empfohlenes Konsum-Muster: `GET /api/index.json` 1×/Tag, bei
Hash-Änderung das relevante Bundle nachladen.

## Mitwirken

- PRs willkommen — ein Tarif pro PR macht Reviews einfach.
- Datenquellen-Hinweise in der PR-Beschreibung sind nett (woher kommen die Konditionen?).
- Externe Ratings: nur Quellen mit klarer Methodik (F&B, Morningstar, Scope, Stiftung Warentest, Assekurata, Map-Report).

## Stack

- **Daten:** JSON-in-Git, JSON Schema 2020-12, ajv-Validierung
- **Frontend:** Astro 5 (SSG), Tailwind CSS, Inter, Vanilla TS für Filter
- **Hosting:** GitHub Pages (Static), CDN-fronted
