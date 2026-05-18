#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const DIST = join(ROOT, "dist");
mkdirSync(DIST, { recursive: true });

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

function loadAll(subdir) {
  return walk(join(ROOT, "data", subdir))
    .map((f) => JSON.parse(readFileSync(f, "utf8")))
    .sort((a, b) => (a.isin ?? a.id).localeCompare(b.isin ?? b.id));
}

const funds = loadAll("funds");
const insurance = loadAll("insurance");
const credit = loadAll("credit");
const ratings = loadAll("ratings");

const ratingsByTarget = new Map();
for (const r of ratings) {
  const key = `${r.targetType}:${r.targetId}`;
  if (!ratingsByTarget.has(key)) ratingsByTarget.set(key, []);
  ratingsByTarget.get(key).push(r);
}

function attachRatings(item, type) {
  const key = `${type}:${type === "fund" ? item.isin : item.id}`;
  const r = ratingsByTarget.get(key);
  return r ? { ...item, _ratings: r } : item;
}

const fundsOut = funds.map((f) => attachRatings(f, "fund"));
const insuranceOut = insurance.map((i) => attachRatings(i, "insurance"));
const creditOut = credit.map((c) => attachRatings(c, "credit"));

const updatedAt = new Date().toISOString();

function hash(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

const bundles = {
  "funds.json": { updatedAt, count: fundsOut.length, items: fundsOut },
  "insurance.json": { updatedAt, count: insuranceOut.length, items: insuranceOut },
  "credit.json": { updatedAt, count: creditOut.length, items: creditOut },
  "ratings.json": { updatedAt, count: ratings.length, items: ratings },
};

for (const [name, payload] of Object.entries(bundles)) {
  writeFileSync(join(DIST, name), JSON.stringify(payload, null, 2));
}

const all = {
  version: 1,
  updatedAt,
  counts: {
    funds: fundsOut.length,
    insurance: insuranceOut.length,
    credit: creditOut.length,
    ratings: ratings.length,
  },
  funds: fundsOut,
  insurance: insuranceOut,
  credit: creditOut,
  ratings,
};
writeFileSync(join(DIST, "tariffs.json"), JSON.stringify(all, null, 2));

const index = {
  version: 1,
  updatedAt,
  bundles: Object.fromEntries(
    Object.entries(bundles).map(([name, payload]) => [
      name,
      { count: payload.count, hash: hash(payload) },
    ])
  ),
};
writeFileSync(join(DIST, "index.json"), JSON.stringify(index, null, 2));

const webData = join(ROOT, "web/src/data");
mkdirSync(webData, { recursive: true });
writeFileSync(join(webData, "tariffs.json"), JSON.stringify(all));

console.log(`✓ Build OK — funds=${fundsOut.length} insurance=${insuranceOut.length} credit=${creditOut.length} ratings=${ratings.length}`);
console.log(`  → dist/{tariffs,funds,insurance,credit,ratings,index}.json`);
console.log(`  → web/src/data/tariffs.json`);
