# patina-tariffs

Tarif-, Fonds-, Kredit- und Ratingdatenbank für tecis-Vermittler.
Git-versionierte JSON-Quelldaten, automatische Schema-Validierung.
Die iOS-App liest die generierte `tariffs.json` aus dem Root dieses Repos.

```
┌── Redaktion (PR im Repo)
│        │
│        ▼
│   GitHub Actions: validate (schema + cross-refs) → build
│        │
│        ▼
│   tariffs.json (Root, aus data/app/)                   ──► PatinaCharts iOS-App
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

1. Datei anlegen, z. B. `data/insurance/<id>.json`.
2. Lokal validieren: `npm run validate`.
3. Pull Request öffnen — CI prüft das Schema und Cross-Refs (Rating → Tarif).
4. Nach Merge aktualisiert `ios-bundle.yml` die `tariffs.json`, wenn sich `data/app/` geändert hat.

## Lokal entwickeln

```bash
npm install            # Validierungsdeps
npm run validate       # Schema-Check
npm run build:data     # baut dist/ (Smoke-Test, wird nicht veröffentlicht)
```

Oder alles auf einmal:

```bash
npm run build          # validate + data + site
```

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

`data/app/` ist bewusst getrennt von `data/funds/`: letzteres hat ein anderes
Schema (TER in Prozent statt als Anteil, keine Renditen, keine Kategorien) und
enthält nur noch den Fonds, auf den ein Override und ein Rating verweisen. Die
App liest ausschließlich `data/app/`.

`dist/tariffs.json` aus `npm run build:data` ist etwas anderes — das
Bundle fürs Web-Frontend. Nicht verwechseln.

### Beleg je Tarif

Tarife, deren Kosten aus dem Basisinformationsblatt (bzw. Muster-PIB bei
Basisrenten) stammen, tragen ein Feld `beleg`:

- `dokumente`: Blatt mit Art, Stand, Adresse, Abrufdatum und SHA-256. Das PDF
  selbst liegt nicht im Repo.
- `felder`: je belegtem Wert Dokument, Seite und Wortlaut der Kostenzeile.
- `pruefung`: der Musterfall des Blatts (Beitrag, Haltedauer, Rendite) mit den
  Vergleichswerten „Kosten insgesamt“ und jährliche Auswirkung.

`python3 scripts/blatt/nachrechnung.py` rechnet jeden Musterfall mit den
Tarifwerten nach und bricht ab, wenn das Ergebnis über die Toleranz vom Blatt
abweicht (Euro 15 %, RIY 0,15 Prozentpunkte). Die CI führt es bei jeder
Änderung unter `data/app/` aus. `build-ios.mjs` prüft die Form des Felds und
lässt es aus `tariffs.json` heraus; die App liest stattdessen `belegteFelder`
und `belegStand` (unten). Ein Wert kommt nur mit bestandener Nachrechnung in
den Tarif.

`beleg.vereinfachungen` (optional) hält bewusste Vereinfachungen fest, etwa
Mittelwert statt Staffel oder Spanne statt Einzelwert: eine nicht leere Liste
nicht leerer Texte, nur für Prüfer. Sie bleibt wie der übrige Beleg aus
`tariffs.json` heraus.

**Gestaffelte Beiträge.** `betaStaffel` ist eine Liste `{abJahr, rate}`. Die
erste Stufe beginnt bei Jahr 1, `abJahr` steigt streng, `rate` ist ein Anteil
zwischen 0 und 0,25. Im Vertragsjahr j gilt der Satz der letzten Stufe mit
`abJahr` ≤ j, und zwar nur für laufende Beiträge; ein Einmalbeitrag trägt
weiter `betaEinmalRate`. `betaRate` bleibt Pflicht und ist der
Mittelwert-Fallback für ältere App-Stände, die die Staffel ignorieren. Der
Build bricht ab, wenn `betaRate` außerhalb von kleinstem und größtem
Stufensatz liegt. Die Nachrechnung nutzt die Staffel ebenso.

**Was die App aus dem Beleg erhält.** Zwei Schlüssel setzt der Build selbst;
in einer Quelldatei unter `data/app/` sind sie verboten:

- `belegteFelder`: je belegtem Feld die Herkunft. Art `bib-laufend` und
  `bib-einmal` ergeben `bib`, `muster-pib` bleibt `muster-pib`,
  `fondsuebersicht` bleibt `fondsuebersicht`. Maßgeblich ist das Dokument,
  auf das `beleg.felder.<feld>.dokument` zeigt.
- `belegStand`: das jüngste Datum (TT.MM.JJJJ) unter den Blatt-Dokumenten
  `bib-laufend`, `bib-einmal` und `muster-pib`. Gezählt wird ein Datum am
  Textanfang von `stand` oder direkt hinter „Stand“ (auch „Stand:“ und „Stand
  Basisinformationsblatt:“); andere Daten im Text und ungültige Kalenderdaten
  zählen nicht, die Fondsübersicht auch nicht. Findet sich keins, warnt der
  Build und `belegStand` entfällt.

Tests: `node --test "scripts/*.test.mjs"` (Bundle-Skript) und
`python3 -I -m unittest discover -s scripts/blatt` (Nachrechnung).

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

## Mitwirken

- PRs willkommen — ein Tarif pro PR macht Reviews einfach.
- Datenquellen-Hinweise in der PR-Beschreibung sind nett (woher kommen die Konditionen?).
- Externe Ratings: nur Quellen mit klarer Methodik (F&B, Morningstar, Scope, Stiftung Warentest, Assekurata, Map-Report).

## Stack

- **Daten:** JSON-in-Git, JSON Schema 2020-12, ajv-Validierung
- **Auslieferung:** `tariffs.json` im Repo-Root, abgerufen über GitHub-Raw
