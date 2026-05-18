#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats.default(ajv);

const schemas = {
  fund: JSON.parse(readFileSync(join(ROOT, "schemas/fund.schema.json"), "utf8")),
  insurance: JSON.parse(readFileSync(join(ROOT, "schemas/insurance.schema.json"), "utf8")),
  credit: JSON.parse(readFileSync(join(ROOT, "schemas/credit.schema.json"), "utf8")),
  rating: JSON.parse(readFileSync(join(ROOT, "schemas/rating.schema.json"), "utf8")),
};

const validators = Object.fromEntries(
  Object.entries(schemas).map(([k, s]) => [k, ajv.compile(s)])
);

const DATA_TYPE_BY_DIR = {
  funds: "fund",
  insurance: "insurance",
  credit: "credit",
  ratings: "rating",
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

let errors = 0;
const entitiesById = { fund: new Map(), insurance: new Map(), credit: new Map(), rating: new Map() };

for (const [dir, type] of Object.entries(DATA_TYPE_BY_DIR)) {
  const path = join(ROOT, "data", dir);
  for (const file of walk(path)) {
    const rel = relative(ROOT, file);
    let doc;
    try {
      doc = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`✗ ${rel}: invalid JSON — ${e.message}`);
      errors++;
      continue;
    }
    const validate = validators[type];
    if (!validate(doc)) {
      console.error(`✗ ${rel}:`);
      for (const err of validate.errors ?? []) {
        console.error(`    ${err.instancePath || "/"} ${err.message}`);
      }
      errors++;
      continue;
    }
    const key = type === "fund" ? doc.isin : doc.id;
    const expectedName = `${key}.json`;
    if (!file.endsWith(expectedName)) {
      console.error(`✗ ${rel}: Dateiname sollte ${expectedName} sein (Primärschlüssel = Dateiname)`);
      errors++;
    }
    if (entitiesById[type].has(key)) {
      console.error(`✗ ${rel}: doppelter Schlüssel ${key} (auch in ${entitiesById[type].get(key)})`);
      errors++;
    }
    entitiesById[type].set(key, rel);
  }
}

for (const [, rel] of entitiesById.rating) {
  const doc = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
  const targetMap = entitiesById[doc.targetType];
  if (targetMap && !targetMap.has(doc.targetId)) {
    console.error(`✗ ${rel}: Rating verweist auf unbekannte ${doc.targetType}-ID "${doc.targetId}"`);
    errors++;
  }
}

const totals = Object.fromEntries(
  Object.entries(entitiesById).map(([k, v]) => [k, v.size])
);

if (errors > 0) {
  console.error(`\nValidation fehlgeschlagen: ${errors} Fehler.`);
  process.exit(1);
}
console.log(`✓ Validation OK —`, totals);
