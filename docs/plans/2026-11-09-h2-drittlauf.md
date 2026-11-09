> Plan zu Stufe 1, Block B2 H2 „Belege, Drittlauf“ (Branch `claude/h2-drittlauf`, Repo `patina-tariffs`). Erstellt 09.11.2026 aus dem Nachtrag Nykos vom 08.11.2026 im Entscheidungsblatt (Vault `02 Projekte/Patina Charts/Decisions/2026-10-26 H2 Entscheidungsblatt Woche 4.md`, Abschnitt „Nachtrag Nyko“) und Nykos Antworten vom 09.11.2026. Basis `origin/main` `f1fe57e`. Läuft unbeaufsichtigt (Nyko AFK): kein Push, kein PR, kein Merge durch Sub-Agents.

# H2 Belege, Drittlauf: TER der Fondsgesellschaft, Bayerische und R+V ans Blatt, JPM-TER ans KID — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Umsetzung und Fix-Runden `umsetzer`, Review `task-reviewer`, parallel `agy` (Modus prüfen) auf den Diff je Task. Recherche (D0) `web-rechercheur`.

**Goal:** (1) Bayerische BavariaDIREKT und Cosmos Direkt Privat-Rente Online bekommen einen `beleg`, wenn die TER der Fondsgesellschaft (Factsheet oder Basisinformationsblatt, wörtliches Zitat mit Seite und Abrufdatum in `annahmenGrund`) den Musterfall grün macht. (2) Bayerische: `betaRate` 0 → 0,09 und `kappaMonthly` 0,7958 → 2,75; R+V IndexInvest Premium: `betaRate` 0,04 → 0,049 (Werte ans Blatt). (3) JPM Global Healthcare und JPM US Technology: `ter` 0,019 → 0,017 bzw. 0,0168 laut KID.

**Architecture:** Kein neues Schema, kein neues Modellfeld. Werkzeuge (`holen.py`, `nachrechnung.py`, `quote.py`, `npm run build:ios`) bestehen. Blätter liegen nie im Repo.

## Entscheidungen Nyko (gehen dem Tasktext vor)

1. (08.11.) TER der Fondsgesellschaft zählt als Quelle, wenn das wörtliche Zitat mit Seite und Abrufdatum in `annahmenGrund` steht.
2. (08.11.) App-Werte ans Blatt nach Regel 13: Bayerische (β 0 → 9 %, κ 0,80 → 2,75), R+V (β 0,04 → 4,9 %). Eigene Commits mit „[ändert Werte]“, alt gegen neu mit Wirkung auf Demo und Rangfolge im Bericht, **Merge erst nach Nykos Ja**.
3. (09.11.) JPM-TER ans KID: Healthcare 1,70 %, US Technology 1,68 %.
4. (09.11.) WKN mit nur einer Portalquelle (iShares, JPM US Tech, Templeton, Fidelity) abgenommen. Nichts zu tun.
5. Zuordnungen aus dem Zweitlauf gelten (Bayerische = „Fonds-Police Hallo Zukunft“, Cosmos = FlexInvest CFRS, R+V = R+V-PrivatRente IndexInvest).
6. **Nicht freigegeben, nicht ändern:** Bayerische `alphaRate` (Blatt 2,5 % statt 2,87 %), R+V `gammaAnnualRate` (Blatt 0,5 % statt 0,3 %), `fundTER` im Tarif `die-bayerische--bavariadirekt-jpm-healthcare`. Nur im Bericht nennen.
7. Toleranzen unverändert. Grün nur durch eine Annahme, die die Quelle trägt.

## Global Constraints

