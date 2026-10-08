/**
 * Tests fuer `build-ios.mjs` (Schema, Validierung, Ausgabe).
 *
 * `ROOT` im Skript ist fest (Elternordner von `scripts/`). Jeder Lauf baut
 * deshalb eine Fixture-Wurzel in einem Temp-Ordner, kopiert das Skript nach
 * `<Wurzel>/scripts/` und startet es dort als eigenen Prozess.
 *
 * Aufruf: node --test scripts/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKRIPT = join(dirname(fileURLToPath(import.meta.url)), "build-ios.mjs");

const FONDS = {
  isin: "IE00B4L5Y983", wkn: "A0RPWH", name: "Welt-ETF", anbieter: "Anbieter",
  kategorie: "Welt-ETF", historischePeriode: "2010-2025", beschreibung: "Test",
  ter: 0.002, historischeBruttorendite: 0.07,
};

const DOKUMENT = {
  art: "bib-laufend", url: "https://example.org/bib.pdf", stand: "Stand: 16.02.2026",
  abrufdatum: "2026-10-07", sha256: "a".repeat(64),
};

function basisTarif() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    anbieter: "Testversicherer", tarifName: "Test Fondsrente", jahrgang: "2026",
    kategorie: "Klassische Versicherer",
    alphaRate: 0.025, betaRate: 0.128, gammaAnnualRate: 0.0125, kappaMonthly: 1.5,
    fundTER: 0.002, rentenfaktor: 0.0025, effectiveCostRIY: 0.02, typischeBruttorendite: 0.06,
  };
}

function mitBeleg(tarif, felder = ["betaEinmalRate"], dokumente = [DOKUMENT]) {
  tarif.betaEinmalRate = 0.07;
  tarif.beleg = {
    dokumente,
    felder: Object.fromEntries(felder.map((f) => [f, { dokument: 0, seite: 2, wortlaut: "Einmalkosten 7,0 %" }])),
    pruefung: [{ dokument: 0, beitrag: 100, jahre: 30, einmal: false, rendite: 0.03, blatt: { riy: 0.01 } }],
  };
  return tarif;
}

/** Baut eine Fixture-Wurzel, laesst `aendere(tarif)` den Tarif anpassen und startet das Skript. */
function lauf(aendere = () => {}) {
  const wurzel = mkdtempSync(join(tmpdir(), "build-ios-test-"));
  try {
    mkdirSync(join(wurzel, "scripts"));
    mkdirSync(join(wurzel, "data", "app", "funds"), { recursive: true });
    mkdirSync(join(wurzel, "data", "app", "tarife"), { recursive: true });
    copyFileSync(SKRIPT, join(wurzel, "scripts", "build-ios.mjs"));
    writeFileSync(join(wurzel, "data", "app", "funds", `${FONDS.isin}.json`), JSON.stringify(FONDS));
    const tarif = basisTarif();
    aendere(tarif);
    writeFileSync(join(wurzel, "data", "app", "tarife", "test.json"), JSON.stringify(tarif));
    const r = spawnSync(process.execPath, [join(wurzel, "scripts", "build-ios.mjs")], { encoding: "utf8" });
    let ausgabe = null;
    try { ausgabe = JSON.parse(readFileSync(join(wurzel, "tariffs.json"), "utf8")); } catch { /* kein Bundle */ }
    return { code: r.status, stderr: r.stderr, stdout: r.stdout, ausgabe };
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
}

const STAFFEL = [{ abJahr: 1, rate: 0.194 }, { abJahr: 10, rate: 0.105 }];

// ───── betaStaffel ─────

test("(a) Staffel, deren erste Stufe nicht bei Jahr 1 beginnt, bricht den Build ab", () => {
  const r = lauf((t) => { t.betaStaffel = [{ abJahr: 2, rate: 0.194 }, { abJahr: 10, rate: 0.105 }]; });
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /betaStaffel/);
  assert.equal(r.ausgabe, null);
});

