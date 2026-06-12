#!/usr/bin/env node
/**
 * Sync-Skript für Fonds-/ETF-Stammdaten.
 *
 * Liest aus scripts/sources/etf-master.json und schreibt eine JSON-Datei
 * pro ETF nach data/funds/<ISIN>.json.
 *
 * Krypto-ETPs/-ETNs werden explizit ausgefiltert (Provider- und Name-Blocklist).
 *
 * Manuelle Anreicherung (Tags, Notes, tecisFlags) gehört NICHT hierher,
 * sondern in data/overrides/funds/<ISIN>.json — diese werden vom Build
 * über die Sync-Daten gemerged.
 *
 * v1: statische Master-Liste. v2 wird zusätzliche Adapter für
 * Anbieter-APIs (iShares, Vanguard, Xtrackers, Amundi) ergänzen.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const FUNDS_DIR = join(ROOT, "data/funds");
const MASTER = join(ROOT, "scripts/sources/etf-master.json");

const CRYPTO_PROVIDER_PATTERNS = [
  /21shares/i,
  /coinshares/i,
  /etc[\s-]?group/i,
  /vaneck.*(crypto|bitcoin|ether)/i,
  /wisdomtree.*(crypto|bitcoin|ether)/i,
  /global\s?x.*(crypto|bitcoin|ether)/i,
  /hashdex/i,
  /valkyrie/i,
];
const CRYPTO_NAME_PATTERNS = [
  /bitcoin/i,
  /\bethereum\b|\bether\b/i,
  /solana/i,
  /polkadot/i,
  /cardano/i,
  /\bcrypto\b/i,
  /\bblockchain\b/i,
  /\bweb3\b/i,
];

function isCryptoEtp(item) {
  if (CRYPTO_PROVIDER_PATTERNS.some((rx) => rx.test(item.provider ?? ""))) return true;
  if (CRYPTO_NAME_PATTERNS.some((rx) => rx.test(item.name ?? ""))) return true;
  return false;
}

const SCHEMA_FIELDS = new Set([
  "isin",
  "wkn",
  "name",
  "provider",
  "fundType",
  "assetClass",
  "region",
  "index",
  "ter",
  "replicationMethod",
  "distribution",
  "domicile",
  "currency",
  "fundSize",
  "inception",
  "sfdr",
  "documents",
  "tags",
]);

function pickSchemaFields(item) {
  const out = {};
  for (const k of Object.keys(item)) {
    if (SCHEMA_FIELDS.has(k)) out[k] = item[k];
  }
  return out;
}

function loadExistingByIsin() {
  if (!existsSync(FUNDS_DIR)) return new Map();
  const m = new Map();
  for (const entry of readdirSync(FUNDS_DIR)) {
    if (!entry.endsWith(".json")) continue;
    const isin = entry.replace(/\.json$/, "");
    try {
      m.set(isin, JSON.parse(readFileSync(join(FUNDS_DIR, entry), "utf8")));
    } catch {
      // skip
    }
  }
  return m;
}

function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort(), 2) + "\n";
}

function main() {
  const master = JSON.parse(readFileSync(MASTER, "utf8"));
  const existing = loadExistingByIsin();
  mkdirSync(FUNDS_DIR, { recursive: true });

  const stats = { total: 0, created: 0, updated: 0, unchanged: 0, skippedCrypto: 0, kept: 0 };
  const seenIsins = new Set();

  for (const raw of master.items) {
    if (isCryptoEtp(raw)) {
      stats.skippedCrypto++;
      console.warn(`  skip crypto: ${raw.isin} ${raw.name}`);
      continue;
    }
    const next = pickSchemaFields(raw);
    if (!next.isin) {
      console.error(`✗ master entry without ISIN: ${JSON.stringify(raw).slice(0, 120)}`);
      process.exitCode = 1;
      continue;
    }
    seenIsins.add(next.isin);
    stats.total++;

    const filePath = join(FUNDS_DIR, `${next.isin}.json`);
    const prev = existing.get(next.isin);
    const nextStr = JSON.stringify(next, Object.keys(next).sort());
    const prevStr = prev ? JSON.stringify(prev, Object.keys(prev).sort()) : null;

    if (prev && prevStr === nextStr) {
      stats.unchanged++;
      continue;
    }
    writeFileSync(filePath, stableStringify(next));
    if (prev) stats.updated++;
    else stats.created++;
  }

  for (const isin of existing.keys()) {
    if (!seenIsins.has(isin)) stats.kept++;
  }

  console.log(
    `✓ Sync OK — ${stats.created} created, ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats.skippedCrypto} crypto-skipped, ${stats.kept} kept (not in master)`
  );
}

main();
