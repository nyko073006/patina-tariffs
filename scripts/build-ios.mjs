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
 * bewusst getrennt unter `data/app/`, damit der Fonds-Sync sie nicht
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
// Herkunft der Rendite. Ein unbekannter Wert darf nicht durchrutschen:
// die App wuerde ihn auf "Schätzwert" zurueckfallen lassen, und eine
// belegte Zahl saehe dann ungesichert aus (oder umgekehrt, je nach
// Tippfehler).
const RENDITE_QUELLEN = new Set([
  "Factsheet", "Marktdaten", "Schätzwert", "Manuell",
]);
const VEHIKEL_TYPEN = new Set([
  "Schicht 1 — Rürup", "Schicht 2 — Riester",
  "Schicht 3 — Privatrente", "Altersvorsorge-Depot (ab 2027)",
]);

const BELEG_ARTEN = new Set(["bib-laufend", "bib-einmal", "muster-pib", "fondsuebersicht"]);
const BELEGBARE_FELDER = new Set([
  "alphaRate", "zillmerdauerMonate", "betaRate", "betaEinmalRate", "gammaAnnualRate",
  "gammaBeitragsfrei", "gammaRentenphase", "kappaMonthly", "restbeitragRate", "fundTER",
  "effectiveCostRIY", "rentenfaktor", "betaStaffel",
]);
// Kuerzel, unter denen die App die Herkunft eines belegten Werts kennt
// (`belegteFelder` in der Ausgabe). Muss zu BELEG_ARTEN passen: eine Art
// ohne Kuerzel wuerde sonst still aus der Ausgabe fallen.
const BELEG_KUERZEL = {
  "bib-laufend": "bib", "bib-einmal": "bib",
  "muster-pib": "muster-pib", "fondsuebersicht": "fondsuebersicht",
};
// Kompatibilitaetswaechter: Schluessel, die ein Tarif in `data/app/tarife/`
// tragen darf. Alles andere ist ein Tippfehler oder ein Feld, das die App
// nicht kennt — beides soll auffallen, bevor es im Bundle landet.
const TARIF_SCHLUESSEL = new Set([
  "id", "anbieter", "tarifName", "jahrgang", "kategorie", "vehikelTyp", "quelle", "beleg",
  "alphaRate", "betaRate", "gammaAnnualRate", "kappaMonthly", "fundTER", "rentenfaktor",
  "effectiveCostRIY", "typischeBruttorendite", "gammaBeitragsfrei", "gammaRentenphase",
  "betaEinmalRate", "restbeitragRate", "zillmerdauerMonate", "betaStaffel",
]);
// Schluessel, die der Build selbst ergaenzt (nie in den Quelldateien).
const AUSGABE_SCHLUESSEL = new Set(["belegteFelder", "belegStand"]);
const UUID_RE =/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
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

  if (f.renditeQuelle !== undefined && !RENDITE_QUELLEN.has(f.renditeQuelle)) {
    fehler.push(`${quelle}: renditeQuelle "${f.renditeQuelle}" kennt die App nicht — erlaubt: ${[...RENDITE_QUELLEN].join(", ")}`);
  }
  if (f.renditeQuelle === undefined) {
    warnungen.push(`${quelle}: keine renditeQuelle — gilt in der App als Schätzwert`);
  }

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

  for (const schluessel of Object.keys(t)) {
    if (AUSGABE_SCHLUESSEL.has(schluessel)) {
      fehler.push(`${quelle}: "${schluessel}" setzt der Build selbst, nicht in data/app/ eintragen`);
    } else if (!TARIF_SCHLUESSEL.has(schluessel)) {
      fehler.push(`${quelle}: unbekannter Schluessel "${schluessel}" — Tippfehler oder Feld, das die App nicht kennt (erlaubt: ${[...TARIF_SCHLUESSEL].join(", ")})`);
    }
  }

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

  // Optionale Felder (Oktober 2026): fehlen sie, gilt in der App das alte
  // Verhalten. Sind sie da, muessen sie dem App-Typ entsprechen.
  for (const feld of ["gammaBeitragsfrei", "gammaRentenphase"]) {
    if (t[feld] === undefined) continue;
    if (typeof t[feld] !== "number") fehler.push(`${quelle}: "${feld}" muss number sein`);
    else imBereich(t, feld, 0, 0.05, quelle);
  }
  // Beitragskosten nach Art (Oktober 2026): Einmalbeitrag/Zuzahlung und Anteil p. a.
  // auf die noch ausstehende Beitragssumme.
  for (const [feld, max] of [["betaEinmalRate", 0.15], ["restbeitragRate", 0.02]]) {
    if (t[feld] === undefined) continue;
    if (typeof t[feld] !== "number") fehler.push(`${quelle}: "${feld}" muss number sein`);
    else imBereich(t, feld, 0, max, quelle);
  }
  if (t.zillmerdauerMonate !== undefined) {
    if (!Number.isInteger(t.zillmerdauerMonate)) fehler.push(`${quelle}: "zillmerdauerMonate" muss ganze Zahl (Monate) sein`);
    else imBereich(t, "zillmerdauerMonate", 1, 120, quelle);
  }
  if (t.betaStaffel !== undefined) pruefeBetaStaffel(t, quelle);
  if (t.quelle !== undefined && (typeof t.quelle !== "string" || t.quelle.trim() === "")) {
    fehler.push(`${quelle}: "quelle" muss nicht-leerer String sein`);
  }
  if (t.beleg !== undefined) pruefeBeleg(t, quelle);
}

