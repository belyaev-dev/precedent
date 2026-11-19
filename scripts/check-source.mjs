#!/usr/bin/env node
// Checks a card against the plain text of its source: every number, address and locator must appear there,
// and no run of the source's own words may be carried into the card.
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
// An address, a time or a decimal is one word, so 1.1.1.0/24 at 21:48 does not count as seven.
const words = (s) => normalise(s).match(/[a-z0-9]+(?:[.:\/,'][a-z0-9]+)*/g) ?? [];
const sourceWords = ` ${words(source).join(" ")} `;
// A saved page this short is navigation or a sign-in wall, not an article.
const MIN_SOURCE_WORDS = 300;
// The rule is "no quotation beyond a few words". This is the backstop, set where a match is certainly a lifted passage and not a shared technical phrase.
const COPIED_RUN = 12;
// IP addresses, CIDR ranges and version numbers are names, not quantities: 1.1.1.1 is not the number 1.1 twice.
const DOTTED = /\d+(?:\.\d+){2,}(?:\/\d+)?/g;

// The ways a source might write a value: 4000, 4,000, 4k, 4 thousand, 2.5 million, 2.5m, 3bn.
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
function numberForms(value) {
  const forms = [String(value)];
  for (const [divisor, suffixes] of [[1e3, ["k", " thousand"]], [1e6, ["m", " million", "mm"]], [1e9, ["b", "bn", " billion"]], [1e12, ["t", " trillion"]]]) {
    // 2200000000 / 1e9 is 2.2000000000000002 in floating point; round to the two decimals a source would print.
    const scaled = Math.round((value / divisor) * 100) / 100;
    if (scaled >= 1 && Math.abs(scaled * divisor - value) < 1e-6 * value) for (const s of suffixes) forms.push(`${scaled}${s}`);
    // "five million", "twelve thousand"
    if (WORDS[scaled]) forms.push(...suffixes.filter((s) => s.startsWith(" ")).map((s) => `${WORDS[scaled]}${s}`));
  }
  return forms;
}
const hasNumber = (value, written = String(value)) =>
  (WORDS[value] && new RegExp(`\\b${WORDS[value]}\\b`).test(source)) ||
  (value === 12 && /\ba dozen\b/.test(source)) ||
  [written, ...numberForms(value)].some((form) => new RegExp(`(^|[^\\d.])${form.replace(/[.]/g, "\\.")}(?!\\d|\\.\\d)`).test(sourceDigits));

const problems = [];
// A fact drawn from several passages names each one, joined by " | ".
const MAX_LOCATOR_PARTS = 3;
function checkLocator(locator, where) {
  const parts = locator.split(" | ");
  if (parts.length > MAX_LOCATOR_PARTS) problems.push(`${where}: a locator may name at most ${MAX_LOCATOR_PARTS} passages`);
  for (const part of parts) {
    const match = /^(Section|Near):\s*(.+)$/.exec(part.trim());
    if (!match) {
      // Page numbers and timestamps cannot be checked against text; anything else is a typo.
      if (parts.length > 1 && !/^(Page|At) /.test(part.trim())) problems.push(`${where}: locator part is not Section:, Near:, Page or At: ${part.trim()}`);
      continue;
    }
    // Matched word by word, so quotation marks, code ticks and punctuation in the source do not get in the way.
    const needle = words(match[2]);
    if (!needle.length || !sourceWords.includes(` ${needle.join(" ")} `)) problems.push(`${where}: locator text not found in source: ${part.trim()}`);
    if (match[1] === "Near" && match[2].trim().split(/\s+/).length > 8) problems.push(`${where}: a Near locator may quote at most eight words`);
  }
}
function checkText(text, where) {
  for (const dotted of text.match(DOTTED) ?? []) {
    if (!source.includes(dotted)) problems.push(`${where}: ${dotted} not found in source`);
  }
  for (const token of text.replace(DOTTED, " ").replace(/(\d),(?=\d{3})/g, "$1").match(/\d+(\.\d+)?/g) ?? []) {
    if (!hasNumber(Number(token), token)) problems.push(`${where}: number ${token} not found in source`);
  }
  const list = words(text);
  for (let i = 0; i + COPIED_RUN <= list.length; i += 1) {
    const run = list.slice(i, i + COPIED_RUN).join(" ");
    if (sourceWords.includes(` ${run} `)) {
      problems.push(`${where}: copies the source's wording ("${run} ..."); restate it in our own words`);
      break;
    }
  }
}
function checkFact(fact, where) {
  if (!fact) return;
  checkText(fact.text, where);
  checkLocator(fact.locator, where);
}

const rawSource = readFileSync(sourcePath, "utf8");
const sourceSentences = (rawSource.match(/[a-z,;)]{2}[.!?]\s/g) ?? []).length;
if (words(source).length < MIN_SOURCE_WORDS || sourceSentences * 150 < words(source).length) {
  problems.push(`the saved source holds ${words(source).length} words in ${sourceSentences} sentences; that is a page shell or a sign-in wall, not the article. Fetch it again.`);
}
checkFact(card.architecture, "architecture");
checkFact(card.later_update, "later_update");
if (card.footprint) checkLocator(card.footprint.locator, "footprint");
for (const component of card.components ?? []) {
  checkText(component.role, `component "${component.name}"`);
  checkLocator(component.locator, `component "${component.name}"`);
}
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
