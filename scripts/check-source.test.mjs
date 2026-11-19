// Runs check-source.mjs against a small card and source, changing one thing at a time.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const dir = mkdtempSync(join(tmpdir(), "check-source-"));
const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} says something plain about the service and then stops. It adds a second sentence so the page reads as prose.`).join("\n\n");
const SOURCE = `## Background

The resolver answers on 1.1.1.1 and 1.0.0.1, and the prefix 1.1.1.0/24 was withdrawn at 21:48. The fleet serves over five million queries per second across twelve clusters, on version 3.6.2 of the store.

## What we changed

We moved the write path behind a queue because the primary could not keep up during the nightly import, and the change took the team about three weeks to finish and roll out everywhere.

${filler}
`;

function run(change) {
  const card = parse(readFileSync(join(root, "schema/examples/acme-2023-orders.yaml"), "utf8"));
  card.components = undefined;
  card.scale.metrics = [];
  card.footprint = null;
  card.architecture = { text: "The resolver answers on 1.1.1.1; the prefix 1.1.1.0/24 was withdrawn at 21:48.", locator: "Section: Background" };
  card.records = [{ ...card.records.find((r) => r.kind === "decision"), rejected: [], forcing_condition: null, rationale: null, worked_before: null, cost_paid: null, outcome: null, applies_from: null, title: "Queue in front of the write path", chosen: { text: "Writes go through a queue.", locator: "Section: What we changed" } }];
  change(card);
  const cardPath = join(dir, "card.yaml");
  const sourcePath = join(dir, "source.txt");
  const source = card.__source ?? SOURCE;
  delete card.__source;
  writeFileSync(cardPath, stringify(card));
  writeFileSync(sourcePath, source);
  const result = spawnSync(process.execPath, [join(root, "scripts/check-source.mjs"), cardPath, sourcePath], { encoding: "utf8" });
  if (process.env.DEBUG_CHECK) console.error(result.stdout + result.stderr);
  return { ok: result.status === 0, output: result.stdout + result.stderr };
}

test("addresses, CIDR ranges and versions are matched whole, not as decimals", () => {
  assert.equal(run(() => {}).ok, true);
  assert.equal(run((c) => (c.architecture.text = "Runs version 3.6.2 on 1.0.0.1.")).ok, true);
  const wrong = run((c) => (c.architecture.text = "The resolver answers on 9.9.9.9."));
  assert.match(wrong.output, /9\.9\.9\.9 not found in source/);
});

test("a number the source writes out in words is found", () => {
  assert.equal(run((c) => (c.scale.metrics = [{ axis: "other", name: "queries", value: 5000000, unit: "per second", locator: "Section: Background" }])).ok, true);
  assert.equal(run((c) => (c.architecture.text = "Serves 5 million queries per second across 12 clusters.")).ok, true);
  assert.match(run((c) => (c.architecture.text = "Serves 77 million queries per second.")).output, /number 77 not found/);
  // 2.2 billion is not exactly representable; "a dozen" is twelve.
  const more = SOURCE.replace("on version 3.6.2", "with over 2.2 billion trips a quarter and a dozen databases, on version 3.6.2");
  assert.equal(run((c) => ((c.__source = more), (c.scale.metrics = [{ axis: "other", name: "trips", value: 2200000000, unit: "per quarter", locator: "Section: Background" }]))).ok, true);
  assert.equal(run((c) => ((c.__source = more), (c.architecture.text = "Runs 12 databases."))).ok, true);
});

test("a locator may name up to three passages, and each must exist", () => {
  assert.equal(run((c) => (c.architecture.locator = "Section: Background | Near: moved the write path behind a queue")).ok, true);
  assert.match(run((c) => (c.architecture.locator = "Section: Background | Near: words that are not there")).output, /locator text not found in source: Near: words that are not there/);
  assert.match(run((c) => (c.architecture.locator = "Section: Background | Section: What we changed | Near: nightly import | Near: three weeks")).output, /at most 3 passages/);
});

test("a run of the source's own words is a copied passage", () => {
  const copied = run((c) => (c.records[0].chosen.text = "They say the primary could not keep up during the nightly import, and the change took the team a while."));
  assert.match(copied.output, /copies the source's wording/);
  assert.equal(run((c) => (c.records[0].chosen.text = "A queue now sits ahead of writes, since the nightly import overloaded the primary.")).ok, true);
});

test("a saved page with no article in it is rejected", () => {
  const shell = run((c) => (c.__source = Array.from({ length: 500 }, (_, i) => `Menu item ${i}`).join("\n")));
  assert.match(shell.output, /page shell or a sign-in wall/);
});

test("a locator matches through quotation marks, code ticks and punctuation in the source", () => {
  const source = SOURCE.replace("We moved the write path", "We ran the “validation” version on `m3-ultramem-128`: 128 vCPUs. We moved the write path");
  const fine = run((c) => {
    c.__source = source;
    c.records[0].chosen.locator = "Near: validation version on m3-ultramem-128: 128 vCPUs | Section: What we changed";
  });
  assert.equal(fine.ok, true, fine.output);
});
