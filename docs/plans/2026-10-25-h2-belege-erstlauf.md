> Plan zu Woche 3, Block B2 H2 "Belege, Erstlauf" (Branch `claude/h2-belege-erstlauf`, Repo `patina-tariffs`). Erstellt 25.10.2026 aus Strategieplan Stufe 1 (Vault, Abschnitte 4, 5/B2, 12.1), Handoff Woche 2 und Fehlerlog ab 17.10.2026. Zahlen in diesem Plan sind im Tarif-Repo (Stand `5579d0f`) und im iOS-Repo (`origin/main` `833ba23`) nachgezählt, nicht aus dem Strategieplan übernommen. Lead-Entscheidungen stehen unten; sie gehen dem Tasktext vor, bei Abweichung ist der Kopf maßgeblich (Fehlerlog 24.10.: Kopf nachträglich geändert, Tasktext nicht angeglichen). Wo ein Tasktext dem Kopf widerspricht, ist das ein Planfehler und zu melden, kein Stoppgrund.

# H2 Belege, Erstlauf: 10 neue Tarife, Pflicht-Schritt in validate.yml, Quote als Kennzahl — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Umsetzung und Fix-Runden macht `umsetzer`, Review `task-reviewer`.

**Goal:** (1) Die Selbstprüfung `scripts/blatt/nachrechnung.py` ist Pflicht-Schritt in `validate.yml` (heute nur in `ios-bundle.yml`). (2) Ein Werkzeug holt Blätter nur robots-konform (RFC 9309), nie per `curl`. (3) Die Belegquote erscheint als Kennzahl aus den Daten, nirgends hartkodiert. (4) Die ersten 10 unbelegten Tarife der Etappe-1-Reihenfolge werden bearbeitet; jeder, dessen Blatt beschaffbar, Zuordnung tragfähig und Nachrechnung grün ist, bekommt `beleg`. Alle anderen bleiben "nicht belegt" und stehen mit Grund in der Abschlussliste. Erwartet sind **3 bis 8** neue Belege, nicht 10 (siehe Inventur: 4 der 10 sind nur von Hand beschaffbar).

**Architecture:** Kein neues Schema. `beleg` (dokumente, felder, pruefung, optional vereinfachungen) und die Build-Prüfung in `scripts/build-ios.mjs` bestehen (Plan Blatt-Auslese, Etappe B, Build 33). Dieser Plan ergänzt Werkzeug, CI-Schritt, Kennzahl und Daten. `belegteFelder` und `belegStand` setzt der Build; in `data/app/` sind sie verboten. Blätter liegen nie im Repo, nur Adresse, Stand, SHA-256, Seite, Wortlaut.

**Tech Stack:** Python 3 (`unittest`, nur Standardbibliothek), Node 22 (`node --test`), GitHub Actions (`ubuntu-latest`), `pdftotext`/`markitdown` zum Lesen.

## Inventur (nachgezählt, 25.10.2026)

| Frage | Befund | Befehl |
| --- | --- | --- |
| Tarife live | **61** in `tariffs.json`, 61 Dateien in `data/app/tarife/` | `python3 -c "import json;print(len(json.load(open('tariffs.json'))['tarife']))"` und `ls data/app/tarife \| wc -l` |
| Fonds live | 70 | `python3 -c "import json;print(len(json.load(open('tariffs.json'))['fonds']))"` |
| Belegt (Feld `beleg` in der Quelle) | **10 von 61** | `grep -l '"beleg"' data/app/tarife/*.json \| wc -l` |
| Belegt im Bundle (`belegteFelder` und `belegStand`) | 10 und 10, deckungsgleich | `python3 -c "import json;t=json.load(open('tariffs.json'))['tarife'];print(sum('belegteFelder' in x for x in t),sum('belegStand' in x for x in t))"` |
| Kategorien | Klassische Versicherer 43, Sektor- & Top-Fonds 6, Nettotarife 5, Strukturvertrieb 4, Index-Police 3 | Zählung über `kategorie` |
| Bundle der App (iOS) | **56** Presets (nicht 61); die 5 Tarife ohne iOS-Preset: Continentale Fondsrente (Tarifname offen), HanseMerkur 2025S, Volkswohl FITTERY, Helvetia Sondertarif P, die Bayerische Nettotarif | `git -C <ios> show origin/main:Models/TarifPreset.swift` (Zählung der `static let ... = TarifPreset(`) |
| `tools/extract-pib.py` | Liegt **nicht** in diesem Repo, sondern im iOS-Repo (`tools/extract-pib.py`, 615 Zeilen). Es ist die alte Stufe 3 (Claude-API, Ausgabe `extracted-tarife-*.json` für `tools/merge-tariffs.py`, `needs_review`); es kennt **kein** `beleg`, kein `sha256`, kein `belegteFelder` (0 Treffer). Start mit `--help` geht (`anthropic` 0.100.0 vorhanden; unter `python3 -I` fehlt das Paket, weil `-I` das Benutzerverzeichnis ausblendet). Nicht für den Erstlauf geeignet. | `grep -c "beleg\|sha256\|belegteFelder" tools/extract-pib.py` ergibt 0 |
| Der Ausleser für Belege | `scripts/blatt/auslesen.py` (Claude-API, Zitat und Seite je Wert, Handwerte-Abgleich) liegt **nur** auf dem lokalen Branch `claude/blatt-auslese-a` (Commit `4d6d97d`, nicht gepusht, laut `docs/PLAN-blatt-auslese.md` nicht abgenommen), nicht auf `main`. Die 07.10.-Auslese lief über sechs Agenten mit Skripten im Vault (`Research/2026-10-07 BIB-Auslese/assets/skripte/`: `holen.py`, `nachrechnung.py`, `zitatpruefung.py`, `schreibe_belege.py`, `robots_nachpruefung.py`, `BRIEFING.md`). | `git branch --contains 4d6d97d`; `git ls-tree -r HEAD --name-only \| grep scripts/blatt` |
| `nachrechnung.py` | Liegt in diesem Repo (`scripts/blatt/nachrechnung.py`). **Probelauf 25.10.2026:** `python3 -I scripts/blatt/nachrechnung.py` ergibt 18 Musterfälle, 0 durchgefallen, EXIT=0, über alle 10 belegten Tarife. Aufruf: ohne Argumente alle Tarife unter `data/app/tarife` mit `beleg`, oder `... tarif.json ...`; Flags `--toleranz-euro` (0,15), `--toleranz-riy` (0,0015). | `python3 -I scripts/blatt/nachrechnung.py; echo EXIT=$?` |
| Tests des Werkzeugs | `python3 -I -m unittest discover -s scripts/blatt` ergibt **18** Tests, OK. `node --test "scripts/*.test.mjs"` ergibt **25** Tests, alle grün (Vorlauf `N0_py=18`, `N0_node=25`). | beide Befehle, Zahl aus der Ausgabe |
| `validate.yml` heute | Schema-Validierung und `build:data`-Smoke; **kein** Nachrechnungs-Schritt. `validate.mjs` kennt `data/app/` nicht. | `grep -n "app" scripts/validate.mjs` (kein Treffer); `.github/workflows/validate.yml` |
| Wo läuft die Nachrechnung heute | In `ios-bundle.yml`, Schritt "Selbstpruefung belegter Tarife" (Unittests plus `nachrechnung.py`), aber nur bei Änderungen an `data/app/**`, `scripts/**` oder (PR) `tariffs.json`; auf `main` pusht der Workflow danach `tariffs.json`. Die README behauptet "Die CI führt es bei jeder Änderung unter `data/app/` aus" und stimmt damit, aber nicht für `validate.yml`. | `sed -n 45,52p .github/workflows/ios-bundle.yml` |
| Umsatzgewicht | **Keine Datei in einem der beiden Repos oder im Vault führt Umsatzgewichte je Tarif** (Suche nach "Umsatz" mit Bezug auf Tarif, Preset, Anbieter: 0 Treffer). Die Reihenfolge unten nutzt deshalb den belegbaren Ersatz: Verwendung im iOS-Code (Default, Demo-Fälle, Golden, Tests), dann Kategorie. | siehe Priorisierung |

## Korrekturen gegenüber Strategieplan und Auftrag (übernommen)

