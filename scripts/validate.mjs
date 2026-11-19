#!/usr/bin/env node
// Validates card files against schema/card.schema.json plus the rules JSON Schema cannot express.
// Usage: node scripts/validate.mjs [dir ...]   (defaults to cards/ and schema/examples/)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const schema = JSON.parse(readFileSync(join(root, "schema/card.schema.json"), "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

const AXES = ["traffic", "data", "team"];
// A card is a pointer to its source, not a substitute for it.
const MAX_RECORD_CHARS = 3200;
const MAX_CARD_CHARS = 14000;
const MAX_LOCATOR_PARTS = 3;

// Every locator in a card, wherever it sits.
function locators(value, found = []) {
  if (Array.isArray(value)) for (const v of value) locators(v, found);
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key === "locator" && typeof v === "string") found.push(v);
      else locators(v, found);
    }
  }
  return found;
}

function textLength(value) {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((n, v) => n + textLength(v), 0);
  if (value && typeof value === "object") return textLength(Object.values(value));
  return 0;
}

function crossChecks(card) {
  const problems = [];
  const { scale, source, review, records } = card;

  for (const locator of locators(card)) {
    const parts = locator.split(" | ");
    if (parts.length > MAX_LOCATOR_PARTS) problems.push(`locator names ${parts.length} passages, limit ${MAX_LOCATOR_PARTS}: ${locator}`);
    if (new Set(parts).size < parts.length) problems.push(`locator repeats a passage: ${locator}`);
  }

  const ids = records.map((r) => r.id);
  for (const id of new Set(ids)) {
    if (ids.filter((x) => x === id).length > 1) problems.push(`record id ${id} is used more than once`);
  }

  for (const axis of AXES) {
    const entry = scale[axis];
    if (!entry) continue;
    if (entry.basis === "stated" && !scale.metrics.some((m) => m.axis === axis)) {
      problems.push(`scale.${axis} is stated, so scale.metrics needs a number tagged axis: ${axis}`);
    }
    if (entry.basis === "estimated" && !entry.note) {
      problems.push(`scale.${axis} is estimated, so it needs a note saying how`);
    }
  }
  for (const metric of scale.metrics) {
    if (metric.axis !== "other" && !scale[metric.axis]) {
      problems.push(`metric "${metric.name}" is tagged ${metric.axis}, but scale.${metric.axis} is null`);
    }
  }

  // Dates may differ in precision ("2023" against "2023-05"); compare only what both state.
  const shared = Math.min(card.as_of?.length ?? 0, source.published.length);
  if (card.as_of && card.as_of.slice(0, shared) > source.published.slice(0, shared)) {
    problems.push("as_of is later than the source's publication date");
  }
  if (source.published > source.retrieved_at) problems.push("source.published is later than retrieved_at");
  if (review.reviewed_at < source.retrieved_at) problems.push("review.reviewed_at is earlier than source.retrieved_at");

  const failures = records.filter((r) => r.kind === "failure");
  if (card.evidence === "incident" && failures.length === 0) {
    problems.push("an incident card needs at least one failure record");
  }
  if (source.party !== "first" && card.evidence !== "experiment") {
    problems.push(`${card.evidence} cards need the operator's own account (source.party: first); only experiments may be third-party`);
  }

  for (const record of records) {
    const floor = record.applies_from;
    if (floor) {
      if (floor.basis === "curator_judgment" && !record.forcing_condition) {
        problems.push(`${record.id}: a curator_judgment floor needs a reported forcing_condition to rest on`);
      }
      // A source may say it acted too early and name a higher threshold; a reviewer may not.
      for (const axis of floor.basis === "curator_judgment" ? AXES : []) {
        const floorTier = floor[`${axis}_tier`];
        const observed = scale[axis]?.tier;
        if (floorTier === undefined) continue;
        if (observed === undefined) {
          problems.push(`${record.id}: a curator_judgment floor on ${axis} needs scale.${axis} to be known`);
        } else if (floorTier > observed) {
          problems.push(`${record.id}: curator_judgment floor ${axis}_tier ${floorTier} is above the tier the system ran at (${observed})`);
        }
      }
    }
    if (record.reversed_by?.startsWith(`${card.id}#`)) {
      problems.push(`${record.id}: reversed_by must point at a later card, not this one`);
    }
    if (textLength(record) > MAX_RECORD_CHARS) {
      problems.push(`${record.id}: ${textLength(record)} characters of text, limit ${MAX_RECORD_CHARS}`);
    }
  }
  if (textLength(card) > MAX_CARD_CHARS) {
    problems.push(`card holds ${textLength(card)} characters of text, limit ${MAX_CARD_CHARS}`);
  }
  return problems;
}

let failed = 0;
function fail(where, problems) {
  failed += 1;
  console.error(`FAIL ${where}\n${problems.map((p) => `  - ${p}`).join("\n")}`);
}

const dirs = (process.argv.length > 2 ? process.argv.slice(2) : ["cards", "schema/examples"]).map((d) => resolve(root, d));
const files = [];
for (const dir of dirs) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    fail(dir, ["not a readable directory"]);
    continue;
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (name.startsWith(".")) continue;
    if (name.endsWith(".yaml") && statSync(path).isFile()) files.push(path);
    else fail(path, ["card directories may hold only <card id>.yaml files, with no subdirectories"]);
  }
}

// Decision records a reversed_by may point at, keyed by directory so a real card cannot
// resolve against a synthetic example. Withdrawn ones still resolve, so that honouring
// a removal never forces deleting a true historical link from another card.
const reversalTargets = new Set();
const cards = [];
for (const file of files) {
  const dir = dirname(file);
  let problems;
  try {
    const card = parse(readFileSync(file, "utf8"));
    if (!validate(card)) {
      problems = validate.errors.map((e) => `${e.instancePath || "/"} ${e.message}`);
    } else if (card.id !== basename(file, ".yaml")) {
      problems = [`id "${card.id}" must equal the file name`];
    } else if (card.status === "retracted") {
      problems = [];
      for (const id of card.withdrawn_records) reversalTargets.add(`${dir}:${card.id}#${id}`);
    } else {
      problems = crossChecks(card);
      cards.push({ dir, card });
      for (const record of card.records) reversalTargets.add(`${dir}:${card.id}#${record.id}`);
    }
  } catch (err) {
    problems = [`cannot parse: ${err.message}`];
  }
  if (problems.length) fail(file, problems);
}

for (const { dir, card } of cards) {
  for (const record of card.records) {
    if (record.reversed_by && !reversalTargets.has(`${dir}:${record.reversed_by}`)) {
      fail(card.id, [`${record.id}: reversed_by "${record.reversed_by}" is not a known record`]);
    }
  }
}

console.log(`${files.length} file(s) checked, ${failed} failed`);
process.exit(failed ? 1 : 0);
