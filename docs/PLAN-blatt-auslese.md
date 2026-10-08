# Plan: Tarifkosten automatisch aus dem Basisinformationsblatt

Stand 05.10.2026. Nur Plan, kein Code. Bezug: iOS PR #121 (Plan
Beitragskosten), iOS PR #122 und Tarif-Repo PR #33 (Etappe 1, Continentale).

## Problem

Die Continentale wurde am 05.10. von Hand ausgewertet: Blatt finden, Kosten
lesen, nachrechnen, in zwei Repos eintragen. Das dauert pro Tarif einen
halben Abend und skaliert nicht auf 61 Tarife. Gleichzeitig stammen die
meisten Kostenwerte heute aus W's Datenbestand (`quelle: "externe Quelle"`,
PR #32). Das ist ein eigenes Rechtsrisiko und nachweislich ungenau: W's
„15,63 %" bei der Continentale ist kein Tarifwert, sondern ein Ersatzsatz.

Ziel: Blatt rein, Tarifwerte mit Beleg raus. Nyko prüft nur, was die
Selbstprüfung nicht besteht.

## Grundlagen (belegt)

- **Jedes Blatt ist öffentlich.** Art. 5 Abs. 1 VO (EU) 1286/2014: Der
  Hersteller veröffentlicht das Basisinformationsblatt auf seiner Website.
  Beispiel Continentale: `continentale.de/basisinformationsblatt`, je Tarif
  Blätter für 12 und 20 Jahre, dazu ein Blatt „Einmalbetrag" (`RI_20_EB`).
- **Das Blatt für Einmalbetrag belegt den Einmal-Satz.** Heute stammen die
  5,5 % der Continentale aus W. Mit dem EB-Blatt gibt es dafür eine eigene
  Quelle.
- **Fondskosten je ISIN.** Die Continentale veröffentlicht eine
  Fondsübersicht (PDF, 13 Seiten) mit ISIN und laufenden Kosten je Fonds,
  z. B. F21 iShares Core MSCI World, IE00B4L5Y983, 0,20 %.
- **Die Kostentabelle ist nur halb einheitlich.** Die Kostenarten sind
  vorgegeben, die Formulierungen nicht („% der eingezahlten Anlage",
  „% der noch ausstehenden Anlage", „EUR pro Jahr"). Die Verbraucherzentrale
  fand 2018 bei 26 Blättern uneinheitliche Darstellung. Deshalb ein
  Sprachmodell zum Auslesen, keine festen Suchmuster.
- **Das Blatt prüft sich selbst.** Jedes Blatt rechnet einen Musterfall
  vor (Continentale: 1.000 €/Jahr, 20 Jahre, „Kosten insgesamt" 2.296 € bis
  8.799 €). Mit den ausgelesenen Werten nachgerechnet: 2.332 € bis 2.415 €
  beim günstigsten Fonds, 2 bis 5 % neben dem Blatt. Ohne den 0,3 %-Posten
  wären es rund 1.760 €, gut 20 % daneben. Ein übersehener Posten fällt auf.
- **Rürup und Riester haben kein solches Blatt.** Laut Continentale
  bekommen geförderte Produkte kein Basisinformationsblatt. Dort gilt das
  Muster-PIB nach AltvPIBV mit Kosten in Euro (§ 7) und Effektivkosten
  (§ 8). Das ist ein eigener Weg und nicht Teil dieser Etappen.

## Bestand (iOS-Repo, Inventur 05.10.)

| Werkzeug | Kann | Fehlt |
|---|---|---|
| `tools/extract-pib.py` | PDF an Claude, JSON mit Sicherheit je Feld, `needs_review`, Abgleich PIB gegen Blatt | Nie mit echtem Dokument gelaufen; setzt Standardwerte; kennt weder Einmal-Satz noch Restbeiträge; schreibt ins alte Format |
| `tools/merge-tariffs.py` | Schema-Prüfung, Ausreißer-Schwellen, `CHANGES.md` | Zielt auf die alte Einzeldatei, nicht `data/app/tarife/*.json` |
| `DokumentParser.swift` + Prüfmaske | Auslesen in der App mit Mensch im Ablauf | Nur lokal in der App, nur Testtexte |

Es gibt keine Liste mit Dokument-Adressen je Tarif und kein Beleg-Feld außer
dem freien Text `quelle`.

**Empfehlung:** Die Pipeline entsteht hier im Tarif-Repo
(`scripts/blatt/`), weil hier die Daten liegen. Prompt und Plausibilitäts-
bereiche aus `extract-pib.py` werden übernommen, nicht neu erfunden. Die
Werkzeuge im iOS-Repo werden danach abgelöst.

## Ablauf

