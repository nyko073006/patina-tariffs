> Plan zu Stufe 1, Block B2 H2 „Belege, Zweitlauf“ (Branch `claude/h2-zweitlauf`, Repo `patina-tariffs`). Erstellt 08.11.2026 aus den Antworten Nykos auf das H2-Entscheidungsblatt Woche 4 (Vault `02 Projekte/Patina Charts/Decisions/2026-10-26 H2 Entscheidungsblatt Woche 4.md`, Abschnitt „Antworten“) und dem Erstlauf-Plan `docs/plans/2026-10-25-h2-belege-erstlauf.md`. Zahlen nachgezählt auf `origin/main` `a9c5be5`.

# H2 Belege, Zweitlauf: fundTER-Nachprüfung, Wächter, drei neue Tarife — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Umsetzung und Fix-Runden macht `umsetzer`, Review `task-reviewer`, parallel `agy` (Modus prüfen) auf den Diff je Task.

**Goal:** (1) Die Belege, deren Nachrechnung `fundTER: 0` ohne Begründung annimmt, sind nachgeprüft: begründet, mit echter TER grün, oder zurückgestuft. (2) `nachrechnung.py` lässt `fundTER: 0` nur noch mit Begründung durch. (3) Bayerische BavariaDIREKT, Cosmos Direkt Privat-Rente Online und R+V IndexInvest Premium sind nach dem Tarif-Ablauf des Erstlaufs bearbeitet; wer grün ist, bekommt `beleg`.

**Architecture:** Kein neues Schema außer einem optionalen Feld `annahmenGrund` je Prüfeintrag (Task Z2). Ablauf, Werkzeuge (`holen.py`, `nachrechnung.py`, `quote.py`) und Build (`npm run build:ios`) bestehen. Blätter liegen nie im Repo.

**Tech Stack:** Python 3 (`unittest`, Standardbibliothek), Node 22, `pdftotext`/`markitdown`.

**Spec:** Entscheidungsblatt (oben) mit Antworten vom 08.11.2026; Erstlauf-Plan, Abschnitte „Lead-Entscheidungen“, „Sperrliste“, „Global Constraints“, „Tarif-Ablauf“ (gelten weiter, soweit hier nichts anderes steht).

## Entscheidungen Nyko (08.11.2026, gehen dem Tasktext vor)

1. Nur die drei frei abrufbaren Blätter. Keine Handlieferung, kein anderer Tarif.
2. Gesperrt bis zur Klärung § 44b UrhG: HDI, AXA, Swiss Life, Allianz, **Alte Leipziger**. Kein Skript lädt deren Blätter.
3. Zuordnung bestätigt (Grund wörtlich in `beleg.hinweis`): Bayerische BavariaDIREKT = „Fonds-Police Hallo Zukunft“; Cosmos Direkt Privat-Rente Online = FlexInvest (Kürzel CFRS); R+V IndexInvest Premium = „R+V-PrivatRente IndexInvest“ (nicht VR-Mitglieder-PrivatRente). Damit gilt die Zuordnungsregel aus Erstlauf-Entscheidung 2 („wörtlich“) für diese drei als erfüllt.
4. Wertändernde Belege: eigener Commit mit „[ändert Werte]“, Gegenüberstellung alt/neu im Bericht, Merge erst nach Nykos Ja.
5. `fundTER: 0` als Annahme der Nachrechnung nur mit Begründung: Das Blatt führt die Fondskosten erkennbar in einem anderen Posten (etwa „laufende Kosten inkl. Fonds“ in gamma). Sonst nachprüfen, notfalls zurückstufen.
6. Nachtrag 3 des Erstlaufs gilt: Grün nur durch eine Annahme 0, die das Blatt nicht trägt, zählt nicht als grün.
7. Toleranzen unverändert (`TOLERANZ_EURO = 0.15`, `TOLERANZ_RIY = 0.0015`).

## Global Constraints

