#!/usr/bin/env node
// Compiles cards/*.yaml into the one file the server reads: the index, written to src/generated/corpus.json.
// That file is the bundled index (what unit tests and a plain `wrangler dev` serve) and is also exactly
// what the private repository's CI uploads to the corpus bucket as index.json. It is build output: never
// edited by hand, never committed.
// The cards are first run through the repository's validator, and the build stops if any card fails:
// an index must not be built from cards that did not validate.
// Usage: node scripts/build-corpus.mjs [--cards <dir>] [--out <dir>]
//   --cards  where the card files are (default: cards/ at the repository root)
//   --out    write src/generated/corpus.json under this directory instead of mcp/ (tests and the corpus
//            compiler use it)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { corpusVersion, readCardSources } from "../../scripts/corpus.mjs";
import { buildIndex } from "../src/build-index.ts";

const here = resolve(fileURLToPath(import.meta.url), "..");
const root = resolve(here, "../..");
const option = (name) => {
  const at = process.argv.indexOf(name);
  return at > -1 ? resolve(process.argv[at + 1]) : null;
};
const cardsDir = option("--cards") ?? join(root, "cards");
const outDir = option("--out") ?? resolve(here, "..");

// The validator is the one the card tooling uses, run as it stands. It needs the root package installed.
const validation = spawnSync(process.execPath, [join(root, "scripts/validate.mjs"), cardsDir], { encoding: "utf8" });
if (validation.status !== 0) {
  const missing = /Cannot find (package|module)/.test(validation.stderr ?? "");
  console.error(`${validation.stdout ?? ""}${validation.stderr ?? ""}`.trim());
  console.error(missing ? "\nThe card validator could not start. Run `npm ci` at the repository root, then build again." : "\nCards failed validation, so nothing was built.");
  process.exit(1);
}

/** The value and meaning columns of one table in schema/vocabulary.md. */
function vocabularyTable(markdown, heading) {
  const section = markdown.split(/^## /m).find((part) => part.startsWith(`${heading}\n`));
  if (!section) throw new Error(`schema/vocabulary.md has no "${heading}" section`);
  const terms = [...section.matchAll(/^\| `([a-z0-9-]+)` \| (.+?) \|$/gm)].map(([, value, meaning]) => ({ value, meaning }));
  if (!terms.length) throw new Error(`schema/vocabulary.md: no rows under "${heading}"`);
  return terms;
}

const schema = JSON.parse(readFileSync(join(root, "schema/card.schema.json"), "utf8"));
const markdown = readFileSync(join(root, "schema/vocabulary.md"), "utf8");
const vocabulary = { workloads: vocabularyTable(markdown, "Workloads"), topics: vocabularyTable(markdown, "Topics") };
// The tool schema offers these values as its enums, so they must be exactly the ones cards may use.
for (const [name, key] of [["workloads", "workload"], ["topics", "topic"]]) {
  const documented = vocabulary[name].map((t) => t.value).sort().join(",");
  if (documented !== [...schema.$defs[key].enum].sort().join(",")) throw new Error(`schema/vocabulary.md and card.schema.json disagree on ${name}`);
}

const sources = readCardSources(cardsDir);
const version = corpusVersion(sources);
const cards = [...sources].map(([file, text]) => {
  const card = parse(text);
  if (card?.schema !== 1 || card.id !== basename(file, ".yaml")) throw new Error(`${file}: not a schema 1 card whose id equals its file name`);
  return card;
});

const index = buildIndex(cards, version, vocabulary);

// The file is rewritten only when its content changes, so that wrangler dev (which reruns this script
// when a watched file changes) settles instead of looping.
const path = join(outDir, "src/generated/corpus.json");
const text = JSON.stringify(index);
if (!existsSync(path) || readFileSync(path, "utf8") !== text) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

const { facets } = index;
console.log(`corpus ${version}: ${facets.systems} systems, ${facets.decisions + facets.failures} records, ${facets.withdrawn.length} withdrawn, ${Object.keys(index.postings).length} terms`);