1. **Quellenliste** `data/quellen/<tarif-slug>.json`: Adresse des Blatts
   (laufend, Einmalbetrag), Fondsübersicht, Abrufdatum, SHA-256 der Datei.
2. **Holen:** PDF laden, Prüfsumme vergleichen. Unverändert → nichts tun.
   Vor dem ersten Abruf je Domain `robots.txt` und Nutzungsbedingungen auf
   einen maschinenlesbaren Vorbehalt prüfen (§ 44b UrhG). PDFs kommen nicht
   ins Repo, nur Zahlen, Zitat und Adresse; Zwischenkopien werden gelöscht.
3. **Auslesen:** Claude mit festem Schema: α (% der Beitragssumme), β, β
   Einmal, γ, κ, Restbeitragssatz, Fonds-TER-Spanne, Transaktionskosten,
   Musterfall (Anlage pro Jahr, Haltedauer, Kosten insgesamt je Haltedauer).
   Je Wert das wörtliche Zitat und die Seite. Nicht gefunden = leer, nie ein
   Standardwert.
4. **Selbstprüfung:** Musterfall mit den ausgelesenen Werten nachrechnen.
   Abweichung bis 5 % = bestanden. Darüber = Bericht an Nyko mit Zitaten,
   kein Schreiben.
5. **Schreiben:** bestandene Werte in `data/app/tarife/<slug>.json`, dazu ein
   neues Feld `beleg` (Dokument, Stand, Adresse, Seite, Abrufdatum). `quelle`
   bleibt als Kurztext. Tarife ohne Blatt behalten ihre Werte und die
   Herkunft „Schätzwert".
6. **Fondskosten:** Fonds-TER je Tarif über die ISIN des Depot-ETFs aus der
   Fondsübersicht des Versicherers (Entscheidung vom 05.10.: Police und
   Depot rechnen mit demselben ETF). Ist der ETF nicht im Angebot: der
   nächstliegende Welt-Aktien-ETF, im Beleg benannt.

## Etappen (je ein Abend)

**A: Ausleser an der Continentale.** `scripts/blatt/auslesen.py`, Lauf auf
`RI-2026_01_RI_20.pdf`. Abnahme: liefert genau die Handwerte vom 05.10.
(2,5 %, 4,4 %, 12 €/J., 0,3 % ausstehend, Musterfall 2.296 €).
Minimalfassung in 20 Minuten: nur der Lauf, Ausgabe gegen die Handwerte
gelesen. Dabei die API-Kosten je Blatt messen.

**B: Selbstprüfung und Schreiben.** Nachrechnung des Musterfalls, Feld
`beleg` im Schema, Schreiben nach `data/app/tarife`. Gegentest: Blatt-Text
ohne die Zeile „0,3 % der noch ausstehenden Anlage" → Selbstprüfung muss
rot werden. Zweiter Gegentest: absichtlich falscher β → rot.

**C: Alle Tarife.** Ein Agent sucht die Blatt-Adressen der 61 Tarife und
legt die Quellenliste an. Ein Lauf über alle, Bericht: bestanden, nicht
bestanden, kein Blatt gefunden. Abnahme: Liste der Tarife, deren Werte sich
gegenüber W's Datenbestand ändern, mit Euro-Wirkung im Demo-Fall.

**D: Fondskosten und Einmal-Satz.** Fondsübersichten je Versicherer,
Einmalbetrag-Blätter, wo es sie gibt.

**E (optional): Regelmäßiger Abgleich.** Prüfsummen wöchentlich
vergleichen, bei neuem Blatt Lauf und PR. Erst nach C entscheiden, ob es
sich lohnt; GitHub-Actions-Budget beachten.

## Offene Fragen

1. API-Schlüssel: als Umgebungsvariable aus Proton Pass, nie im Repo.
   Läuft der Ausleser nur lokal bei Nyko oder auch in CI?
2. Toleranz der Selbstprüfung: 5 % ist aus einem einzigen Blatt
   abgeleitet. Nach C anhand der Verteilung neu festlegen.
3. Rürup/Basisrente: eigener Plan für das Muster-PIB (Euro-Beträge statt
   Prozentsätzen).
4. Rechtliche Kurzprüfung vor dem Livegang (§ 44b, § 87b UrhG). Die
   Recherche vom 05.10. ersetzt sie nicht.

## Nicht in diesem Plan

- Rentenfaktor (steht nicht im Blatt, kommt aus Angebot oder AVB).
- Kauf von Tarifdaten (SIX, Ratingagenturen). Erst wenn C zeigt, dass zu
  viele Tarife ohne Blatt bleiben.
- Ablösung der Werkzeuge im iOS-Repo (`extract-pib.py`, `merge-tariffs.py`).
