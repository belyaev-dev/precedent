#!/usr/bin/env node
// Builds the copy of the corpus that ships inside the skill: the card files plus a one-line-per-record index.
// Usage: node scripts/bundle.mjs [--check]   (--check fails if the committed bundle is out of date)
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { corpusVersion, readCardSources } from "./corpus.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cardsDir = join(root, "cards");
const outDir = join(root, "skills/precedent/corpus");

const sources = readCardSources(cardsDir);
const version = corpusVersion(sources);

const LETTER = { traffic: "T", data: "D", team: "O" };
// A literal pipe would split the table row.
const cell = (text) => text.replaceAll("|", "\\|");
const tier = (axis) => (axis ? String(axis.tier) : "?");
const rows = [];
const systems = [];
const withdrawn = [];
for (const [name, text] of sources) {
  const card = parse(text);
  if (card.status === "retracted") {
    withdrawn.push(`- \`${card.id}\` (${card.withdrawn_records.join(", ")}): ${card.status_note}`);
    continue;
  }
  const scale = `T${tier(card.scale.traffic)} D${tier(card.scale.data)} O${tier(card.scale.team)}`;
  const shape = card.footprint?.shape ?? "-";
  systems.push(`| \`${card.id}\` | ${cell(card.org)}: ${cell(card.system)} | ${card.as_of ?? "undated"} | ${scale} | ${shape} | ${card.workloads.join(", ")} | ${cell(card.architecture.text)} |`);
  for (const record of card.records) {
    const floor = Object.entries(LETTER)
      .filter(([axis]) => record.applies_from?.[`${axis}_tier`] !== undefined)
      .map(([axis, letter]) => `${letter}${record.applies_from[`${axis}_tier`]}`)
      .join(" ");
    const flags = [card.status === "disputed" ? "DISPUTED" : "", record.reversed_by ? `reversed by ${record.reversed_by}` : ""].filter(Boolean).join("; ");
    rows.push({
      workload: card.workloads[0],
      line: `| \`${card.id}#${record.id}\` | ${record.kind} | ${scale} | ${shape} | ${floor || "-"} | ${record.topics.join(", ")} | ${cell(`${card.org}, ${card.as_of ?? "undated"}: ${record.title}`)}${flags ? ` (${flags})` : ""} |`,
    });
  }
}

const byWorkload = new Map();
for (const row of rows) byWorkload.set(row.workload, [...(byWorkload.get(row.workload) ?? []), row.line]);
const sections = [...byWorkload.keys()].sort().map((w) => `## ${w}\n\n| Record | Kind | Scale | Shape | Floor | Topics | What it is |\n|---|---|---|---|---|---|---|\n${byWorkload.get(w).join("\n")}`);

const index = `# Precedent corpus index

Corpus version: \`${version}\` (${rows.length} records from ${sources.size - withdrawn.length} cards)

Scale is the system's tier on three axes: T traffic, D data, O team (operators). \`?\` means the source gives no usable figure; such records have unknown scale and never count as a match for your tier. Shape is the deployed footprint the source states (single-node, single-database, single-site, partitioned, multi-region), which is often the only size signal a small system gives. Floor is the advisory minimum tier for copying a decision, where one exists. Tier definitions are in SKILL.md.

The first table lists the systems, one per card: use it to find examples of how a kind of system is built and to pick a baseline. The tables after it list the decision and failure records, grouped by the card's first workload. Open \`cards/<card id>.yaml\` for the full card before citing anything from it.

## Systems

| Card | System | As of | Scale | Shape | Workloads | Architecture |
|---|---|---|---|---|---|---|
${systems.join("\n") || "_No cards yet._"}

${sections.join("\n\n")}
${withdrawn.length ? `\n## Withdrawn\n\nThese ids no longer carry evidence. Do not cite them.\n\n${withdrawn.join("\n")}\n` : ""}`;

const expected = new Map([["INDEX.md", index], ...[...sources].map(([n, t]) => [`cards/${n}`, t])]);

if (process.argv.includes("--check")) {
  const actual = existsSync(join(outDir, "cards")) ? readdirSync(join(outDir, "cards")).map((f) => `cards/${f}`) : [];
  const stale = [...expected].filter(([p, t]) => !existsSync(join(outDir, p)) || readFileSync(join(outDir, p), "utf8") !== t).map(([p]) => p);
  const extra = actual.filter((p) => !expected.has(p));
  if (stale.length || extra.length) {
    console.error(`skill bundle is out of date (${[...stale, ...extra].join(", ")}). Run: npm run bundle`);
    process.exit(1);
  }
  console.log(`skill bundle is current (${version})`);
} else {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "cards"), { recursive: true });
  for (const [path, text] of expected) writeFileSync(join(outDir, path), text);
  console.log(`bundled ${rows.length} records, corpus version ${version}`);
}