- Arbeitsverzeichnis ausschließlich `/Users/nyko/Developer/worktrees/tariffs-h2-zweitlauf`, Branch `claude/h2-zweitlauf`. Jeder Shell-Befehl beginnt mit `cd` dorthin. Andere Tarif-Klone nicht anfassen.
- Blätter je Tarif in einem eigenen leeren Ordner `<scratch>/blatt/<slug>/`; Python über Downloads nur mit `python3 -I`, Pfade als Argument. Ordner erst nach Task Z6 Schritt 4 (Zitatprüfung) löschen.
- Holen nur per `python3 -I scripts/blatt/holen.py --aus <ordner> --name <name> "<url>"`, nie per `curl`. Exit 2/3/4: Tarif bleibt „nicht belegt“, keine Umgehung.
- Blatt-Adressen: aus der Auslese vom 07.10., `"url"`-Felder in Vault `02 Projekte/Patina Charts/Research/2026-10-07 BIB-Auslese/assets/daten/<slug>.json` (nur lesen). Ist eine Adresse tot, auf der Produktseite derselben Anbieter-Domain das aktuelle Blatt suchen (robots prüft `holen.py`); keine Vergleichsportale.
- Nutzungstext bzw. Impressum der Anbieter-Domain vor dem Holen lesen. Steht dort ein ausdrückliches Verbot des Auslesens oder ein Data-Mining-Vorbehalt: Abbruch für den Tarif, Grund in die Abschlussliste (wie Alte Leipziger).
- Lesart: α = „% der kumulierten Anlage“, β = „% der eingezahlten Anlage“, β Einmal = Einstiegskosten plus Verwaltung auf den Einmalbeitrag (Erstlauf, Ablauf A5). Spanne ohne Laufzeit-Zuordnung: Untergrenze, Hinweis nennt die Spanne (Ruling 25.10.).
- Kein neues Modellfeld in `data/app`. Fehlt ein Feld für einen Blattposten (R+V betaEinmal laut Entscheidungsblatt), bleibt der Posten unbelegt und steht im `hinweis`. Vorher im Schema von `scripts/build-ios.mjs` nachsehen, ob das Feld doch existiert (Volkswohl FITTERY trägt `betaEinmalRate`).
- `tariffs.json` nie von Hand, nur `npm run build:ios`. `belegteFelder`/`belegStand` setzt der Build.
- Vor jedem Commit aus dem Worktree: `python3 /Users/nyko/Documents/Claude-Projekte/patina-charts-ios/scripts/check_wettbewerber_name.py --staged` ohne Treffer. Wettbewerber nur als „externe Quelle“.
- Vorlauf: Python **66** Tests, Musterfälle **21**, `nachrechnung.py` EXIT=0, Quote **13/61**. Node-Vorlauf in Task Z1 Schritt 1 zählen. Nach jeder neuen Testdatei Testzahl gegen den Vorlauf vergleichen.
- Testbefehle: `python3 -I -m unittest discover -s scripts/blatt > <scratch>/py.log 2>&1; echo EXIT=$?` und `node --test "scripts/*.test.mjs" > <scratch>/node.log 2>&1; echo EXIT=$?`. `npm ci` vor `npm run build`.
- TDD für Code: Stub, Test, RED mit Assertion-Fehler, GREEN. Mutationsproben nur nach dem Commit, Rückbau per Edit, danach `git diff --exit-code`; nie `git checkout` auf Dateien.
- Commits lokal, je Tarif bzw. Task ein Commit (wertändernde Belege getrennt). Kein Push, kein PR (macht der Lead nach Nykos Ja). Nachricht endet mit `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01UQh3mTBepmWiYHktnQGwH9`.
- Kein Kontakt zu Versicherern (Anfragen nur über Nyko). Rechtsfragen als [Z] markieren, nicht entscheiden.

## Review Focus