- Arbeitsverzeichnis ausschließlich `/Users/nyko/Developer/worktrees/tariffs-h2-drittlauf`, Branch `claude/h2-drittlauf`. Jeder Shell-Befehl beginnt mit `cd` dorthin.
- Es gelten aus `docs/plans/2026-11-08-h2-zweitlauf.md` die „Global Constraints“ (Holen nur per `holen.py`, Exit 2/3/4 = nicht belegt, Nutzungsbedingungen vor dem Holen lesen, Lesart α/β, `tariffs.json` nur per Build, Wettbewerber-Prüfung vor jedem Commit, TDD, Mutationsproben nie per `git checkout`) und aus `docs/plans/2026-10-25-h2-belege-erstlauf.md` der „Tarif-Ablauf“ A1–A11, mit dem Worktree-Pfad oben statt dem dort genannten.
- Blätter und Factsheets je Tarif in `<scratch>/blatt/<slug>/`, `<scratch>` = `/private/tmp/claude-501/-Users-nyko-Documents-Claude-Projekte-patina-charts-ios/aae725c3-9f9b-426f-a146-2f0d06cbac9f/scratchpad/h2-drittlauf`.
- Factsheets der Fondsgesellschaft: Fondsgesellschaften sind keine Versicherer, die Sperrliste (HDI, AXA, Swiss Life, Allianz, Alte Leipziger) gilt für **alle** Domains dieser Konzerne, also auch Allianz Global Investors. Keine Vergleichsportale als Quelle.
- Vorlauf in D1 Schritt 1 zählen (Python-Tests, Node-Tests, Musterfälle, Quote) und im Bericht nennen.
- Commits lokal, je Task ein Commit; Nachricht endet mit `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01UQh3mTBepmWiYHktnQGwH9`.
- Unbeaufsichtigt: keine Rückfragen; jede Annahme als Zeile im Bericht. Nur einzelne Dateien stagen. Höchstens 3 verschiedene Fixes je Fehler, dann Blocker.

## Review Focus

1. **Zitat echt:** Jeder `annahmenGrund` und jede TER per `grep -F` im Text des geladenen Dokuments auffindbar; Seite und Abrufdatum stehen dabei.
2. **Richtiger Fonds:** Die TER gehört zu dem Fonds, auf den sich der Musterfall bezieht (Unterkante = günstigste Anlageoption laut Blatt). Eine TER eines anderen Fonds macht den Beleg ungültig.
3. **Nur freigegebene Werte geändert:** Modellfelder alt gegen neu je Datei; kein anderes Feld bewegt (Entscheidung 6).
4. **Gegentest:** β falsch um Faktor 2 und TER weggelassen machen den Musterfall rot.

---

### Task D0: Quellen finden (web-rechercheur, schreibt nur in `<scratch>/d0-quellen.md`)

- Bayerische „Fonds-Police Hallo Zukunft“: Fondsliste auf `diebayerische.de` (Adresse aus der Auslese `…/assets/daten/die-bayerische--bavariadirekt.json`, Vault, nur lesen). Welcher Fonds ist die Unterkante des Blatts (günstigste Option, laut Auslese TER um 0,1 %)? Direkte URL zu Factsheet oder KID der Fondsgesellschaft, TER-Zeile wörtlich.
- Cosmos Direkt FlexInvest (CFRS): Fonds der Unterkante, URL zu Factsheet oder KID der Fondsgesellschaft, TER-Zeile wörtlich. Vorher `cosmosdirekt.de/nutzungsbedingungen/` lesen.
- JPM Global Healthcare A (acc) EUR (LU0880062913) und JPM US Technology A (acc) EUR (LU0159052710): direkte KID-URL bei `am.jpmorgan.com`, Zeile „laufende Kosten“ wörtlich.
- Je Quelle: URL, Dokumentstand, Seite, Zitat. Keine Werte aus Portalen. Nicht gefunden = so melden.

### Task D1: JPM-TER ans KID [ändert Werte]

**Files:** `data/app/funds/LU0880062913.json`, `data/app/funds/LU0159052710.json`, `tariffs.json` (Build).

