#!/usr/bin/env node
/**
 * Baut `tariffs.json` im Repo-Root — das Bundle, das die PatinaCharts
 * iOS-App unter
 *   https://raw.githubusercontent.com/nyko073006/patina-tariffs/main/tariffs.json
 * abruft (siehe `Services/TariffEndpoint.swift` in patina-charts-ios).
 *
 * Nicht zu verwechseln mit `dist/tariffs.json` aus `build.mjs`: das ist
 * das Bundle fuer das Web-Frontend mit einem voellig anderen Schema
 * (andere Felder, TER in Prozent statt als Anteil). Die App-Daten liegen
 * bewusst getrennt unter `data/app/`, damit der EODHD-Sync sie nicht
 * anfasst.
 *
 * Quelle:  data/app/funds/<ISIN>.json
 *          data/app/tarife/<slug>.json
 * Ziel:    tariffs.json  (committet, damit GitHub-Raw es ausliefert)
 *
 * Aufruf:  npm run build:ios [-- --force]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "tariffs.json");
const FORCE = process.argv.includes("--force");

/** Schema-Version, die die App akzeptiert (`TariffPayload.supportedVersion`). */
const SCHEMA_VERSION = 1;

// Enum-Werte — muessen exakt den `rawValue`s der App-Enums entsprechen.
// Ein Tippfehler hier heisst: `compactMap` in der App wirft den Eintrag
// still weg und der Berater sieht ihn nie.
const FONDS_KATEGORIEN = new Set([
  "Welt-ETF", "Sektor-ETF", "Sektor-Fonds (aktiv)", "Multi-Asset", "Aktiv Welt",
]);
const TARIF_KATEGORIEN = new Set([
  "Strukturvertrieb", "Klassische Versicherer", "Index-Police",
  "Sektor- & Top-Fonds", "Nettotarife (Honorarberatung)",
]);
const VEHIKEL_TYPEN = new Set([
  "Schicht 1 — Rürup", "Schicht 2 — Riester",
  "Schicht 3 — Privatrente", "Altersvorsorge-Depot (ab 2027)",
]);

const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

const fehler = [];
const warnungen = [];