1. **Begründung echt, nicht behauptet** (Z1): Jede neue Begründung für `fundTER: 0` zitiert die Blattzeile, die Fondskosten in einem anderen Posten nennt (Seite und Wortlaut, per `grep -F` im Blatttext auffindbar). „Fondskosten vermutlich enthalten“ reicht nicht.
2. **Wächter in beide Richtungen** (Z2): `fundTER: 0` ohne Grund rot; mit Grund grün; `fundTER: 0.0007` ohne Grund grün; Grund als leerer String rot; andere Annahmen 0 (gamma, kappa) bleiben unberührt (sonst ist es ein anderer Wächter).
3. **Index-Police passt ins Modell** (Z5): R+V IndexInvest beteiligt an einem Index, statt Fonds zu halten. Lässt sich das Kostenbild nicht mit α/β/γ/κ abbilden, ohne Werte zu erfinden: kein Beleg.
4. **Wertvergleich vollständig** (Z3–Z5): jedes Modellfeld alt gegen neu, nicht nur `git diff --stat`.
5. **Rückstufung sauber** (Z1): Ein zurückgestufter Tarif verliert `beleg` vollständig, seine Modellwerte bleiben unverändert, die Quote sinkt um genau 1 je Rückstufung.

---

### Task Z1: fundTER-Nachprüfung der Bestandsbelege

**Files:**
- Modify (je nach Ergebnis): `data/app/tarife/baloise--basisrente-invest.json`, `baloise--invest-fondsrente.json`, `n-rnberger--basisrente-invest.json`, `volkswohl-bund--fittery.json`, `wwk--basisrente-fondsrente.json`; Grenzfall `volkswohl-bund--vorsorge-plan-frv.json` (Hinweis sagt „Fondsübersicht nicht geprüft, ETF-Nachweis fehlt“; das Entscheidungsblatt zählte ihn als begründet; hier mitprüfen); `tariffs.json` (Build).
- Nicht anfassen: `signal-iduna--si-wachstum.json` und `wwk--premium-fondsrente-2-0-fv25.json` (begründet: „Fondskosten darin“ bzw. „Verwaltung und Fondskosten nur zusammen“).

**Interfaces:**
- Produces: In jedem Prüfeintrag mit `annahmen.fundTER == 0`, der bleibt, ein Feld `annahmenGrund.fundTER` (String, Seite und Wortlaut der Blattzeile). Task Z2 prüft genau dieses Feld.

- [ ] **Step 1: Vorlauf.** `git status --short`, Python-Tests, Node-Tests, `python3 -I scripts/blatt/nachrechnung.py; echo EXIT=$?`, `python3 -I scripts/blatt/quote.py`. Erwartet 66 / Node notieren / 21 Musterfälle / 13/61.
- [ ] **Step 2: Blatt je Tarif holen.** Adresse aus `beleg.dokumente` des Tarifs (dort stehen URL und SHA-256). SHA-256 des geholten Blatts gegen den Beleg vergleichen; weicht er ab, im Bericht sagen und das neue Blatt nur lesen, nicht den Beleg darauf umstellen.
- [ ] **Step 3: Entscheiden je Tarif** (eine Zeile in der Abschlussliste):
  - (a) Blatt nennt Fondskosten erkennbar in einem anderen Posten → `annahmenGrund.fundTER` mit Seite und Wortlaut setzen. Wertneutral.
  - (b) Sonst: Nachrechnung auf einer Kopie unter `<scratch>/neu/<slug>.json` mit `annahmen.fundTER` = TER der günstigsten Anlageoption laut Blatt oder Fondsübersicht derselben Anbieter-Domain (Quelle in `annahmenGrund.fundTER`). Grün → übernehmen. Wertneutral, weil `annahmen` keine Modellwerte sind.
  - (c) Rot oder keine TER auffindbar → Rückstufung: `beleg` aus `data/app/tarife/<slug>.json` entfernen, alle Modellwerte unverändert.
- [ ] **Step 4: Gegenprobe je (b):** β auf der Kopie verdoppeln → EXIT=1 (zeigt, dass der Musterfall trägt). Für (a) prüft der Wächter aus Z2 das Feld.
- [ ] **Step 5: Build und Prüfung.** `npm run build:ios; echo EXIT=$?`; `git diff --stat` zeigt nur die berührten Tarife und `tariffs.json`; Modellwerte in `tariffs.json` unverändert (`git diff tariffs.json` enthält nur `belegteFelder`/`belegStand`-Zeilen). Nachrechnung EXIT=0. Quote = 13 minus Zahl der Rückstufungen.
- [ ] **Step 6: Commit.** Eine Gruppe je Ergebnisart: „H2-Z1: fundTER begründet (wertneutral)“, „H2-Z1: Rückstufung <Tarif> (fundTER 0 unbegründet, wertneutral)“.