- [ ] Vorlauf zählen (Constraints).
- [ ] KIDs per `holen.py` aus den D0-URLs laden, `pdftotext -layout`, Zeile per `grep -F` belegen. Weicht der Wert von 1,70 % bzw. 1,68 % ab: nicht schreiben, Blocker mit Zitat.
- [ ] `ter` auf 0.017 bzw. 0.0168 setzen, `npm run build:ios`, Diff von `tariffs.json` auf genau diese zwei Werte (plus Build-Stempel) prüfen.
- [ ] Commit „JPM-TER ans KID (H2-D1) [ändert Werte]“, Commit-Text nennt KID-URL, Stand, Seite und Zitat je Fonds (die Fondsdateien haben kein Quellenfeld).

### Task D2: Bayerische BavariaDIREKT [ändert Werte]

**Files:** `data/app/tarife/die-bayerische--bavariadirekt.json`, `tariffs.json`.

- [ ] Ablauf A1–A11 wie Zweitlauf Z3. Werte: `betaRate` 0.09, `kappaMonthly` 2.75 (Entscheidung 2), sonst keine Modellwerte ändern (Entscheidung 6). Musterfall der Unterkante mit `annahmen.fundTER` = TER aus D0 und `annahmenGrund` mit Zitat, Seite, URL, Abrufdatum.
- [ ] Grün: `beleg` schreiben. Rot trotz TER: kein `beleg`, aber die Werte aus Entscheidung 2 trotzdem setzen; Abweichung in Prozent und Pp in den Bericht.
- [ ] Gegentest A7 auf der Kopie. Commit „Bayerische BavariaDIREKT ans Blatt (H2-D2) [ändert Werte]“.

### Task D3: Cosmos Direkt Privat-Rente Online

**Files:** `data/app/tarife/cosmos-direkt--privat-rente-online.json`, `tariffs.json`.

- [ ] Ablauf A1–A11 wie Zweitlauf Z4, mit TER aus D0. Grün: `beleg`. Ändert der Beleg einen Modellwert, ist das **nicht** freigegeben: Werte unverändert lassen, nur `beleg` ohne die abweichenden Felder in `felder`, Abweichung in den Bericht (Frage an Nyko). Rot: kein Commit, Grund in den Bericht.
- [ ] Commit „Beleg Cosmos Direkt Privat-Rente Online (H2-D3)“.

### Task D4: R+V IndexInvest Premium [ändert Werte]

**Files:** `data/app/tarife/r-v--indexinvest-premium.json`, `tariffs.json`.

- [ ] `betaRate` 0.04 → 0.049, `quelle` ergänzen um Blatt, Stand 01.09.2026 und Fundstelle („4,9 % von jedem Ihrer Beiträge“). Kein `beleg` (Index-Police passt nicht ins Kostenmodell, Zweitlauf). Build, Diff prüfen.
- [ ] Commit „R+V IndexInvest Premium: β ans Blatt (H2-D4) [ändert Werte]“.

### Task D5: Abschluss

- [ ] Volle Prüfung (Python, Node, `npm ci`, `npm run build`, Nachrechnung), Zahlen gegen den Vorlauf.
- [ ] Quote vorher/nachher.
- [ ] Wirkungstabelle: je geändertem Tarif bzw. Fonds alt → neu je Feld; Wirkung auf die Demo-Fälle und die Rangfolge (Lead rechnet im iOS-Worktree nach dem Fixture-Nachzug, siehe unten).
- [ ] Zitatprüfung per `grep -F`, danach `rm -rf <scratch>/blatt`.
- [ ] Sauberer Baum, kein PDF/Blatttext im Diff, Wettbewerber-Prüfung ohne Treffer.

## Nach den Tasks (Lead, nicht Teil des Plans)

- Push und PR als Draft; **kein Merge vor Nykos Ja** (Entscheidung 2). Der Merge wirkt sofort live; 1.5.0 übernimmt geänderte Werte bei gleichem Schlüssel (`TariffStore.merged`), neue Schlüssel gibt es hier nicht.
- iOS: Fixture `tariffs-live.json` auf den Branch-Stand, Presets nachziehen, bis `BundleSpiegeltLiveTests` grün ist; eigener iOS-PR, ebenfalls erst nach Nykos Ja mergen.