// Gestaffelte laufende Beitragskosten (Build 33): `betaRate` bleibt als
// Mittelwert-Fallback fuer aeltere App-Staende, die Staffel gilt je
// Vertragsjahr. Liegt `betaRate` ausserhalb der Stufensaetze, wurde der
// Fallback vergessen oder aus einer anderen Quelle uebernommen.
function pruefeBetaStaffel(t, quelle) {
  const s = t.betaStaffel;
  if (!Array.isArray(s) || s.length === 0) {
    fehler.push(`${quelle}: "betaStaffel" muss eine nicht leere Liste von {abJahr, rate} sein`);
    return;
  }
  let ok = true;
  let letztesJahr = 0;
  s.forEach((stufe, i) => {
    const wo = `${quelle}: betaStaffel[${i}]`;
    if (!Number.isInteger(stufe?.abJahr)) {
      fehler.push(`${wo}.abJahr muss eine ganze Zahl sein`);
      ok = false;
    } else {
      if (i === 0 && stufe.abJahr !== 1) {
        fehler.push(`${wo}.abJahr: die erste Stufe muss bei Jahr 1 beginnen, ist ${stufe.abJahr}`);
        ok = false;
      }
      if (stufe.abJahr <= letztesJahr) {
        fehler.push(`${wo}.abJahr = ${stufe.abJahr} steigt nicht streng (vorher ${letztesJahr})`);
        ok = false;
      }
      letztesJahr = stufe.abJahr;
    }
    if (typeof stufe?.rate !== "number" || Number.isNaN(stufe.rate) || stufe.rate < 0 || stufe.rate > 0.25) {
      fehler.push(`${wo}.rate muss eine Zahl in [0, 0.25] sein (Anteil, nicht Prozent), ist ${stufe?.rate}`);
      ok = false;
    }
  });
  if (!ok || typeof t.betaRate !== "number") return;
  const saetze = s.map((x) => x.rate);
  const [min, max] = [Math.min(...saetze), Math.max(...saetze)];
  if (t.betaRate < min || t.betaRate > max) {
    fehler.push(`${quelle}: betaRate = ${t.betaRate} liegt ausserhalb der betaStaffel-Saetze [${min}, ${max}] — Fallback vergessen?`);
  }
}