function lade(unterordner) {
  const dir = join(ROOT, "data", "app", unterordner);
  if (!existsSync(dir)) {
    fehler.push(`Ordner fehlt: data/app/${unterordner}`);
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf8"));
      } catch (e) {
        fehler.push(`${unterordner}/${f}: kein gueltiges JSON — ${e.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

function pflichtfeld(obj, feld, typ, quelle) {
  const wert = obj[feld];
  if (wert === undefined || wert === null) {
    fehler.push(`${quelle}: Feld "${feld}" fehlt`);
    return false;
  }
  if (typeof wert !== typ) {
    fehler.push(`${quelle}: "${feld}" muss ${typ} sein, ist ${typeof wert}`);
    return false;
  }
  if (typ === "string" && wert.trim() === "") {
    fehler.push(`${quelle}: "${feld}" ist leer`);
    return false;
  }
  return true;
}

function imBereich(obj, feld, min, max, quelle) {
  const w = obj[feld];
  if (typeof w !== "number" || Number.isNaN(w)) return;
  if (w < min || w > max) {
    fehler.push(`${quelle}: "${feld}" = ${w} liegt ausserhalb [${min}, ${max}] — Prozent/Anteil verwechselt?`);
  }
}

// ───── Fonds ─────

const fonds = lade("funds");
const gesehenISIN = new Set();

for (const f of fonds) {
  const quelle = `funds/${f.isin ?? "?"}`;
  const ok = ["isin", "name", "anbieter", "kategorie", "historischePeriode", "beschreibung"]
    .map((feld) => pflichtfeld(f, feld, "string", quelle))
    .every(Boolean);
  // WKN darf leer sein: bei ein paar via OpenFIGI identifizierten Fonds
  // liess sie sich nicht aufloesen. Identifier ist die ISIN, die WKN ist
  // reine Anzeige.
  if (typeof f.wkn !== "string") fehler.push(`${quelle}: "wkn" muss string sein`);
  else if (f.wkn.trim() === "") warnungen.push(`${quelle}: keine WKN hinterlegt`);
  ["ter", "historischeBruttorendite"].forEach((feld) => pflichtfeld(f, feld, "number", quelle));
  if (!ok) continue;

  if (!ISIN_RE.test(f.isin)) fehler.push(`${quelle}: ISIN formal ungueltig`);
  if (gesehenISIN.has(f.isin)) fehler.push(`${quelle}: ISIN doppelt vergeben`);
  gesehenISIN.add(f.isin);

  if (!FONDS_KATEGORIEN.has(f.kategorie)) {
    fehler.push(`${quelle}: Kategorie "${f.kategorie}" kennt die App nicht — erlaubt: ${[...FONDS_KATEGORIEN].join(", ")}`);
  }
  // TER und Rendite sind Anteile, keine Prozentwerte.
  imBereich(f, "ter", 0, 0.05, quelle);
  imBereich(f, "historischeBruttorendite", -0.5, 0.25, quelle);

  if (f.historischeBruttorendite > 0.12) {
    warnungen.push(`${quelle}: ${(f.historischeBruttorendite * 100).toFixed(2)} % p.a. — als Projektionsrendite ueber lange Laufzeiten kritisch, Quelle pruefen`);
  }
}

// ───── Tarife ─────

const tarife = lade("tarife");
const gesehenID = new Set();

for (const t of tarife) {
  const quelle = `tarife/${t.anbieter ?? "?"} ${t.tarifName ?? ""}`.trim();
  const ok = ["id", "anbieter", "tarifName", "jahrgang", "kategorie"]
    .map((feld) => pflichtfeld(t, feld, "string", quelle))
    .every(Boolean);
  ["alphaRate", "betaRate", "gammaAnnualRate", "kappaMonthly", "fundTER",
   "rentenfaktor", "effectiveCostRIY", "typischeBruttorendite"]
    .forEach((feld) => pflichtfeld(t, feld, "number", quelle));
  if (!ok) continue;

  if (!UUID_RE.test(t.id)) fehler.push(`${quelle}: id "${t.id}" ist keine UUID`);
  if (gesehenID.has(t.id)) fehler.push(`${quelle}: id doppelt vergeben`);
  gesehenID.add(t.id);

  if (!TARIF_KATEGORIEN.has(t.kategorie)) {
    fehler.push(`${quelle}: Kategorie "${t.kategorie}" kennt die App nicht — erlaubt: ${[...TARIF_KATEGORIEN].join(", ")}`);
  }
  if (t.vehikelTyp !== undefined && t.vehikelTyp !== null && !VEHIKEL_TYPEN.has(t.vehikelTyp)) {
    fehler.push(`${quelle}: vehikelTyp "${t.vehikelTyp}" kennt die App nicht`);
  }

  imBereich(t, "alphaRate", 0, 0.1, quelle);
  imBereich(t, "betaRate", 0, 0.15, quelle);
  imBereich(t, "gammaAnnualRate", 0, 0.05, quelle);
  imBereich(t, "fundTER", 0, 0.05, quelle);
  imBereich(t, "effectiveCostRIY", 0, 0.1, quelle);
  imBereich(t, "typischeBruttorendite", 0, 0.15, quelle);
  // Rentenfaktor: EUR Monatsrente je 10.000 EUR Kapital
  imBereich(t, "rentenfaktor", 0, 0.01, quelle);
}

// ───── Nie schrumpfen ─────

let vorher = null;
if (existsSync(OUT)) {
  try {
    vorher = JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    warnungen.push("bestehende tariffs.json ist kaputt — Schrumpf-Pruefung uebersprungen");
  }
}
if (vorher) {
  for (const [name, alt, neu] of [
    ["fonds", vorher.fonds?.length ?? 0, fonds.length],
    ["tarife", vorher.tarife?.length ?? 0, tarife.length],
  ]) {
    if (neu < alt) {
      const text = `${name}: ${alt} → ${neu}, das Bundle wuerde schrumpfen`;
      if (FORCE) warnungen.push(`${text} (--force)`);
      else fehler.push(`${text}. Wenn gewollt: npm run build:ios -- --force`);
    }
  }
}

if (fonds.length === 0) fehler.push("keine Fonds gefunden — die App verwirft einen Payload mit leerer Liste");
if (tarife.length === 0) fehler.push("keine Tarife gefunden — die App verwirft einen Payload mit leerer Liste");

// ───── Ausgabe ─────

for (const w of warnungen) console.warn(`  ! ${w}`);

if (fehler.length) {
  console.error(`\n✗ Build abgebrochen — ${fehler.length} Fehler:\n`);
  for (const f of fehler) console.error(`  ✗ ${f}`);
  process.exit(1);
}

const sortierteFonds = [...fonds].sort((a, b) => a.isin.localeCompare(b.isin));
const sortierteTarife = [...tarife].sort(
  (a, b) => a.anbieter.localeCompare(b.anbieter) || a.tarifName.localeCompare(b.tarifName)
);

function ohneZeitstempel(p) {
  return JSON.stringify({ version: p?.version, tarife: p?.tarife, fonds: p?.fonds });
}

const neu = {
  version: SCHEMA_VERSION,
  updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  tarife: sortierteTarife,
  fonds: sortierteFonds,
};

// Zeitstempel nur anfassen, wenn sich inhaltlich etwas geaendert hat —
// sonst erzeugt jeder Lauf einen Diff und der Cache der App laeuft
// grundlos warm.
if (vorher && ohneZeitstempel(vorher) === ohneZeitstempel(neu)) {
  console.log(`✓ Keine inhaltliche Aenderung — tariffs.json bleibt auf ${vorher.updatedAt}`);
  console.log(`  tarife=${sortierteTarife.length} fonds=${sortierteFonds.length}`);
  process.exit(0);
}

writeFileSync(OUT, JSON.stringify(neu, null, 2) + "\n");
console.log(`✓ tariffs.json geschrieben — tarife=${sortierteTarife.length} fonds=${sortierteFonds.length}`);
console.log(`  updatedAt=${neu.updatedAt}`);
if (warnungen.length) console.log(`  ${warnungen.length} Warnung(en) oben beachten`);