test("(b) fallende abJahr bricht den Build ab", () => {
  const r = lauf((t) => { t.betaStaffel = [{ abJahr: 1, rate: 0.194 }, { abJahr: 10, rate: 0.105 }, { abJahr: 5, rate: 0.1 }]; });
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /betaStaffel/);
});

test("gleiche abJahr zaehlt nicht als streng steigend", () => {
  const r = lauf((t) => { t.betaStaffel = [{ abJahr: 1, rate: 0.194 }, { abJahr: 1, rate: 0.105 }]; });
  assert.equal(r.code, 1, r.stdout + r.stderr);
});

test("(c) betaRate ausserhalb der Stufensaetze bricht den Build ab (Fallback vergessen)", () => {
  const r = lauf((t) => { t.betaRate = 0.30; t.betaStaffel = STAFFEL; });
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /betaRate/);
});

test("betaRate innerhalb des Bereichs, aber unter dem kleinsten Stufensatz, meldet die Staffel", () => {
  const r = lauf((t) => { t.betaRate = 0.08; t.betaStaffel = STAFFEL; });
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /betaStaffel/);
});

test("betaRate genau auf einem Stufensatz ist erlaubt", () => {
  const r = lauf((t) => { t.betaRate = 0.105; t.betaStaffel = STAFFEL; });
  assert.equal(r.code, 0, r.stdout + r.stderr);
});

test("Staffel: leer, kein Array, rate ausserhalb [0; 0,25], abJahr nicht ganzzahlig -> Fehler", () => {
  const faelle = {
    leer: [],
    "kein Array": { abJahr: 1, rate: 0.1 },
    "rate zu hoch": [{ abJahr: 1, rate: 0.26 }],
    "rate negativ": [{ abJahr: 1, rate: -0.01 }],
    "abJahr gebrochen": [{ abJahr: 1, rate: 0.13 }, { abJahr: 2.5, rate: 0.12 }],
    "rate fehlt": [{ abJahr: 1 }],
  };
  for (const [name, staffel] of Object.entries(faelle)) {
    const r = lauf((t) => { t.betaStaffel = staffel; });
    assert.equal(r.code, 1, `${name}: ${r.stdout}${r.stderr}`);
  }
});

test("(d) gueltige Staffel: Exit 0, tariffs.json enthaelt betaStaffel unveraendert", () => {
  const r = lauf((t) => { t.betaStaffel = STAFFEL; });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.ausgabe.tarife[0].betaStaffel, STAFFEL);
  assert.equal(r.ausgabe.tarife[0].betaRate, 0.128);
});

// ───── Beleg ─────

test("(e) belegtes Feld erscheint als belegteFelder, der Beleg selbst bleibt draussen", () => {
  const r = lauf((t) => mitBeleg(t));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const tarif = r.ausgabe.tarife[0];
  assert.deepEqual(tarif.belegteFelder, { betaEinmalRate: "bib" });
  assert.equal("beleg" in tarif, false);
  assert.equal(tarif.belegStand, "16.02.2026");
});

test("Beleg-Art wird auf bib | muster-pib | fondsuebersicht abgebildet", () => {
  const dokumente = [
    { ...DOKUMENT, art: "bib-laufend", stand: "Stand 01.03.2026" },
    { ...DOKUMENT, art: "bib-einmal", stand: "Stand 02.03.2026" },
    { ...DOKUMENT, art: "muster-pib", stand: "Stand 03.03.2026" },
    { ...DOKUMENT, art: "fondsuebersicht", stand: "Stand 04.03.2026" },
  ];
  const r = lauf((t) => {
    mitBeleg(t, ["betaEinmalRate"], dokumente);
    t.fundTER = 0.002;
    t.beleg.felder = {
      betaEinmalRate: { dokument: 1, seite: 1, wortlaut: "x" },
      alphaRate: { dokument: 0, seite: 1, wortlaut: "x" },
      betaRate: { dokument: 2, seite: 1, wortlaut: "x" },
      fundTER: { dokument: 3, seite: 1, wortlaut: "x" },
    };
  });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.ausgabe.tarife[0].belegteFelder, {
    betaEinmalRate: "bib", alphaRate: "bib", betaRate: "muster-pib", fundTER: "fondsuebersicht",
  });
  assert.equal(r.ausgabe.tarife[0].belegStand, "04.03.2026");
});

