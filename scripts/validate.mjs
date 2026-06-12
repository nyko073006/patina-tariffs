#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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
  "fund-override": JSON.parse(readFileSync(join(ROOT, "schemas/fund-override.schema.json"), "utf8")),
  "insurance-override": JSON.parse(readFileSync(join(ROOT, "schemas/insurance-override.schema.json"), "utf8")),
  "credit-override": JSON.parse(readFileSync(join(ROOT, "schemas/credit-override.schema.json"), "utf8")),
};

const validators = Object.fromEntries(
  Object.entries(schemas).map(([k, s]) => [k, ajv.compile(s)])
);

const BASE_DIRS = {
  funds: "fund",
  insurance: "insurance",
  credit: "credit",
  ratings: "rating",
};

const OVERRIDE_DIRS = {
  "overrides/funds": "fund-override",
  "overrides/insurance": "insurance-override",
  "overrides/credit": "credit-override",
};

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

let errors = 0;
const entitiesById = {
  fund: new Map(),
  insurance: new Map(),
  credit: new Map(),
  rating: new Map(),
  "fund-override": new Map(),
  "insurance-override": new Map(),
  "credit-override": new Map(),
};

function keyOf(type, doc) {
  if (type === "fund" || type === "fund-override") return doc.isin;
  return doc.id;
}

function validateDir(dirRel, type) {
  const path = join(ROOT, "data", dirRel);
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
    const key = keyOf(type, doc);
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

for (const [dir, type] of Object.entries(BASE_DIRS)) {
  validateDir(dir, type);
}

for (const [dir, type] of Object.entries(OVERRIDE_DIRS)) {
  validateDir(dir, type);
}

const OVERRIDE_TO_BASE = {
  "fund-override": "fund",
  "insurance-override": "insurance",
  "credit-override": "credit",
};

for (const [overrideType, baseType] of Object.entries(OVERRIDE_TO_BASE)) {
  for (const [key, rel] of entitiesById[overrideType]) {
    if (!entitiesById[baseType].has(key)) {
      console.error(`✗ ${rel}: Override verweist auf unbekannte ${baseType}-ID "${key}"`);
      errors++;
    }
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

const totals = {
  fund: entitiesById.fund.size,
  insurance: entitiesById.insurance.size,
  credit: entitiesById.credit.size,
  rating: entitiesById.rating.size,
  overrides: {
    fund: entitiesById["fund-override"].size,
    insurance: entitiesById["insurance-override"].size,
    credit: entitiesById["credit-override"].size,
  },
};

if (errors > 0) {
  console.error(`\nValidation fehlgeschlagen: ${errors} Fehler.`);
  process.exit(1);
}
console.log(`✓ Validation OK —`, totals);
