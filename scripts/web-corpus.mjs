#!/usr/bin/env node
// Writes the parsed cards and the corpus version as one JSON file, the form the website reads.
// Usage: node scripts/web-corpus.mjs [--cards <dir>] [--out <file>]
//   --cards  where the card files are (default: cards/ at the repository root, the public samples)
//   --out    the file to write (default: web/src/corpus/corpus.gen.json, the website's bundled fallback)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { corpusVersion, readCardSources } from "./corpus.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const option = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > -1 ? resolve(process.argv[at + 1]) : fallback;
};
const sources = readCardSources(option("--cards", join(root, "cards")));
const out = option("--out", join(root, "web/src/corpus/corpus.gen.json"));
const cards = [...sources.values()].map((text) => parse(text)).filter((card) => card.status !== "retracted");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ version: corpusVersion(sources), cards }));
console.log(`wrote ${cards.length} cards, corpus version ${corpusVersion(sources)}`);