| Aussage | Befund | Folge im Plan |
| --- | --- | --- |
| "Pro Tarif: Blatt holen, `tools/extract-pib.py`" (Strategieplan B2 H2) | Das Werkzeug gehört einer anderen Pipeline und erzeugt kein `beleg` (siehe Inventur). | Auslesen im Erstlauf: der Umsetzer liest das Blatt mit `pdftotext`/`markitdown` und trägt Wert, Seite, Wortlaut selbst ein (wie am 07.10.); jeder Wortlaut wird mit Task H2-2 gegen den Blatttext geprüft. `auslesen.py` ist Option (Offen Punkt 2). |
| "Blatt holen per `curl`" (Auftrag) | `curl` prüft `robots.txt` nicht; ein Hook blockt es in den Briefings ohnehin. Am 07.10. wurden mit dem Python-`robotparser` (kennt keine Wildcards) fünf PDFs trotz Sperre geladen. | Laden nur mit `holen.py` nach RFC 9309 (Task H2-2), mit Gegentests in beide Richtungen. Kein `curl`, `wget`, anderer User-Agent, Proxy oder Browser, um eine Sperre zu umgehen. |
| "Nachrechnung als Pflicht-Schritt in `validate.yml`, falls noch nicht so" | Noch nicht so; sie läuft aber schon in `ios-bundle.yml`. | Task H2-1: Schritt in `validate.yml`, der Schritt in `ios-bundle.yml` bleibt (er schützt den Commit von `tariffs.json`); Doppellauf kostet auf `ubuntu-latest` Sekunden (Lead-Entscheidung 3, Offen Punkt 9). |
| README nennt `nachrechnung.py` "bei jeder Änderung unter `data/app/`" in der CI | Stimmt nur für `ios-bundle.yml`. | H2-1 passt den Satz an. |
| iOS-Bundle: "2 von 56" belegt (Strategieplan) | Nicht Teil dieses Plans (H13). | Nur festhalten, dass das Bundle hinterherhinkt; keine Bundle-Arbeit, kein Golden-Eingriff. |
| Herkunftsmatrix (iOS `TarifHerkunftsMatrix.luecken`): Continentale, Helvetia, Barmenia/Gothaer "Lücken" | Im Tarif-Repo sind alle drei belegt; die Matrix bildet den iOS-Bundle-Stand ab. | Nichts zu tun in H2; Hinweis für H13. |

## Lead-Entscheidungen (vor Task 1 lesen)

1. **Etappe 1 = 30 belegte Tarife insgesamt**, davon 10 schon belegt, also **20 neue**. Der Erstlauf nimmt die ersten 10 der 20. (Strategieplan: "30 priorisierte Tarife", "Erfolg: mindestens 30 Tarife belegt", "Etappe 2: die übrigen rund 31". 30 plus 31 gleich 61 trägt nur diese Lesart.) Meint Nyko 30 neue, verlängert sich die Reihenfolge um Rang 31 bis 40; der Erstlauf bleibt gleich.
2. **Zuordnung vor Beleg.** Ein Beleg wird nur geschrieben, wenn Tarifname oder Tarifkürzel der App im Blatt (oder auf der Anbieterseite, die das Blatt verlinkt) wörtlich steht. Zuordnung "unsicher" ohne wörtliche Entsprechung: **kein Beleg**, Tarif bleibt "nicht belegt", Grund in der Abschlussliste. (07.10.: 35 von 61 Tarifnamen kommen in keinem Blatt vor.)
3. **Pflicht-Schritt in `validate.yml`, Schritt in `ios-bundle.yml` bleibt.**
4. **Werkzeug ins Repo.** `holen.py` kommt als `scripts/blatt/holen.py` mit Tests ins Repo (Code, kein Blatt). Grund: Das Vault-Skript ist nicht versioniert, und die robots-Regel ist die Stelle, an der es schon schiefging.
5. **Sperren gelten:** Tarife, deren Anbieter Data-Mining im Nutzungs- oder Impressumstext vorbehält (Allianz, Alte Leipziger, Swiss Life, AXA-Nutzungshinweis, laut Quellenliste vom 06.10.), und Pfade, die `robots.txt` sperrt (HDI-Brandportal, Swiss Life `/content/dam/de/documents/*`), lädt **kein Skript**. Ob Nyko das Blatt selbst im Browser laden und danach auslesen lassen darf, ist eine Rechtsfrage (§ 44b UrhG) und steht als **[Z]** offen (Offen Punkt 1). Bis dahin liegt der Tarif auf der Liste "wartet auf Nyko" und gilt als "nicht belegt".
6. **Toleranz** bleibt 15 % Euro und 0,15 Pp RIY (Frage 2 des Blatt-Plans offen). Mit der Verteilung nach dem Erstlauf (H2-14) wird neu vorgeschlagen, nicht still geändert.
7. **Kein Push, kein PR.** Commits lokal, ein Commit je Task.

## Sperrliste bis zum Bescheid (vor jedem Task lesen, vor dem Abschluss abhaken)

- [ ] 1. Kein Erstkontakt zu Beratern, Pools, Fahrschulen oder Agenturen; auch keine LinkedIn-Nachricht. **Auch kein Kontakt zu Versicherern** (Anbieterauskunft, Blattanfrage): Das wäre Erstkontakt; Anbieter-Anfragen nur über Nyko.
- [ ] 2. Keine Preise nach außen, kein Verkauf, kein Bezahlweg.
- [ ] 3. Keine Codes, keine Erstnutzer-Liste, kein Anmeldeformular.
- [ ] 4. Keine Demo-Videos.
- [ ] 5. Keine Rechnung, kein Vertrag, keine Zahlung, keine Gewerbeanmeldung.
- [ ] 6. Kein Studioname im Seitentext, keine Leitzeile, keine Produktwerbung, keine Ankündigung des Starts.
- [ ] 7. Keine KI versendet etwas. (Das gilt auch für den README-Abschnitt, der Berater erreichen könnte.)
- [ ] 8. Keine Supabase-Änderung ohne Ansage an Nyko; Migration 0011 nicht anwenden (hier nicht berührt).
- [ ] 9. Nichts an Stephen, keine TestFlight-Einladung, keine Frage nach einer Entscheiderliste.
- [ ] 10. Keine Interviews, kein Fünf-Sekunden-Test, keine Rekrutierungsliste vor der schriftlichen Antwort der Personalstelle.
- [ ] Release-Lauf oder Einreichung nur nach Ansage an Nyko (hier nicht berührt).
- [ ] Wettbewerber nur als "Wettbewerber W". Das Feld `quelle` bestehender Tarife sagt "externe Quelle"; neue Texte nennen den Namen nirgends. Vor jedem Commit `python3 scripts/check_wettbewerber_name.py --staged` (Skript liegt im iOS-Repo `origin/main:scripts/check_wettbewerber_name.py`; dieses Repo hat keins: Task H2-0 kopiert es **nicht** (enthält den Hash des Namens), sondern ruft es aus dem iOS-Worktree auf, `cd` ins Tarif-Repo, Skript per absolutem Pfad).
- [ ] Rechtsfragen als [Z] markiert, nicht entschieden (§ 44b UrhG, § 87b UrhG, Wortlaut-Zitate im öffentlichen Repo).
- [ ] Fremdmodelle (agy, codex) nur nach der Datengrenze aus `~/.claude/fremdmodelle/regeln.md`. Blatttexte sind öffentlich, Tarifwerte keine Mandantendaten; `agy` im Modus "prüfen" ist zulässig.
- [ ] Die Kalibrierdatei `~/tariffs-analysis.csv` (Werte von Wettbewerber W) wird nicht ins Repo gelegt, nicht gelesen, nicht als Beleg genutzt. (Sie liegt auf diesem Mac derzeit nicht unter `~/`.)

## Global Constraints

- Arbeitsverzeichnis ausschließlich `/Users/nyko/Developer/worktrees/tariffs-h2-erstlauf`, Branch `claude/h2-belege-erstlauf`. Jeder Shell-Befehl beginnt mit `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf`. Andere Tarif-Klone nicht anfassen (andere Sessions).
- **Blätter nie im Repo.** Heruntergeladene PDFs liegen je Tarif in einem **eigenen leeren Ordner** im Scratchpad (`<scratch>/blatt/<slug>/`), Skripte in einem anderen Ordner. Python über heruntergeladene Dateien nur mit `python3 -I`, Pfade als Argument (Regel für unvertraute Downloads). Nach dem Commit des Tarifs den Ordner löschen (Plan Blatt-Auslese, Ablauf 2: Zwischenkopien werden gelöscht); die SHA-256 steht im Beleg.
- **Neue Dateien in diesem Plan (genau diese):** `.github/workflows/validate.yml` ändert sich nur; neu sind `scripts/blatt/holen.py`, `scripts/blatt/test_holen.py`, `scripts/blatt/quote.py`, `scripts/blatt/test_quote.py`, `scripts/blatt/test_workflow.py`, `docs/plans/2026-10-25-h2-belege-erstlauf.md` (diese Datei). Python-Tests liegen in `scripts/blatt/` und werden von `unittest discover` gefunden; **kein `xcodegen`** in diesem Repo, aber dieselbe Falle gilt: Nach jeder neuen Testdatei die Testzahl gegen den Vorlauf vergleichen (Fehlerlog 28.09.: neue Tests, die nie liefen). `discover` findet nur `test*.py`.
- Testbefehle (Vorlauf `N0_py=18`, `N0_node=25`):

  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && python3 -I -m unittest discover -s scripts/blatt 2>&1 | tail -4; echo EXIT=$?`

  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && node --test "scripts/*.test.mjs" 2>&1 | grep -E "^ℹ (tests|pass|fail)"`

  Der Exit-Code der Unittests steht hinter der Pipe nicht mehr; deshalb `set -o pipefail` voranstellen oder `python3 -I -m unittest discover -s scripts/blatt > <scratch>/py.log 2>&1; echo EXIT=$?`.
