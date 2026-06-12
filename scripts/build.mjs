#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const DIST = join(ROOT, "dist");
mkdirSync(DIST, { recursive: true });

function walk(dir) {
  if (!existsSync(dir)) return [];
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
    .map((f) => JSON.parse(readFileSync(f, "utf8")));
}

function indexBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) m.set(keyFn(x), x);
  return m;
}

function mergeOverride(base, override) {
  if (!override) return base;
  const { isin, id, tags, ...rest } = override;
  const mergedTags = [...new Set([...(base.tags ?? []), ...(tags ?? [])])];
  return {
    ...base,
    ...rest,
    ...(mergedTags.length ? { tags: mergedTags } : {}),
  };
}

const funds = loadAll("funds").sort((a, b) => a.isin.localeCompare(b.isin));
const insurance = loadAll("insurance").sort((a, b) => a.id.localeCompare(b.id));
const credit = loadAll("credit").sort((a, b) => a.id.localeCompare(b.id));
const ratings = loadAll("ratings").sort((a, b) => a.id.localeCompare(b.id));

const fundOverrides = indexBy(loadAll("overrides/funds"), (o) => o.isin);
const insuranceOverrides = indexBy(loadAll("overrides/insurance"), (o) => o.id);
const creditOverrides = indexBy(loadAll("overrides/credit"), (o) => o.id);

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

const fundsOut = funds
  .map((f) => mergeOverride(f, fundOverrides.get(f.isin)))
  .map((f) => attachRatings(f, "fund"));
const insuranceOut = insurance
  .map((i) => mergeOverride(i, insuranceOverrides.get(i.id)))
  .map((i) => attachRatings(i, "insurance"));
const creditOut = credit
  .map((c) => mergeOverride(c, creditOverrides.get(c.id)))
  .map((c) => attachRatings(c, "credit"));

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
    overrides: {
      funds: fundOverrides.size,
      insurance: insuranceOverrides.size,
      credit: creditOverrides.size,
    },
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

console.log(
  `✓ Build OK — funds=${fundsOut.length} insurance=${insuranceOut.length} credit=${creditOut.length} ratings=${ratings.length}`
);
console.log(
  `  overrides applied: funds=${fundOverrides.size} insurance=${insuranceOverrides.size} credit=${creditOverrides.size}`
);
console.log(`  → dist/{tariffs,funds,insurance,credit,ratings,index}.json`);
console.log(`  → web/src/data/tariffs.json`);
