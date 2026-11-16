#!/usr/bin/env node
// Checks a card against the plain text of its source: every number and every locator must appear there.
// Usage: node scripts/check-source.mjs <card.yaml> <source.txt>
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const [cardPath, sourcePath] = process.argv.slice(2);
if (!cardPath || !sourcePath) {
  console.error("usage: node scripts/check-source.mjs <card.yaml> <source.txt>");
  process.exit(2);
}
const card = parse(readFileSync(cardPath, "utf8"));
const normalise = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ");
const source = normalise(readFileSync(sourcePath, "utf8"));
const sourceDigits = source.replace(/(\d),(?=\d{3})/g, "$1");

// The ways a source might write a value: 4000, 4,000, 4k, 4 thousand, 2.5 million, 2.5m, 3bn.
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
function numberForms(value) {
  const forms = [String(value)];
  for (const [divisor, suffixes] of [[1e3, ["k", " thousand"]], [1e6, ["m", " million", "mm"]], [1e9, ["b", "bn", " billion"]], [1e12, ["t", " trillion"]]]) {
    const scaled = value / divisor;
    if (scaled >= 1 && Number.isInteger(scaled * 100)) for (const s of suffixes) forms.push(`${scaled}${s}`);
  }
  return forms;
}
const hasNumber = (value, written = String(value)) =>
  (WORDS[value] && new RegExp(`\\b${WORDS[value]}\\b`).test(source)) ||
  [written, ...numberForms(value)].some((form) => new RegExp(`(^|[^\\d.])${form.replace(/[.]/g, "\\.")}(?!\\d|\\.\\d)`).test(sourceDigits));

const problems = [];
function checkLocator(locator, where) {
  const match = /^(Section|Near):\s*(.+)$/.exec(locator);
  if (!match) return; // page numbers and timestamps cannot be checked against text
  const needle = normalise(match[2]).replace(/^"|"$/g, "");
  if (!source.includes(needle)) problems.push(`${where}: locator text not found in source: ${locator}`);
  if (match[1] === "Near" && needle.split(" ").length > 8) problems.push(`${where}: a Near locator may quote at most eight words`);
}
function checkText(text, where) {
  for (const token of text.replace(/(\d),(?=\d{3})/g, "$1").match(/\d+(\.\d+)?/g) ?? []) {
    if (!hasNumber(Number(token), token)) problems.push(`${where}: number ${token} not found in source`);
  }
}
function checkFact(fact, where) {
  if (!fact) return;
  checkText(fact.text, where);
  checkLocator(fact.locator, where);
}

checkFact(card.architecture, "architecture");
if (card.footprint) checkLocator(card.footprint.locator, "footprint");
for (const metric of card.scale?.metrics ?? []) {
  if (!hasNumber(metric.value)) problems.push(`metric "${metric.name}": value ${metric.value} not found in source`);
  checkLocator(metric.locator, `metric "${metric.name}"`);
}
for (const record of card.records ?? []) {
  const at = (field) => `${record.id}.${field}`;
  checkText(record.title, at("title"));
  for (const field of ["chosen", "forcing_condition", "rationale", "worked_before", "cost_paid", "outcome", "trigger", "mechanism", "why_defences_failed", "impact", "fix"]) {
    checkFact(record[field], at(field));
  }
  for (const [i, rejected] of (record.rejected ?? []).entries()) {
    checkText(rejected.option, at(`rejected[${i}]`));
    if (rejected.reason) checkText(rejected.reason, at(`rejected[${i}]`));
    checkLocator(rejected.locator, at(`rejected[${i}]`));
  }
  if (record.applies_from?.basis === "source_stated") {
    checkText(record.applies_from.threshold, at("applies_from.threshold"));
    checkLocator(record.applies_from.locator, at("applies_from"));
  }
}

if (problems.length) {
  console.error(`FAIL ${cardPath}\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`ok ${cardPath}: every number and locator found in source`);