// Beleg (Oktober 2026, Plan Blatt-Auslese Etappe B): Fundstelle je Wert im
// Basisinformationsblatt bzw. Muster-PIB und der Musterfall, mit dem
// `scripts/blatt/nachrechnung.py` die Werte gegen das Blatt prueft. Der Beleg
// selbst bleibt aus tariffs.json heraus; die App erhaelt nur `belegteFelder`
// und `belegStand` (siehe `belegAusgabe`).
function pruefeBeleg(t, quelle) {
  const b = t.beleg;
  if (typeof b !== "object" || b === null || Array.isArray(b)) {
    fehler.push(`${quelle}: "beleg" muss ein Objekt sein`);
    return;
  }
  const docs = Array.isArray(b.dokumente) ? b.dokumente : [];
  if (docs.length === 0) fehler.push(`${quelle}: beleg.dokumente fehlt oder ist leer`);
  docs.forEach((d, i) => {
    const wo = `${quelle}: beleg.dokumente[${i}]`;
    if (!BELEG_ARTEN.has(d?.art)) fehler.push(`${wo}.art "${d?.art}" unbekannt — erlaubt: ${[...BELEG_ARTEN].join(", ")}`);
    if (typeof d?.url !== "string" || !d.url.startsWith("https://")) fehler.push(`${wo}.url muss mit https:// beginnen`);
    if (typeof d?.stand !== "string" || d.stand.trim() === "") fehler.push(`${wo}.stand fehlt`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.abrufdatum ?? "")) fehler.push(`${wo}.abrufdatum muss JJJJ-MM-TT sein`);
    if (!/^[0-9a-f]{64}$/.test(d?.sha256 ?? "")) fehler.push(`${wo}.sha256 muss 64 Hex-Zeichen haben`);
  });
  if (docs.length > 0 && !juengstesStand(docs)) {
    warnungen.push(`${quelle}: kein Datum TT.MM.JJJJ in beleg.dokumente[].stand — belegStand entfaellt`);
  }
  const dokIndex = (wert, wo) => {
    if (!Number.isInteger(wert) || wert < 0 || wert >= docs.length) {
      fehler.push(`${wo}.dokument = ${wert} verweist auf kein Dokument (0 bis ${docs.length - 1})`);
    }
  };

  const felder = b.felder;
  if (typeof felder !== "object" || felder === null || Object.keys(felder).length === 0) {
    fehler.push(`${quelle}: beleg.felder fehlt oder ist leer`);
  } else {
    for (const [feld, f] of Object.entries(felder)) {
      const wo = `${quelle}: beleg.felder.${feld}`;
      if (!BELEGBARE_FELDER.has(feld)) fehler.push(`${wo}: Feld ist nicht belegbar — erlaubt: ${[...BELEGBARE_FELDER].join(", ")}`);
      else if (feld === "betaStaffel" ? !Array.isArray(t[feld]) : typeof t[feld] !== "number") {
        fehler.push(`${wo}: belegt, aber im Tarif nicht gesetzt`);
      }
      dokIndex(f?.dokument, wo);
      if (!Number.isInteger(f?.seite) || f.seite < 1) fehler.push(`${wo}.seite muss eine Seitenzahl sein`);
      if (typeof f?.wortlaut !== "string" || f.wortlaut.trim() === "") fehler.push(`${wo}.wortlaut fehlt`);
    }
  }

  // Bewusste Vereinfachungen (z. B. Spanne statt Einzelwert, Mittelwert statt
  // Staffel): Klartext fuer Pruefer, nicht fuer die App.
  if (b.vereinfachungen !== undefined) {
    const v = b.vereinfachungen;
    if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string" || x.trim() === "")) {
      fehler.push(`${quelle}: beleg.vereinfachungen muss eine nicht leere Liste nicht leerer Texte sein`);
    }
  }

  const pruefung = Array.isArray(b.pruefung) ? b.pruefung : [];
  if (pruefung.length === 0) fehler.push(`${quelle}: beleg.pruefung fehlt — ohne Musterfall keine Selbstpruefung`);
  pruefung.forEach((p, i) => {
    const wo = `${quelle}: beleg.pruefung[${i}]`;
    dokIndex(p?.dokument, wo);
    if (!(p?.beitrag > 0)) fehler.push(`${wo}.beitrag muss > 0 sein`);
    if (!Number.isInteger(p?.jahre) || p.jahre < 1) fehler.push(`${wo}.jahre muss ganze Zahl >= 1 sein`);
    if (typeof p?.einmal !== "boolean") fehler.push(`${wo}.einmal muss true/false sein`);
    if (typeof p?.rendite !== "number") fehler.push(`${wo}.rendite fehlt`);
    if (typeof p?.blatt?.kostenEuro !== "number" && typeof p?.blatt?.riy !== "number") {
      fehler.push(`${wo}.blatt braucht kostenEuro oder riy zum Vergleich`);
    }
  });
}

// Ausgabe des Belegs fuer die App: Feld → Herkunft (`bib` | `muster-pib` |
// `fondsuebersicht`, aus `art` des Dokuments) und Stand des juengsten
// Dokuments (TT.MM.JJJJ). Laeuft erst nach erfolgreicher Validierung, die
// Dokument-Verweise und Arten sichert.
function belegAusgabe(t) {
  const docs = t.beleg.dokumente;
  const belegteFelder = Object.fromEntries(
    Object.entries(t.beleg.felder).map(([feld, f]) => [feld, BELEG_KUERZEL[docs[f.dokument].art]]),
  );
  const juengstes = juengstesStand(docs);
  return juengstes ? { belegteFelder, belegStand: juengstes } : { belegteFelder };
}

// `stand` ist Freitext ("Stand: 16.02.2026", "... (BIB_FV25...)"); gezaehlt
// werden die Datumsangaben TT.MM.JJJJ darin. Liefert das juengste oder null.
function juengstesStand(docs) {
  const daten = docs.flatMap((d) => [...String(d?.stand ?? "").matchAll(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g)])
    .map(([text, tag, monat, jahr]) => ({ text, schluessel: `${jahr}${monat}${tag}` }))
    .sort((a, b) => b.schluessel.localeCompare(a.schluessel));
  return daten.length ? daten[0].text : null;
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
const sortierteTarife = tarife
  .map((t) => {
    const { beleg, ...tarif } = t;
    return beleg ? { ...tarif, ...belegAusgabe(t) } : tarif;
  })
  .sort((a, b) => a.anbieter.localeCompare(b.anbieter) || a.tarifName.localeCompare(b.tarifName));

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
