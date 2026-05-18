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

Oder alles auf einmal:

```bash
npm run build          # validate + data + site
```

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