- `npm ci` im Worktree vor `npm run validate` (es gibt keinen `node_modules`; Befund 25.10.: `npm ls` meldet UNMET DEPENDENCY). `build-ios.mjs` braucht nur Node-Builtins.
- TDD: erst Stub, dann Test, dann RED mit Assertion-Fehler (kein Importfehler), dann GREEN. Jeder Wächter bekommt (a) einen roten Test für "Vergleichsbasis fehlt / Scan leer" und (b) einen Gegentest in beide Richtungen (Fehlerlog 24.10., H11).
- Kein Wert, den man anders wollen könnte, fest verdrahtet: Toleranzen bleiben Flags mit Vorgabe; die Quote kommt aus den Daten.
- Commits lokal, je Task ein Commit. Jede Nachricht endet mit
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01GnB8eWDZ1WwVDR76RK5nX5`.
- GitHub-Actions-Regeln des Projekts (CLAUDE.md) gelten für den späteren Push: ein Push je fertigem Stand, kein Lauf zur Probe. Dieser Plan pusht nicht.
- Mutationsproben nur nach dem Commit, Rückbau per Edit, danach `git diff --exit-code -- <Datei>`; nie `git checkout` auf Dateien.

## Review Focus

1. **robots-Prüfung in beide Richtungen** (H2-2): ein Pfad, den die längste Regel erlaubt, wird erlaubt; ein Pfad, den sie sperrt, wird gesperrt; ohne `robots.txt` (404) erlaubt, bei 403 oder Verbindungsfehler **gesperrt** (nicht "erlaubt"). Pythons `robotparser` ist nicht zulässig (kennt keine Wildcards).
2. **Kein Beleg ohne tragfähige Zuordnung** (Entscheidung 2): Prüfen, dass bei jedem neuen Beleg der Produktname im Blatt steht (Wortlaut in `felder` oder `hinweis`).
3. **Wortlaut stimmt mit dem Blatt**: Jeder `wortlaut` ist im Blatttext auffindbar (Zitatprüfung, H2-2/Abschluss), Seitenzahl stimmt.
4. **Nachrechnung nicht weichgespült**: Toleranz unverändert; kein Musterfall erfunden; `annahmen` nur, wo das Blatt mit anderen Werten rechnet, und im `hinweis` erklärt. Die nominale Prüfung erkennt vertauschte α und β nicht (gleiche Summe): Lesart "% der kumulierten Anlage" ist α, "% der eingezahlten Anlage" ist β (Blatt-Plan, Lesart) gegen den Blattwortlaut prüfen.
5. **Staffel**: Tarife mit gestaffelten Sätzen (Signal Iduna β ab Jahr 11, Helvetia, Gothaer) nur mit `betaStaffel` (höchstens 2 Stufen, Build prüft) oder mit `beleg.vereinfachungen`; nie stilles Mitteln.
6. **Quote ist abgeleitet**, nicht eingetragen: `quote.py` zählt, `README` und Berichte nennen Zahl nur mit Stand und Befehl (H4 braucht sie).
7. **Kein Schreiben in `tariffs.json` von Hand.** Nur `npm run build:ios`.

## Priorisierung: die 30 Tarife der Etappe 1 (in Reihenfolge)

Regeln, in dieser Reihenfolge: (A) Presets, die im iOS-Code Default, Demo-Fall, Golden-Fall oder früheren Default tragen; (B) klassische Versicherer, Schicht 3 vor Basisrente, innerhalb davon Blatt öffentlich beschaffbar (Stand 07.10.) vor "von Hand"; (C) Netto- und Index-Tarife; (D) Sektor-Fonds zuletzt (alle sechs in Etappe 2). Die Regel "beschaffbar vor von Hand" innerhalb von (B) ist **meine** Ergänzung (Offen Punkt 3); der Strategieplan nennt nur die drei Gruppen.

Fundstellen zu (A), `origin/main` `833ba23` im iOS-Repo:
- `Tests/DemoFallTests.swift:312-317`: Berufsstarter und Erbe mit 89 tragen **HDI CleverInvest**, Depot-Sparer **Continentale EasyRente**, Einmalbetrag erbt `TarifPreset.default`.
- `Models/TarifPreset.swift` (am Ende): `static let default: TarifPreset = hdiCleverInvest`; `Tests/MarketingStoreBildTests.swift:1359-1428` benutzt HDI und Continentale für die Store-Bilder.
- `Tests/GoldenNumbersTests.swift:182` und `Tests/ErgebnisBrueckeTests.swift:44` rechnen mit **AXA JustInvest** (früherer Default bis 14.10.2026, `docs/DEMO-FAELLE.md` Abschnitt 5).
- **Swiss Life Maximo**: Default bis 29.09.2026 (`TarifPreset.swift`, Kommentar am Default), Tests `EntnahmeDuellTests.swift:65`, `GuenstigerpruefungTests.swift:262`, `EigeneDatenTariffStoreTests.swift:95`.
- **Allianz PrivatRente InvestFlex**: 6 Testverweise, größter Anbieter im Bestand.
- Zählung der Verweise je Preset außerhalb von `TarifPreset.swift` (Skript über `git archive origin/main`, Muster `.name` oder UUID): HDI 3 Quell- und 24 Testverweise, Continentale 3/20, Helvetia Allcase 1/21, Swiss Life Maximo 1/10, Allianz InvestFlex 1/6, AXA JustInvest 1/6; ab Rang 7 höchstens 5 Testverweise. (Quell-Verweise sind überwiegend die Herkunftsmatrix; sie unterscheiden nichts.)
- Auswirkung auf die App: **keine bis H13**. Die Tests laufen auf dem einkompilierten Stand (`docs/DEMO-FAELLE.md:88`: "Gemessen auf dem einkompilierten Tarifstand (Test-Host und Store-Pipeline)"; `Tests/DefaultTarifNeutralitaetTests.swift` setzt `tarifDatensatzAufBundleStand`). Ein neuer Beleg ändert `tariffs.json`, nicht das Bundle. H13 verschiebt dann die Golden-Werte von HDI (Default!), AXA, Swiss Life; das ist dort einzeln zu begründen.

**Bereits belegt (10), zählen zu den 30:** 1 Continentale EasyRente Invest RI (A, Demo Depot-Sparer), 2 Helvetia CleVesto Allcase (Staffel, mit vereinfachungen), 3 Barmenia/Gothaer FondsRente, 4 WWK Premium FondsRente 2.0 FV25, 5 Württembergische Genius FlexRente, 6 Volkswohl Bund FITTERY, 7 Baloise BasisRente Invest, 8 Nürnberger BasisRente Invest, 9 Universa BasisRente Invest, 10 WWK BasisRente FondsRente.

**Neu (20), Rang 11 bis 30. Rang 11 bis 20 sind der Erstlauf.** Spalte "Zugriff" = Befund der BIB-Auslese vom 07.10.2026 (Vault `Research/2026-10-07 BIB-Auslese`), Spalte "heute" = Prüfung 25.10.2026 (robots.txt nach RFC 9309 und HEAD auf die Blatt-URL, ohne Download).

| Rang | Tarif (ID-Ende) | Anbieter | Gruppe | Zugriff 07.10. | Zuordnung 07.10. |
| --- | --- | --- | --- | --- | --- |
| 11 | CleverInvest (…1…0005) | HDI | A Default, Demo, Store | manuell | wahrscheinlich |
| 12 | JustInvest Performance ALVF7 (…0003) | AXA | A Golden | manuell | unsicher |
| 13 | Maximo 710/714 (…0006) | Swiss Life | A früherer Default | manuell | wahrscheinlich |
| 14 | PrivatRente InvestFlex (…0002) | Allianz | A | manuell | wahrscheinlich |
| 15 | Invest FondsRente (…0032) | Baloise | B | geladen | unsicher |
| 16 | Vorsorge Plan FRV (…0012) | Volkswohl Bund | B | geladen | unsicher |
| 17 | SI Wachstum (…0017) | Signal Iduna | B | geladen | unsicher |
| 18 | FondsRente (…0015) | Nürnberger | B | geladen | wahrscheinlich |
| 19 | uni-FondsRente (…0036) | Universa | B | geladen | unsicher |
| 20 | Privatrente Best (…0020) | VHV | B | geladen | unsicher |
| 21 | performance+ FlexRente 73oG (…0004) | Stuttgarter | B | manuell | wahrscheinlich |
| 22 | AR25 Standard (…0009) | Alte Leipziger | B | manuell | wahrscheinlich |
| 23 | Rente Garantie (…0013) | ERGO | B | manuell | unsicher |
| 24 | Privatrente Comfort (…0019) | Generali | B | manuell | unsicher |
| 25 | BavariaDIREKT (…0011) | die Bayerische | B | teilweise | unsicher |
| 26 | FR10 Netto (…0008) | Alte Leipziger | C Netto | manuell | unsicher |
| 27 | Privat-Rente Online (…0024) | Cosmos Direkt | C Netto | geladen | unsicher |
| 28 | IndexInvest Premium (…0022) | R+V | C Index | geladen | unsicher |
| 29 | MeinPlan Nettotarif (…0031) | LV 1871 | C Netto | manuell | wahrscheinlich |
| 30 | IndexSelect Plus (…0021) | Allianz | C Index | manuell | wahrscheinlich |

Etappe 2 (31 Tarife, nicht in diesem Plan): alle Basisrenten ohne Beleg (Muster-PIB, Euro-Beträge; Blatt-Plan offene Frage 3), HanseMerkur (3), Condor (2), Stuttgarter alpha+ und Basisrenten, Standard Life Freelaxx (kein öffentliches Blatt, Anbieterauskunft nötig, wäre Erstkontakt: **gesperrt**), Continentale Fondsrente (Tarifname offen), Helvetia Sondertarif P, Bayerische Nettotarif und zuletzt die sechs Sektor-Fonds. Die Zählung "30 neue plus 10" wird nach dem Erstlauf an der Abschlussliste gemessen.

## Abrufbarkeit der Erstlauf-Blätter (Rang 11 bis 20, Prüfung 25.10.2026)

Prüfmethode: `robots.txt` der Domain nach RFC 9309 (längste Regel, Wildcards) gegen den Pfad, bei erlaubtem Pfad ein HEAD (kein Download, kein Blatt im Repo). Nur Anbieter-Domains, keine Vergleichsportale. Stand = Stand laut Blatt (aus der 07.10.-Auslese). "URL ja" heißt: öffentlich, robots-konform und am 25.10. mit HTTP 200 erreichbar.

| Rang | Tarif | URL ja/nein | Blatt (Anbieter-Domain) | Blattstand | Befund 25.10. |
| --- | --- | --- | --- | --- | --- |
| 11 | HDI CleverInvest | **nein** (nur von Hand) | `hdi.de/service/basisinformationsblaetter/` (Auswahlmaske, 4 Schritte, HTML 200). Die PDF-Links der Produktseite zeigen auf `hdi-brandportal.com`; dessen robots.txt sperrt den Pfad (25.10.: `/share/qE4kryz3THPMKj3T8qwZ` gesperrt). `hdi.de` sperrt `/pdf/`, `/download/`, `/docs/`, `*.pdf$`. | unbekannt (nicht gelesen) | Mit Skript nicht beschaffbar. Händisch: Nyko lädt in der Maske "CleverInvest Privatrente", 20 und 30 Jahre, laufend und Einmal. Wichtigster Tarif der ganzen Liste (Default, zwei Demo-Fälle, Store-Bilder). Der Preset trägt heute `quelle` "AVB HARF26 Stand 09/2026 § 16 Abs. 2", also Bedingungen, kein Blatt. |
| 12 | AXA JustInvest | **nein** (Zuordnung offen) | `axa.de/pk/altersvorsorge/s/basisinformationsblaetter` (Seite). robots.txt von `axa.de` am 25.10. nicht lesbar (Verbindung zurückgesetzt). 07.10.: PDFs nach RFC 9309 erlaubt, aber Nutzungshinweis "nicht gestattet, Tarif-Informationen ... zu kommerziellen Zwecken auszulesen". | Blätter `JustInvest ...` ohne Stand notiert | Nicht beschaffbar bis [Z] und Zuordnung ("Performance" und "ALVF7" stehen in keinem Blatt) geklärt. |
| 13 | Swiss Life Maximo | **nein** (nur von Hand) | `swisslife.de/content/dam/de/documents/5e/17222.pdf` (30 J., 0 % Garantie, laufend) u. a. | 01.10.2026 (laut Quellenliste) | robots.txt sperrt `/content/dam/de/documents/*` (25.10. bestätigt: gesperrt), TDM-Vorbehalt = ja, HTML 403 für Skripte. |
| 14 | Allianz PrivatRente InvestFlex | **nein** (nur von Hand) | `goa-eportale.allianz.de/JLX/RF-/JLXRF--30Z0.pdf.download.pdf` (laufend), `.../JEX/RF-/JEXRF--30Z0.pdf...` (Einmal) | unbekannt | `allianz.de/robots.txt` am 25.10. HTTP 403, Cloudflare-Challenge; Data-Mining-Verbot in den Nutzungsbedingungen. |
| 15 | Baloise Invest FondsRente | **ja** | `helvetia.de/dam/helvetia-de/privatkunden/de/documents/basisinformation-fondsrente/BIB/Baloise-Invest-Vario-FRN-BIB.pdf` (laufend) und `...-FRE-BIB.pdf` (Einmal) | 24.08.2026 (`Last-Modified` 18.09.2026) | robots erlaubt, HEAD 200 `application/pdf`. Produkt im Blatt "Baloise Best Invest" / "Invest Vario": Zuordnung **unsicher**. Fonds-TER aus `fondschecker.baloise.de/produkt/IE00B4L5Y983/priip_documents/...`. |
| 16 | Volkswohl Bund Vorsorge Plan FRV | **ja** | `druckstuecke.volkswohl-bund.de/api/products/2642/documents/Basisinformationsblatt_Fondspolice_Pur_laufend_20_Jahre.pdf` (und Einmal 2650) | 25.03.2026 | robots erlaubt, HEAD 200. Blatt heißt "Fondspolice Pur"; "Vorsorge Plan FRV" steht nicht drin: Zuordnung **unsicher**. |
| 17 | Signal Iduna SI Wachstum | **ja** | `signal-iduna.de/content/dam/si-documents/2/23/23040xx.pdf.coredownload.inline.pdf` (laufend), `.../23044xx.pdf...` (Einmal) | 30.09.2025 (`Last-Modified` 26.05.2026) | robots erlaubt, HEAD 200. Blatt "SIGNAL IDUNA Pur Invest"; β gestaffelt (7,5 % bis Jahr 10, danach 6,5 %): braucht `betaStaffel`. Zuordnung **unsicher**. |
| 18 | Nürnberger FondsRente | **ja** | `nuernberger.de/medien/4allportal/gn339702_p.pdf` (laufend, niedrige Garantie), `gn339762_p.pdf` (Einmal) | 01.01.2026 (`Last-Modified` 15.04.2026) | robots erlaubt, HEAD 200. Tarif NFX(P)3300. 07.10.: Nachrechnung "auffällig", α 8,9 % und β 2,5 % vermutlich vertauscht (Lesart prüfen). Zuordnung **wahrscheinlich**. |
| 19 | Universa uni-FondsRente | **ja** (mit Vorbehalt) | `universa.de/site/assets/files/113308/basisinformationsblaetter_zur_topinvest_rente_topgreeninvest_rente.pdf` (Sammel-PDF, 8 Blätter) | 01.02.2026 | `universa.de/robots.txt` am 25.10. HTTP 404, damit keine Sperre (RFC 9309); Blatt-PDF am 25.10. nicht erneut geprüft, weil robots nicht lesbar war. Blatt heißt "topinvest RENTE": Zuordnung **unsicher**. |
| 20 | VHV Privatrente Best | **ja** | `hannoversche.de/dam/fonds-re/basisinformationsblaetter/bib-fondsrente-jsb-fr3-20-jahre-2025-01.pdf` (laufend), `...-eb-...` (Einmal) | 01.01.2025 (`Last-Modified` 17.04.2025) | robots erlaubt, HEAD 200. Anbieter im Blatt **Hannoversche** (VHV Gruppe), Produkt "FondsRente (Tarif FR3)": Zuordnung **unsicher**; Blattstand 22 Monate alt (Hinweis im Beleg). |

Zusammenfassung: **URL ja: 6** (Rang 15 bis 20), **nein: 4** (Rang 11 bis 14, die vier wichtigsten). Von den 6 beschaffbaren haben 5 die Zuordnung "unsicher". Realistisch führt der Erstlauf deshalb zu 1 bis 4 Belegen aus den beschaffbaren; für mehr braucht es Entscheidung 2 oder die Handlieferung der Blätter.

## Tarif-Ablauf (gilt für H2-4 bis H2-13; Abweichungen im jeweiligen Task)

Jede Aufgabe, `<slug>` = Dateiname unter `data/app/tarife/` ohne `.json`, `<scratch>` = Scratchpad der laufenden Session.

- [ ] **A1 Zustand:** `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && git status --short && python3 -I scripts/blatt/nachrechnung.py; echo EXIT=$?` (erwartet sauberer Baum, EXIT=0, 18 Musterfälle).
- [ ] **A2 Holen** in einen eigenen leeren Ordner, nie in das Repo:

  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && mkdir -p <scratch>/blatt/<slug> && python3 -I scripts/blatt/holen.py --aus <scratch>/blatt/<slug> --name bib-laufend-20 "<url>"; echo EXIT=$?`

  Exit 0 geladen; 2 robots oder Vorbehalt verbietet; 3 Sperre (403, Challenge, Login); 4 sonstiger Fehler. **Bei 2, 3, 4: Tarif bleibt "nicht belegt"**, Grund und Befehl in die Abschlussliste, nächster Tarif (Abbruchregel). Keine Umgehung.
- [ ] **A3 Prüfsumme und Text:** `shasum -a 256 <datei>`; `pdftotext -layout <datei> <txt>`. Weniger als 800 Zeichen = Bild-PDF: `markitdown <datei> -o <md>`, und sagen; nie als "steht nicht drin" werten.
- [ ] **A4 Zuordnung** (Entscheidung 2): Produktname, Tarifkürzel oder Tarifnummer aus der App im Blatt wörtlich finden. Gefunden: Zeile und Seite notieren. Nicht gefunden: **Abbruch für diesen Tarif**, nichts schreiben, Grund in die Abschlussliste.
- [ ] **A5 Lesen:** Kostentabelle mit Seite und Wortlaut. Lesart: "% der kumulierten Anlage" ist α, "% der eingezahlten Anlage" ist β, β Einmal ist Einstiegskosten plus Verwaltung auf den Einmalbeitrag (siehe `docs/PLAN-blatt-auslese.md`, Lesart). Nicht Gefundenes bleibt weg, kein Standardwert. Musterfall: Beitrag, Haltedauer, Rendite, "Kosten insgesamt" und RIY der **Unterkante** des Blatts (günstigste Anlageoption), `annahmen.fundTER` entsprechend.
- [ ] **A6 Nachrechnen vor dem Schreiben** (Werte zunächst in eine Kopie unter `<scratch>/neu/<slug>.json`, nicht ins Repo):

  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && python3 -I scripts/blatt/nachrechnung.py <scratch>/neu/<slug>.json; echo EXIT=$?`

  Nicht grün: ein Posten ist falsch gelesen oder fehlt; Zitate neu lesen, nicht die Toleranz anheben. Bleibt es rot: Tarif bleibt "nicht belegt", Abweichung (Prozent und Pp) in die Abschlussliste.
- [ ] **A7 Gegentest je Tarif (beide Richtungen):** (a) denselben Musterfall mit einem absichtlich um Faktor 2 falschen β in der Kopie: muss rot werden (EXIT=1). (b) ein Posten des Blatts weggelassen (etwa Restbeitragssatz oder κ): muss rot werden, soweit der Posten im Musterfall wirkt; wirkt er nicht, im Bericht sagen. Beide Proben nur auf der Kopie.
- [ ] **A8 Schreiben:** Kopie nach `data/app/tarife/<slug>.json`. Das Feld `quelle` nennt Blatt, Stand und Fundstellen, nicht den Namen von Wettbewerber W. Bestehende Werte, die das Blatt nicht trägt (etwa `rentenfaktor`, `typischeBruttorendite`), bleiben unverändert und **nicht** in `felder`. `betaRate` bei Staffel: Mittelwert innerhalb der Stufen (Build prüft).
- [ ] **A9 Build und Prüfung:** `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && npm run build:ios; echo EXIT=$?` danach `git diff --stat`. Erwartet: `data/app/tarife/<slug>.json` und `tariffs.json` geändert; in `tariffs.json` für diesen Tarif genau `belegteFelder` und `belegStand` neu, Werte wie in `data/app`; `beleg` nicht in `tariffs.json`.
- [ ] **A10 Zählung:** `python3 -I scripts/blatt/quote.py` meldet einen Beleg mehr als vor dem Task (Befehl nach H2-3).
- [ ] **A11 Commit:** `python3 /Users/nyko/Developer/worktrees/e6-spec-avdepot/scripts/check_wettbewerber_name.py --staged` (aus dem Tarif-Repo, ohne Treffer), dann Commit "Beleg <Anbieter> <Tarif> (H2)". Zwischenkopie in `<scratch>/blatt/<slug>/` löschen (`rm -rf`).

## Tasks

### Task H2-1: Nachrechnung als Pflicht-Schritt in `validate.yml`

**Files:**
- Modify: `.github/workflows/validate.yml`
- Modify: `README.md` (Abschnitt "Beleg je Tarif", Satz "Die CI führt es bei jeder Änderung unter `data/app/` aus")
- Create: `scripts/blatt/test_workflow.py`

**Ziel:** `validate.yml` ruft nach "Schema validation" `python3 -m unittest discover -s scripts/blatt` und `python3 scripts/blatt/nachrechnung.py` auf; der Workflow läuft bei jedem PR, daher fällt der Schritt nie aus. Ein Wächter-Test liest beide Workflow-Dateien und scheitert, wenn der Schritt fehlt, in `continue-on-error` steht oder hinter einem `if:` hängt.

- [ ] **Step 1: Stub.** Datei `scripts/blatt/test_workflow.py` mit der Hilfsfunktion `schritte(yaml_text)` (reiner Textscan, keine YAML-Bibliothek; Standardbibliothek genügt), die eine Liste `{name, run, bedingt, fehler_ignoriert}` liefert, aber noch `NotImplementedError` wirft.
- [ ] **Step 2: Tests (RED mit Assertion-Fehlern).** Vier Tests: (1) `test_validateYmlRuftDieNachrechnungAuf`: in `validate.yml` gibt es einen Schritt, dessen `run` `scripts/blatt/nachrechnung.py` enthält. (2) `test_nachrechnungIstNichtBedingtUndNichtOptional`: dieser Schritt hat weder `if:` noch `continue-on-error`. (3) `test_gegentest_ohneSchrittFaelltDerWaechter`: dieselbe Prüffunktion auf einem Fixture-Text ohne den Schritt meldet "fehlt" (beweist, dass (1) fallen kann); (4) `test_gegentest_mitContinueOnErrorFaelltDerWaechter`: Fixture mit `continue-on-error: true` meldet "optional". Fixture-Texte stehen im Test.
- [ ] **Step 3: GREEN.** `schritte` umsetzen, `validate.yml` ändern:

  ```yaml
      - name: Selbstpruefung belegter Tarife
        run: |
          python3 -m unittest discover -s scripts/blatt
          python3 scripts/blatt/nachrechnung.py
  ```
  README-Satz: "Die CI führt es in `validate.yml` bei jedem Pull Request aus und in `ios-bundle.yml` vor dem Commit von `tariffs.json`."
- [ ] **Step 4: Läuft das lokal wie in der CI?** `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && python3 -m unittest discover -s scripts/blatt > <scratch>/h2-1.log 2>&1; echo EXIT=$?` und `python3 scripts/blatt/nachrechnung.py > <scratch>/h2-1b.log 2>&1; echo EXIT=$?` (ohne `-I`, wie die CI). Erwartet 0 und 0.
- [ ] **Step 5: Zählung.** Vorher 18, nachher **22** (Unittests: +4). Node unverändert 25.
- [ ] **Step 6: Mutationsprobe M1** (nach Commit): in `validate.yml` den Befehl `nachrechnung.py` auf `nachrechnung_x.py` ändern; `test_validateYmlRuftDieNachrechnungAuf` muss rot werden; Rückbau per Edit, `git diff --exit-code -- .github/workflows/validate.yml`. **M2:** `continue-on-error: true` einfügen; Test 2 rot; Rückbau.
- [ ] **Step 7: Commit** (Namens-Check, siehe A11).

### Task H2-2: `holen.py` ins Repo, robots nach RFC 9309

**Files:**
- Create: `scripts/blatt/holen.py`
- Create: `scripts/blatt/test_holen.py`

**Ziel:** Ein Aufruf holt **ein** Dokument, nachdem `robots.txt` der Domain nach RFC 9309 den Pfad erlaubt hat; höfliche Pause je Domain (Vorgabe 5 Sekunden, Flag `--pause`); schreibt PDF, Text und JSON (URL, Abrufdatum, SHA-256, Seitenzahl, Textzeichen) **nur** in den mit `--aus` genannten Ordner; der Ordner muss leer sein und außerhalb des Repos liegen (Prüfung `git rev-parse --show-toplevel` des Ordners darf nicht das Repo sein). Exit-Codes wie im Vault-Skript (0, 2, 3, 4). Basis: Vault-Fassung `Research/2026-10-07 BIB-Auslese/assets/skripte/holen.py` (Kopf: 93 Zeilen, `rfc9309_erlaubt`). Anders als dort: Funktionen statt Skript-Code auf Modulebene (testbar), keine festen Pfade, `--aus` Pflicht.

- [ ] **Step 1: Stub** (`rfc9309_erlaubt(text, pfad)` gibt immer `True`; `entscheide(status, text, pfad)` ebenso).
- [ ] **Step 2: Tests (RED).** Mindestens 8: (1) längste passende Regel gewinnt (`Disallow: /a/`, `Allow: /a/b/` erlaubt `/a/b/x`). (2) Wildcard `Disallow: /*.pdf$` sperrt `/x/y.pdf`, erlaubt `/x/y.pdf?v=1` nicht fälschlich (Gegentest zu Pythons `robotparser`: dieselbe Eingabe, `urllib.robotparser` sagt "erlaubt" und hätte den Fehler vom 07.10. wiederholt; der Test hält die erwartete Antwort der eigenen Funktion fest). (3) Gleichstand: Allow gewinnt. (4) Gruppe `User-agent: *` zählt, andere Gruppen nicht. (5) `entscheide`: Status 404 = erlaubt (keine robots.txt). (6) **Status 403, 5xx, Verbindungsfehler = gesperrt** (Fall "Vergleichsbasis fehlt" als eigener roter Test; Allianz liefert 403). (7) leere robots.txt (Status 200, Text leer) = erlaubt. (8) Zielordner innerhalb des Repos wird abgelehnt (Exit 4), nicht leerer Ordner abgelehnt. Netzwerk wird nicht benutzt: `entscheide` und die Ordnerprüfung sind reine Funktionen.
- [ ] **Step 3: GREEN.**
- [ ] **Step 4: Trockenlauf gegen echte `robots.txt` ohne Download:** `python3 -I scripts/blatt/holen.py --nur-robots "https://www.swisslife.de/content/dam/de/documents/5e/17222.pdf"` meldet Exit 2 (gesperrt); `--nur-robots "https://www.nuernberger.de/medien/4allportal/gn339702_p.pdf"` meldet Exit 0 (erlaubt). Beide Ausgaben im Bericht. (Befund 25.10. mit dem Skriptstand aus dieser Inventur: Swiss Life gesperrt, Nürnberger erlaubt.)
- [ ] **Step 5: Zählung.** Vorher 22, nachher **30** (Unittests: +8). Node 25.
- [ ] **Step 6: Mutationsprobe M3:** in `rfc9309_erlaubt` den Vergleich "längste Regel" auf "erste Regel" ändern; Test (1) rot. **M4:** `entscheide` mit 403 auf "erlaubt" ändern; Test (6) rot. Rückbau per Edit.
- [ ] **Step 7: Commit.**

### Task H2-3: Belegquote als Kennzahl

**Files:**
- Create: `scripts/blatt/quote.py`
- Create: `scripts/blatt/test_quote.py`
- Modify: `README.md` (ein Absatz: Aufruf, Ausgabe; keine Zahl im Text)

**Ziel:** `python3 -I scripts/blatt/quote.py` liest `data/app/tarife/*.json` und `tariffs.json` und druckt `belegt/gesamt` (heute `10/61`) mit Stand (`updatedAt` aus `tariffs.json`) und der Aufschlüsselung nach `kategorie`. Es **bricht mit Exit 1 ab**, wenn die Quelle (Feld `beleg` in `data/app`) und das Bundle (`belegteFelder` in `tariffs.json`) auseinanderlaufen oder `gesamt` ungleich der Dateizahl ist. Ausgabe auch als `--json`. Keine Zahl ist im Code eingetragen.

- [ ] **Step 1: Stub.** **Step 2: Tests (RED), mindestens 5:** (1) Fixture-Ordner mit 3 Tarifen, 1 mit `beleg` ergibt 1/3. (2) Quelle sagt 2 belegt, Bundle 1: Exit 1 (Abweichung benannt). (3) Fixture ohne Tarife: Exit 1 "Scan leer" (nie "0/0 ist 100 %"). (4) Aufschlüsselung nach Kategorie summiert zur Gesamtzahl. (5) **Gegen den echten Stand:** `test_echterStand_stimmtMitDerDateizaehlung` zählt `data/app/tarife/*.json` per `glob` und vergleicht mit `gesamt` aus `quote.py`; die Zahl 61 darf im Test **nicht** stehen. (Wächter-Gegentest: ein Test, der `61` fest eintrüge, wäre selbst die hartkodierte Zahl, die H4 verbietet.)
- [ ] **Step 3: GREEN.** **Step 4:** Lauf auf dem echten Stand, Ausgabe zeigen; erwartet `10/61` (Stand 25.10.2026, vor dem Erstlauf).
- [ ] **Step 5: Zählung.** Vorher 30, nachher **35** (+5). Node 25.
- [ ] **Step 6: Mutationsprobe M5:** `quote.py` zählt `belegteFelder` statt `beleg` ohne Abgleich: Test (2) rot. Rückbau.
- [ ] **Step 7: Commit.**

### Task H2-4: HDI CleverInvest (Rang 11), Default und Demo

Ablauf wie "Tarif-Ablauf", **aber A2 entfällt**: Das Blatt ist per Skript nicht beschaffbar (robots, Auswahlmaske; Befund oben). Task-Ergebnis ohne Handlieferung: "nicht belegt, wartet auf Nyko".

- [ ] **Step 1: Handlieferung anfordern** (Nyko, außerhalb dieses Plans): Nyko lädt im Browser aus `https://www.hdi.de/service/basisinformationsblaetter/` die Basisinformationsblätter "CleverInvest Privatrente", 20 und 30 Jahre, laufender Beitrag und Einmalbeitrag, und legt sie in einen **eigenen leeren Ordner** außerhalb des Repos. Die Rechtsfrage (Offen Punkt 1) ist vorher beantwortet, sonst endet der Task hier mit "wartet".
- [ ] **Step 2: A3 bis A11** auf die gelieferten Dateien (`--lokal`-Modus von `holen.py`: berechnet SHA-256 und Text ohne Netzzugriff; Adresse trägt Nyko ein, `abrufdatum` ist das Lieferdatum).
- [ ] **Step 3: Vorab-Befund zum Preset:** `data/app/tarife/hdi--cleverinvest.json` hat heute `quelle` "AVB HARF26 Stand 09/2026 § 16 Abs. 2" und α 10 %, Zillmerdauer 120 Monate (iOS `MarketingStoreBildTests.swift:1405,1426`); diese Werte stammen aus Bedingungen, nicht aus dem Blatt. Weichen die Blattwerte ab, **nicht** still überschreiben: Abweichung in den Bericht (Wirkung auf Default, Demo-Fälle und Store-Bilder; H13 betrifft sie erst später).
- [ ] **Step 4: Gegentest** wie A7. **Step 5: Commit** (falls Beleg) oder Eintrag in die Abschlussliste (falls nicht).

### Task H2-5: AXA JustInvest Performance ALVF7 (Rang 12)

Ablauf wie "Tarif-Ablauf". Zusätzlich:
- [ ] **Step 1: Zuordnung zuerst (Lead).** In der Blattliste von `axa.de` steht kein "Performance" und kein "ALVF7" (07.10.); Kandidaten "JustInvest Fonds-PrivatRente", "JustGreenInvest", "AA Fonds-Rente". Ohne Nykos Auswahl des Blatts **kein Beleg**.
- [ ] **Step 2:** `axa.de/robots.txt` war am 25.10. nicht lesbar (Verbindung zurückgesetzt); `holen.py` meldet laut Test (6) "gesperrt". Ergebnis ohne Handlieferung: "nicht belegt, wartet auf Nyko und [Z]". Nutzungshinweis von AXA verbietet Auslesen zu kommerziellen Zwecken (Wortlaut oben): **[Z]**, nicht entschieden.
- [ ] **Step 3:** Falls geliefert: A3 bis A11.
- [ ] **iOS-Wirkung:** `GoldenNumbersTests.swift:182` und `ErgebnisBrueckeTests.swift:44` rechnen mit diesem Tarif; erst H13 verschiebt sie.

### Task H2-6: Swiss Life Maximo 710/714 (Rang 13)

Ablauf wie "Tarif-Ablauf". robots sperrt `/content/dam/de/documents/*` (25.10. bestätigt, Test (2) bildet das ab); TDM-Vorbehalt = ja. Ergebnis ohne Handlieferung: "nicht belegt, wartet auf Nyko und [Z]". Tarif 714 steht in keinem Blatt der Quellenliste: Zuordnung nur für 710 bis 713 möglich, im Beleg-`hinweis` zu benennen. Gestaffelte Laufzeitblätter (12, 30, 40 Jahre, Garantie 0 % und 50 %): **ein** Blatt als Musterfall wählen (30 Jahre, 0 % Garantie, laufend, Stand 01.10.2026) und die Wahl im `hinweis` begründen.

### Task H2-7: Allianz PrivatRente InvestFlex (Rang 14)

Ablauf wie "Tarif-Ablauf". `allianz.de/robots.txt` am 25.10. HTTP 403 (Cloudflare), Data-Mining-Verbot in den Nutzungsbedingungen. Ergebnis ohne Handlieferung: "nicht belegt, wartet auf Nyko und [Z]". Zuordnung: Seitenabschnitt "PrivatRente InvestFlex" führt mehrere Varianten (ohne Garantie, Garantiestufen, NAV-Variante); Codes `JLXRF--`/`JEXRF--` sind die Variante "ohne spezifische Garantie". Die Wahl der Variante ist Nykos Entscheidung.

### Task H2-8: Baloise Invest FondsRente (Rang 15)

Ablauf wie "Tarif-Ablauf"; Blattadresse unter `helvetia.de` (Baloise gehört zur Helvetia-Gruppe; Anbieter-Domain, kein Vergleichsportal). Zuordnung: Blatt heißt "Baloise Best Invest" / "Invest Vario" gegen App-Name "Invest FondsRente": **wörtliche Entsprechung fehlt**; der Umsetzer prüft die Produktseite von `baloise.de` bzw. die Blattkopfzeile auf Tarifkürzel "FRN"/"FRE"; findet er keinen Beleg für die Gleichheit, endet der Task mit "Zuordnung ungeklärt, nicht belegt". Fonds-TER aus der Fondsübersicht (iShares Core MSCI World, ISIN IE00B4L5Y983 in `fondschecker.baloise.de`), Wortlaut der Fondszeile als Beleg für `fundTER`.

### Task H2-9: Volkswohl Bund Vorsorge Plan FRV (Rang 16)

Ablauf wie "Tarif-Ablauf". Blatt "Fondspolice Pur" (Kennung im Dateinamen) gegen App-Name "Vorsorge Plan FRV": Zuordnung offen; die Produktseite von `volkswohl-bund.de` ist auf "Vorsorge Plan"/"FRV" zu prüfen. Hinweis: Der Tarif FITTERY desselben Anbieters ist bereits belegt und bietet den iShares-ETF nicht an (Befund 07.10.): `fundTER` für Vorsorge Plan FRV nur setzen, wenn die Fondsübersicht (Kennung `FD.allg.0626`, 06/2026) den ETF führt. Beide Blätter (laufend, einmal) gehören zu **einem** Beleg mit zwei `pruefung`-Fällen.

### Task H2-10: Signal Iduna SI Wachstum (Rang 17)

Ablauf wie "Tarif-Ablauf". Blatt "SIGNAL IDUNA Pur Invest" (Stand 30.09.2025, Fußzeile "Jan26") gegen App-Name "SI Wachstum": Zuordnung offen. Wegen der Staffel (β 7,5 % bis Jahr 10, danach 6,5 %) `betaStaffel` mit zwei Stufen `[{abJahr:1, rate:0.075}, {abJahr:11, rate:0.065}]` und `betaRate` als Wert zwischen den Stufen (Build prüft); Test: `nachrechnung.py` rechnet die Staffel (Build 33, T2). Gegentest in A7 zusätzlich: Staffel entfernt (nur 7,5 %) muss bei der 20-Jahre-Haltedauer eine Abweichung zeigen; zeigt sie keine über der Toleranz, im Bericht sagen und die Staffel trotzdem behalten, weil das Blatt sie nennt.

### Task H2-11: Nürnberger FondsRente (Rang 18)

Ablauf wie "Tarif-Ablauf". Zuordnung wahrscheinlich (Tarif NFX(P)3300). **Lesart-Falle:** Die 07.10.-Auslese schrieb α 8,9 % und β 2,5 %; nach Blatt-Plan-Lesart ist "8,9 % der eingezahlten Anlage" vermutlich β und "2,5 % der kumulierten Anlage" α (nicht nachgeprüft). Der Umsetzer liest die Zeilen im Wortlaut; die nominale Nachrechnung erkennt eine Vertauschung **nicht** (gleiche Summe). Deshalb zusätzlich: Wortlaut-Zeilen in `felder` übernehmen und im Review (Focus 4) gegen den Blatttext abgleichen. Drei Garantiestufen (niedrig, mittel, hoch): niedrige Garantie als Musterfall, im `hinweis` benennen.

### Task H2-12: Universa uni-FondsRente (Rang 19)

Ablauf wie "Tarif-Ablauf". Sammel-PDF mit 8 Blättern (laufend 20 J. = Seiten 17 bis 19, Einmal 20 J. = Seiten 5 bis 7); Seitenangaben im Beleg auf die Sammel-PDF-Seiten beziehen, im `hinweis` sagen. Blatt heißt "topinvest RENTE"/"topgreeninvest RENTE" (ohne Garantie) gegen App-Name "uni-FondsRente": Zuordnung offen. κ 100 €/Jahr = 8,33 €/Monat. **Vor dem Laden `robots.txt` erneut prüfen:** am 25.10. HTTP 404; `holen.py` behandelt 404 als erlaubt (Test 5), der Vorbehalt in Nutzungstext/Impressum von `universa.de` wurde in der Quellenliste vom 06.10. bewertet und nicht als Sperre geführt (Lead prüft den Satz im Bericht).

### Task H2-13: VHV Privatrente Best (Rang 20)

Ablauf wie "Tarif-Ablauf". Anbieter im Blatt: Hannoversche Lebensversicherung AG (VHV Gruppe), Produkt "FondsRente (Tarif FR3)"; Blattstand 01.01.2025, also 22 Monate alt: `stand` im Beleg exakt so, `belegStand` setzt der Build; Hinweis im Bericht, dass die Aktualität zu prüfen ist (neuere Fassung auf `hannoversche.de`?). α 0 % (VHV hat keine Einstiegsgebühr, App 2,5 %): ein Wert, der **ändert**, nicht bestätigt. Er bleibt, wenn die Nachrechnung grün ist; die Änderung der Rangfolge in der App ist erst mit H13 sichtbar.

### Task H2-14: Abschluss, Quote, Liste, Review

- [ ] **Step 1: Volle Prüfung.**

  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && npm ci > <scratch>/ci.log 2>&1; echo EXIT=$?`
  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && npm run build > <scratch>/build.log 2>&1; echo EXIT=$?`
  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && python3 -I -m unittest discover -s scripts/blatt > <scratch>/py.log 2>&1; echo EXIT=$?`
  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && node --test "scripts/*.test.mjs" > <scratch>/node.log 2>&1; echo EXIT=$?`
  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && python3 -I scripts/blatt/nachrechnung.py; echo EXIT=$?`

  Erwartet: alle EXIT=0; Python **35** Tests (18 + 4 + 8 + 5, aus `git diff` der Testmethoden **neu zu zählen**, nicht aus diesem Plan zu übernehmen: Fehlerlog 25.10. H3-7), Node 25 (unverändert), Musterfälle: 18 plus 2 je neuem Beleg.
- [ ] **Step 2: Zahl.** `python3 -I scripts/blatt/quote.py` und die Liste der neu belegten Tarife; Ziel des Erstlaufs: `10 + k` von 61 mit `k` aus Abschnitt "Abrufbarkeit" (erwartet 1 bis 4, bei Handlieferung bis 8).
- [ ] **Step 3: Abschlussliste** als Tabelle im Bericht (nicht im Repo): je Rang 11 bis 20 Ergebnis (belegt / nicht belegt), Grund, Befehl, Abweichung aus der Nachrechnung. Daraus die Verteilung der Abweichungen für die Toleranz-Entscheidung (Frage 2 des Blatt-Plans).
- [ ] **Step 4: iOS-Bundle prüfen, nicht ändern.** `git -C /Users/nyko/Documents/Claude-Projekte/patina-charts-ios fetch -q origin && git -C ... show origin/main:Models/TarifPreset.swift | grep -c "static let .* = TarifPreset("` meldet 56; im Bericht: **H13 ist nicht Teil**; die Golden-Tests (`GoldenNumbersTests`, `DemoFallTests`, `DefaultTarifNeutralitaetTests`) laufen auf dem Bundle und bleiben unberührt. Es wird **kein** Simulator gestartet (kein iOS-Eingriff).
- [ ] **Step 5: Zitatprüfung.** Jeder neue `wortlaut` im Blatttext (Zwischenkopien noch vorhanden, bis hier nicht gelöscht): `grep -F` oder die Fensterprüfung aus `zitatpruefung.py` (Vault, ≥ 80 % der Wörter im 500-Zeichen-Fenster). Treffer ohne Befund: Wert zurück in den Bericht, Beleg streichen.
- [ ] **Step 6: Review** durch `task-reviewer` (Review Focus 1 bis 7), parallel `agy` im Modus "prüfen" auf den Diff (Tarifdaten ohne Mandantenbezug). Befunde nachprüfen, nicht übernehmen.
- [ ] **Step 7: Abschlusskontrollen.**

  `cd /Users/nyko/Developer/worktrees/tariffs-h2-erstlauf && git status --short && git log --oneline origin/main..HEAD && python3 /Users/nyko/Developer/worktrees/e6-spec-avdepot/scripts/check_wettbewerber_name.py --staged; echo EXIT=$?`

  Erwartet: sauberer Baum, ein Commit je Task, **kein** Blatt-PDF und keine Textdatei eines Blatts im Diff (`git diff --stat origin/main..HEAD | grep -i -E "pdf|\.txt"` ohne Treffer), Zwischenordner gelöscht, kein Push, keine PR. Sperrliste abhaken.
- [ ] **Step 8: Bericht** mit: Vorlaufzahlen, Endzahlen, RED-Ausgaben, Mutationsproben M1 bis M5 samt Rückbau-Beleg, Quote vorher und nachher mit Befehl, Abschlussliste, Kurz-SHAs.

## Erwartete Testzahl-Zuwächse (aus diesem Plan gezählt, im Abschluss neu zu zählen)

| Task | Python | Node |
| --- | --- | --- |
| Vorlauf | 18 | 25 |
| H2-1 | +4 | 0 |
| H2-2 | +8 | 0 |
| H2-3 | +5 | 0 |
| H2-4 bis H2-13 | 0 (Daten; geprüft durch `nachrechnung.py`, +2 Musterfälle je Beleg, das sind keine Unittests) | 0 |
| **Summe** | **35** | **25** |

## Offen für den Lead

1. **[Z] Handlieferung und Auslesen.** Darf Nyko ein Blatt, dessen Anbieter Data-Mining im Nutzungs-/Impressumstext vorbehält (Allianz, Alte Leipziger, Swiss Life, AXA) oder dessen `robots.txt` den Pfad sperrt (HDI-Brandportal), im Browser laden und danach (Claude, Skript) auslesen und die Kostenzeilen wörtlich im öffentlichen Repo zitieren (§ 44b, § 87b UrhG; Blatt-Plan offene Frage 4)? Ohne Antwort bleiben **die vier wichtigsten Erstlauf-Tarife (HDI, AXA, Swiss Life, Allianz) unbelegt**. Das ist der größte Hebel im Plan.
2. **Auslesen: Agenten wie am 07.10. oder `auslesen.py`** (liegt nur auf dem lokalen Branch `claude/blatt-auslese-a`, nicht abgenommen, API-Kosten)? Der Plan liest per Umsetzer und Zitatprüfung.
3. **Reihenfolge innerhalb Gruppe B** ("beschaffbar vor von Hand") ist meine Ergänzung. Alternative: strikt nach Verwendung. Dann rücken Stuttgarter, Alte Leipziger, ERGO, Generali (alle von Hand) vor die 6 beschaffbaren, und der Erstlauf liefert vermutlich 0 Belege.
4. **30 gesamt oder 30 neu** (Entscheidung 1).
5. **Zuordnung "unsicher"** (Entscheidung 2): Reicht "Produktname wörtlich im Blatt", oder genügt Nyko auch eine Sachprüfung (gleiche Kostenwerte wie das Blatt)? 5 der 6 beschaffbaren Tarife hängen daran.
6. **Umsatzgewicht:** Gibt es Zahlen (Pool, tecis)? Dann ersetzen sie die Verwendungs-Reihenfolge in Gruppe A und B.
7. **Standard Life Freelaxx und alle Tarife ohne öffentliches Blatt:** Anbieterauskunft wäre Erstkontakt und ist bis zum Bescheid gesperrt; Vorschlag: bleiben "nicht belegt" und werden in H4 so benannt.
8. **Toleranz:** Verteilung nach H2-14 vorlegen, Anhebung oder Senkung entscheidet Nyko (Frage 2 des Blatt-Plans).
9. **Pflicht-Schritt doppelt** (`validate.yml` und `ios-bundle.yml`): akzeptabel, oder aus `ios-bundle.yml` entfernen?
10. **`TarifHerkunftsMatrix.luecken` im iOS-Repo** (Continentale, Helvetia, Barmenia) bildet den Bundle-Stand ab, nicht den Live-Stand; gehört zu H13, nicht hierher.
11. **Fehlerlog-Eintrag** nach dem Erstlauf, falls etwas auftritt, was dieser Plan nicht vorhersah (Muster: Sperre trotz robots, Lesart-Vertauschung, Blatt veraltet).

## Anhang: Entscheidungsliste (wörtlich)

Aus Strategieplan Stufe 1 (Vault, Abschnitt 5, B2) und Auftrag, unverändert:

- "H2 Belegquote erhöhen. Nach Umsatzgewicht: zuerst die Presets, die Demo-Fälle und Default-Tarif tragen, dann klassische Versicherer, zuletzt Sektor-Fonds. Pro Tarif: Blatt holen, `tools/extract-pib.py`, `nachrechnung.py` grün, `belegteFelder`, `beleg` und sha256 setzen. Etappe 1: 30 priorisierte Tarife (rund 8 bis 10 Abende), Etappe 2: die übrigen rund 31 (Hochrechnung, rund 9 bis 10 Abende, Überhang). Nachrechnung als Pflicht-Schritt in `validate.yml` des Tarif-Repos. Die Quote erscheint als Kennzahl, nie hartkodiert."
- "Erfolg. Etappe 1: mindestens 30 Tarife belegt, kein Text mehr, der Herkunft behauptet, die der Beleg nicht trägt. Endziel: alle 61."
- "Abbruch/Befund. Blatt nicht beschaffbar: Tarifgruppe bleibt "nicht belegt" und wird in den Texten so benannt."
- "Abhängigkeit. H1. H4 braucht die Zahl aus H2. H13 verschiebt Golden-Werte (Tests einzeln begründen)."
- Woche 3: "B2 H2 Belege, Erstlauf (3,5)"; Woche 4: "B2 H2 (1)"; Woche 5: "B2 H2 (2)".
- Auftrag: H13 Bundle-Sync ist **nicht** Teil dieses Plans; die Kalibrierdatei `~/tariffs-analysis.csv` (Werte von Wettbewerber W) nie ins Repo und nicht als Beleg; der echte Name von Wettbewerber W wird nie geschrieben; Kein Push, keine PR; Simulator lokal nur `id=4C13E4D5-AD94-4778-A47C-6EB94A5E0E86` (kommt in diesem Plan nicht zum Einsatz, weil kein iOS-Code berührt wird), vor einem Push zusätzlich Klon-iPhone `id=7DB766F8-81B1-40F5-AC81-8E658C878A11`; nie das CI-iPhone `03F9A3A2`, nie `03E15D0B` (gelöscht).
- Fehlerlog-Gegenmaßnahmen, die dieser Plan umsetzt: Abdeckungsbehauptungen per `git grep` belegt (21.10.); Zahlen der Strategieebene nachgezählt, im Code-Plan gilt die eigene Zählung (24.10.); Wächter mit Fall "Vergleichsbasis fehlt" als eigenem roten Test (24.10.); Zuwachszahlen im Abschlusstask aus `git diff` der Testmethoden neu zählen (25.10.); Kopf geht vor Tasktext (24.10.); neue Testdatei gleich Testzahl gegen den Vorlauf vergleichen (28.09.); `quelle` und Wettbewerber-Name (24.10.).
