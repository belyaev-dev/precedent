#!/usr/bin/env node
// Compiles a directory of cards into the two files the Workers read from the precedent-corpus R2 bucket:
//   index.json  the search index the MCP engine serves from
//   cards.json  the parsed cards the website serves from
// The cards are validated first and nothing is written if one fails. Uploading is a separate step (see README).
// Usage: node scripts/compile-corpus.mjs --cards <dir> --out <dir>
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const option = (name) => {
  const at = process.argv.indexOf(name);
  if (at === -1 || !process.argv[at + 1]) {
    console.error("Usage: node scripts/compile-corpus.mjs --cards <dir> --out <dir>");
    process.exit(2);
  }
  return resolve(process.argv[at + 1]);
};
const cardsDir = option("--cards");
const outDir = option("--out");

const run = (script, args) => {
  const result = spawnSync(process.execPath, [join(root, script), ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// The index builder validates the cards itself and writes under <dir>/src/generated.
const scratch = mkdtempSync(join(tmpdir(), "precedent-corpus-"));
run("mcp/scripts/build-corpus.mjs", ["--cards", cardsDir, "--out", scratch]);
mkdirSync(outDir, { recursive: true });
copyFileSync(join(scratch, "src/generated/corpus.json"), join(outDir, "index.json"));
rmSync(scratch, { recursive: true });
run("scripts/web-corpus.mjs", ["--cards", cardsDir, "--out", join(outDir, "cards.json")]);