### Task Z2: Wächter `fundTER: 0` nur mit Grund

**Files:**
- Modify: `scripts/blatt/nachrechnung.py`, `scripts/blatt/test_nachrechnung.py`. `scripts/build-ios.mjs` bleibt: seine Prüfung der Prüfeinträge (`:344-353`) lehnt unbekannte Schlüssel nicht ab, `annahmenGrund` geht durch (nachgesehen 08.11.).

**Interfaces:**
- Consumes: `annahmenGrund.fundTER` aus Z1.
- Produces: `fehlende_annahme_gruende(pruefung: dict) -> list[str]` in `nachrechnung.py` (Namen der Annahmen, die 0 sind und einen Grund brauchen; heute nur `"fundTER"`). `main()` meldet je Treffer eine Zeile `✗ <Tarif>: fundTER 0 ohne annahmenGrund` und endet mit EXIT=1.

- [ ] **Step 1: Stub** `fehlende_annahme_gruende` gibt `[]` zurück.
- [ ] **Step 2: Tests** in `test_nachrechnung.py`:
  - `test_fundTER_null_ohne_grund_wird_gemeldet`: `{"annahmen": {"fundTER": 0}}` → `["fundTER"]`
  - `test_fundTER_null_mit_grund_frei`: `{"annahmen": {"fundTER": 0}, "annahmenGrund": {"fundTER": "S. 2: ‚Kosten der Fonds sind in den laufenden Kosten enthalten‘"}}` → `[]`
  - `test_fundTER_null_leerer_grund_wird_gemeldet`: Grund `"  "` → `["fundTER"]`
  - `test_fundTER_positiv_ohne_grund_frei`: `{"annahmen": {"fundTER": 0.0007}}` → `[]`
  - `test_gamma_null_ohne_grund_frei`: `{"annahmen": {"gammaAnnualRate": 0}}` → `[]`
  - `test_main_rot_bei_fundTER_null_ohne_grund`: Tarifdatei in `tempfile` mit sonst grünem Musterfall (Kopie eines bestehenden Belegs) und gestrichenem `annahmenGrund` → `main([...])` gibt 1 zurück.
- [ ] **Step 3: RED** mit Assertion-Fehlern (nicht Importfehler).
- [ ] **Step 4: Umsetzen**, `main()` ruft die Funktion je Prüfeintrag. Leerer String nach `strip()` zählt als fehlend.
- [ ] **Step 5: GREEN:** Python 66 + 6 = **72**, Nachrechnung über den Bestand EXIT=0 (alle Treffer aus Z1 erledigt). Ist der Bestand rot, ist Z1 unvollständig: melden, nicht den Wächter lockern.
- [ ] **Step 6: Commit** „H2-Z2: Wächter fundTER 0 nur mit annahmenGrund“. Danach Mutation: Bedingung `== 0` zu `< 0` → mindestens ein Test rot; Rückbau, `git diff --exit-code`.

### Task Z3: Bayerische BavariaDIREKT

**Files:** `data/app/tarife/die-bayerische--bavariadirekt.json`, `tariffs.json` (Build). Nicht: `die-bayerische--bavariadirekt-jpm-healthcare.json`, `die-bayerische--nettotarif.json`.

- [ ] **Steps A1–A11 des Erstlauf-Ablaufs** mit diesen Abweichungen: A4 entfällt (Entscheidung 3); in `beleg.hinweis`: „Zuordnung: Fonds-Police Hallo Zukunft, von Nyko bestätigt am 08.11.2026; der Produktname steht nicht im Blatt.“ Laut Entscheidungsblatt fehlt die TER im Blatt: TER aus der Fondsübersicht „Hallo Zukunft“ derselben Domain (Adresse in der Auslese) oder Annahme mit Grund nach Z2; ohne beides kein grüner Musterfall → kein Beleg. A7b Wertvergleich; Modellwert geändert → Commit „Beleg Bayerische BavariaDIREKT (H2-Z3) [ändert Werte]“, sonst ohne Zusatz.

