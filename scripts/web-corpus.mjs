#!/usr/bin/env node
// Writes the parsed cards and the corpus version to web/src/corpus/corpus.gen.json, which the website's server code reads.
// Usage: node scripts/web-corpus.mjs   (run by the web app's dev and build scripts)
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { corpusVersion, readCardSources } from "./corpus.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const sources = readCardSources(join(root, "cards"));
const cards = [...sources.values()].map((text) => parse(text)).filter((card) => card.status !== "retracted");
writeFileSync(join(root, "web/src/corpus/corpus.gen.json"), JSON.stringify({ version: corpusVersion(sources), cards }));
console.log(`wrote ${cards.length} cards, corpus version ${corpusVersion(sources)}`);