test("belegStand ist das juengste Datum, nicht das zuletzt genannte", () => {
  const dokumente = [
    { ...DOKUMENT, stand: "Stand Basisinformationsblatt: 17.08.2026 (BIB_FV25)" },
    { ...DOKUMENT, stand: "01.12.2025" },
  ];
  const r = lauf((t) => mitBeleg(t, ["betaEinmalRate"], dokumente));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.ausgabe.tarife[0].belegStand, "17.08.2026");
});

test("Dokument-Stand ohne Datum: Build laeuft mit Warnung, belegStand entfaellt", () => {
  const r = lauf((t) => mitBeleg(t, ["betaEinmalRate"], [{ ...DOKUMENT, stand: "kein Stand ausgewiesen" }]));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /belegStand/);
  assert.equal("belegStand" in r.ausgabe.tarife[0], false);
  assert.deepEqual(r.ausgabe.tarife[0].belegteFelder, { betaEinmalRate: "bib" });
});

test("unbekannte Beleg-Art ist ein Validierungsfehler", () => {
  const r = lauf((t) => mitBeleg(t, ["betaEinmalRate"], [{ ...DOKUMENT, art: "pib-sonstiges" }]));
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /art/);
});

test("betaStaffel ist belegbar; ohne Staffel im Tarif bricht der Build ab", () => {
  const ok = lauf((t) => { mitBeleg(t, ["betaStaffel"]); t.betaStaffel = STAFFEL; });
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.deepEqual(ok.ausgabe.tarife[0].belegteFelder, { betaStaffel: "bib" });
  const ohne = lauf((t) => { mitBeleg(t, ["betaStaffel"]); });
  assert.equal(ohne.code, 1, ohne.stdout + ohne.stderr);
  assert.match(ohne.stderr, /betaStaffel/);
});

test("beleg.vereinfachungen: Liste nicht leerer Strings erlaubt, sonst Fehler; bleibt aus der Ausgabe", () => {
  const ok = lauf((t) => { mitBeleg(t); t.beleg.vereinfachungen = ["gamma nur als Spanne belegt"]; });
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal("beleg" in ok.ausgabe.tarife[0], false);
  assert.equal("vereinfachungen" in ok.ausgabe.tarife[0], false);
  for (const falsch of ["text", [], [""], ["  "], [1]]) {
    const r = lauf((t) => { mitBeleg(t); t.beleg.vereinfachungen = falsch; });
    assert.equal(r.code, 1, `${JSON.stringify(falsch)}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /vereinfachungen/);
  }
});

// ───── Kompatibilitaetswaechter ─────

test("(f) unbekannter Schluessel am Tarif bricht den Build ab", () => {
  const r = lauf((t) => { t.foo = 1; });
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /foo/);
});

test("Ausgabe ohne Staffel und ohne Beleg hat keine neuen Schluessel", () => {
  const r = lauf();
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(Object.keys(r.ausgabe.tarife[0]).sort(), Object.keys(basisTarif()).sort());
  assert.equal(r.ausgabe.version, 1);
});

test("Ausgabe-Schluessel ausserhalb der Altliste sind nur betaStaffel, belegteFelder, belegStand", () => {
  const alt = new Set(Object.keys(basisTarif()));
  const r = lauf((t) => { mitBeleg(t); t.betaStaffel = STAFFEL; });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const neu = Object.keys(r.ausgabe.tarife[0]).filter((k) => !alt.has(k) && k !== "betaEinmalRate");
  assert.deepEqual(neu.sort(), ["belegStand", "belegteFelder", "betaStaffel"]);
});

test("Pflichtfelder behalten ihren Typ: betaRate als String bricht den Build ab", () => {
  const r = lauf((t) => { t.betaRate = "0.128"; });
  assert.equal(r.code, 1, r.stdout + r.stderr);
});