### Task Z4: Cosmos Direkt Privat-Rente Online

**Files:** `data/app/tarife/cosmos-direkt--privat-rente-online.json`, `tariffs.json`. Nicht: `cosmos-direkt--online-ishares-core-msci-world.json`.

- [ ] **Steps A1–A11** wie Z3; Blätter `BIB_CFRS_<laufzeit>_09.26.pdf` (laufend) und `BIB_CFRSE_20_09.26.pdf` (Einmal) laut Auslese; Hinweis „Zuordnung: FlexInvest (CFRS), von Nyko bestätigt am 08.11.2026; ob es das einzige Fondsprodukt der Schicht ist, ist nicht belegt.“ Vorher `cosmosdirekt.de/nutzungsbedingungen/` lesen (Global Constraints). Commit wie Z3.

### Task Z5: R+V IndexInvest Premium

**Files:** `data/app/tarife/r-v--indexinvest-premium.json`, `tariffs.json`.

- [ ] **Steps A1–A11** wie Z3; Blätter `…/B02-20260901-20-K00000-IV16.PDF` (laufend) und `…-IVE16.PDF` (Einmal) auf `c2.ruv.de` laut Auslese. Hinweis „Zuordnung: R+V-PrivatRente IndexInvest, von Nyko bestätigt am 08.11.2026 (nicht VR-Mitglieder-PrivatRente).“ Review Focus 3 beachten: Kosten, die sich nur über Indexbeteiligung oder Cap abbilden ließen, sind kein α/β/γ/κ → kein Beleg, Grund in die Abschlussliste. betaEinmal nur, wenn das Feld im Schema existiert. Commit wie Z3.

### Task Z6: Abschluss

- [ ] **Step 1: Volle Prüfung** (Befehle aus Global Constraints, dazu `npm ci`, `npm run build`, Nachrechnung). Erwartet alle EXIT=0, Python 72, Node = Vorlauf, Musterfälle 21 + je neuem Beleg die Zahl seiner Prüfeinträge.
- [ ] **Step 2: Quote** `python3 -I scripts/blatt/quote.py`, vorher/nachher mit Befehl.
- [ ] **Step 3: Abschlussliste** im Bericht (nicht im Repo): Z1 je Tarif (a/b/c, Zitat oder Abweichung), Z3–Z5 je Tarif (belegt/nicht belegt, Grund, Abweichung der Nachrechnung, wertändernd alt → neu je Feld).
- [ ] **Step 4: Zitatprüfung:** jeder neue `wortlaut` und jeder `annahmenGrund` per `grep -F` im Blatttext; danach `rm -rf <scratch>/blatt`.
- [ ] **Step 5: Abschlusskontrolle:** sauberer Baum, `git log --oneline origin/main..HEAD`, kein PDF und kein Blatttext im Diff (`git diff --stat origin/main..HEAD | grep -iE "pdf|\.txt"` leer), Wettbewerber-Prüfung ohne Treffer.
- [ ] **Step 6: Bericht** an den Lead: Vorlauf/Endzahlen, RED-Ausgaben, Mutationsprobe mit Rückbau, Quote, Abschlussliste, Kurz-SHAs, wertändernde Commits getrennt genannt.

## Nach dem Merge (Lead, nicht Teil des Plans)

- Wertändernde Belege wirken sofort live (`TariffEndpoint` liest `main/tariffs.json`). Im iOS-Repo danach `Tests/Fixtures/tariffs-live.json` erneuern und Presets nachziehen, bis `BundleSpiegeltLiveTests` grün ist (Projekt-CLAUDE.md); eigener iOS-PR.
- Fragen 4, 7, 8 des Entscheidungsblatts bleiben offen.
