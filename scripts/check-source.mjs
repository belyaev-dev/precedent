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
// Thousands grouped by a comma or, as Swiss writers do, an apostrophe: 11,000 and 11'000 are both 11000.
const sourceDigits = source.replace(/(\d)[,'](?=\d{3})/g, "$1");
// An address, a time or a decimal is one word, so 1.1.1.0/24 at 21:48 does not count as seven.
// A possessive is two words, so a locator may stop at "Discord" where the source has "Discord's".
const words = (s) => normalise(s).match(/[a-z0-9]+(?:[.:\/,][a-z0-9]+)*/g) ?? [];
const sourceWords = ` ${words(source).join(" ")} `;
// A saved page this short is navigation or a sign-in wall, not an article.
const MIN_SOURCE_WORDS = 150; // one incident's section of a monthly report can be this short
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
    // "¼ million", "a quarter of a million", "half a billion"
    for (const [part, spellings] of [[0.25, ["¼", "a quarter", "quarter of a", "a quarter of a"]], [0.5, ["½", "half a", "half"]], [0.75, ["¾", "three quarters of a"]]])
      if (value === part * divisor) forms.push(...suffixes.filter((x) => x.startsWith(" ")).flatMap((x) => spellings.map((w) => `${w}${x}`)));
    if (scaled < 1 || Math.round(scaled * divisor) !== value) continue; // only a value the short form states exactly
    for (const s of suffixes) forms.push(`${scaled}${s}`);
    // "five million", "twelve thousand", "two hundred billion"
    const spelled = WORDS[scaled] ?? (scaled % 100 === 0 && WORDS[scaled / 100] ? `${WORDS[scaled / 100]} hundred` : null);
    // "a billion events"
    if (scaled === 1) forms.push(...suffixes.filter((x) => x.startsWith(" ")).map((x) => `a${x}`));
    if (spelled) forms.push(...suffixes.filter((s) => s.startsWith(" ")).map((s) => `${spelled}${s}`));
  }
  // "two hundred"
  if (value % 100 === 0 && WORDS[value / 100]) forms.push(`${WORDS[value / 100]} hundred`);
  return forms;
}
// A number word is not a match inside a larger one: "five" in "twenty-five", "a dozen" in "half a dozen".
const NOT_AFTER_TENS = "(?<!(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -])(?<![a-z-])";
const hasNumber = (value, written = String(value)) =>
  (WORDS[value] && new RegExp(`${NOT_AFTER_TENS}${WORDS[value]}\\b`).test(source)) ||
  (value === 12 && /(?<!half )\ba dozen\b/.test(source)) ||
  // A card's "1 billion" for the source's "a billion".
  (value === 1 && /(?<!half |of )\ba (?:thousand|million|billion|trillion)\b/.test(source)) ||
  [written, ...numberForms(value)].some((form) =>
    /^[a-z¼½¾]/.test(form)
      ? new RegExp(`${/^[a-z]/.test(form) ? NOT_AFTER_TENS : "(?<!\\d)"}${/^a /.test(form) ? "(?<!half |of )" : ""}${form}\\b`).test(source)
      : // A plain number may carry a unit ("80ms", "4.2GB"); a short form may not run on ("5m" is not in "5ms").
        // A dot after a letter is part of a name (H.264), not a decimal point.
        new RegExp(`(^|[^\\d.]|(?<!\\d)\\.)${form.replace(/[.]/g, "\\.")}(?!\\d|\\.\\d${/[a-z]$/.test(form) ? "|[a-z]" : ""})`).test(sourceDigits),
  );

const headings = readFileSync(sourcePath, "utf8").split("\n").filter((line) => line.startsWith("#")).map((line) => words(line).join(" "));
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
      if (!/^(Page|At) /.test(part.trim())) problems.push(`${where}: locator part is not Section:, Near:, Page or At: ${part.trim()}`);
      continue;
    }
    // Matched word by word, so quotation marks, code ticks and punctuation in the source do not get in the way.
    const needle = words(match[2]);
    if (!needle.length || !sourceWords.includes(` ${needle.join(" ")} `)) problems.push(`${where}: locator text not found in source: ${part.trim()}`);
    // A heading the page uses twice does not say which passage is meant.
    if (match[1] === "Section" && headings.filter((h) => h === needle.join(" ")).length > 1) problems.push(`${where}: the heading "${match[2]}" appears more than once in the source; use Near: with words from the passage`);
    if (match[1] === "Near" && match[2].trim().split(/\s+/).length > 8) problems.push(`${where}: a Near locator may quote at most eight words`);
  }
}
function checkText(text, where) {
  for (const dotted of text.match(DOTTED) ?? []) {
    // Whole, not as part of a longer one: 10.0.0.1 is not in 10.0.0.10, nor 1.1.1.0/2 in 1.1.1.0/24.
    const whole = new RegExp(`(?<![\\d.])${dotted.replace(/[.\/]/g, "\\$&")}(?!\\d|\\.\\d)`);
    if (!whole.test(source)) problems.push(`${where}: ${dotted} not found in source`);
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
