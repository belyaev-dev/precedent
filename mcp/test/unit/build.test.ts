import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { buildIndex, publishable } from "../../src/build-index.ts";
import type { Card, Tombstone } from "../../src/types.ts";
import { corpus, repoRoot } from "../helpers.ts";

const fixtures = join(repoRoot, "mcp/test/fixtures/cards");
const TOMBSTONE_KEYS = ["id", "retracted_at", "schema", "status", "status_note", "withdrawn_records"];
const scratch = mkdtempSync(join(tmpdir(), "precedent-build-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Runs the real build script on a directory of cards, writing under a scratch directory instead of mcp/. */
function build(cardsDir: string, name: string) {
  const out = join(scratch, name);
  const run = spawnSync(process.execPath, [join(repoRoot, "mcp/scripts/build-corpus.mjs"), "--cards", cardsDir, "--out", out], { encoding: "utf8" });
  return { out, status: run.status, log: `${run.stdout}${run.stderr}` };
}

/** A card file marked retracted with the tombstone's fields added, but with all of its content left in place. */
function retractedWithContent(): Record<string, unknown> {
  const card = parse(readFileSync(join(fixtures, "tiny-2024-notes.yaml"), "utf8")) as Record<string, unknown>;
  return { ...card, status: "retracted", status_note: "Withdrawn at the publisher's request.", retracted_at: "2026-11-01", withdrawn_records: ["d1", "f1"] };
}

function cardsDirWith(name: string, files: Record<string, unknown>): string {
  const dir = join(scratch, `${name}-cards`);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(fixtures, "murky-2022-queue.yaml"), join(dir, "murky-2022-queue.yaml"));
  for (const [file, card] of Object.entries(files)) writeFileSync(join(dir, file), stringify(card));
  return dir;
}

describe("the corpus build", () => {
  it("publishes a withdrawn card as its tombstone only, in the per-card file and in the whole corpus", () => {
    const { out, status, log } = build(fixtures, "ok");
    expect(status, log).toBe(0);

    const one = JSON.parse(readFileSync(join(out, "public/corpus/cards/gone-2021-cache.json"), "utf8"));
    expect(Object.keys(one.card).sort()).toEqual(TOMBSTONE_KEYS);
    const whole = JSON.parse(readFileSync(join(out, "public/corpus/corpus.json"), "utf8"));
    const inWhole = whole.cards.find((card: { id: string }) => card.id === "gone-2021-cache");
    expect(Object.keys(inWhole).sort()).toEqual(TOMBSTONE_KEYS);
    expect(whole.cards.map((card: { id: string }) => card.id).sort()).toEqual(readdirSync(fixtures).map((name) => name.replace(".yaml", "")).sort());

    const index = JSON.parse(readFileSync(join(out, "src/generated/corpus.json"), "utf8"));
    expect(Object.keys(index.cards)).not.toContain("gone-2021-cache");
    expect(Object.keys(index.tombstones)).toEqual(["gone-2021-cache"]);
  });

  it("stops, and writes nothing, when a retracted card still carries its content", () => {
    const { out, status, log } = build(cardsDirWith("leftover", { "tiny-2024-notes.yaml": retractedWithContent() }), "leftover");
    expect(status).toBe(1);
    expect(log).toContain("FAIL");
    expect(log).toContain("tiny-2024-notes.yaml");
    expect(log).toContain("Cards failed validation, so nothing was built.");
    expect(existsSync(out)).toBe(false);
  });

  it("stops, and writes nothing, when any card fails the repository's validator", () => {
    const card = parse(readFileSync(join(fixtures, "tiny-2024-notes.yaml"), "utf8")) as Record<string, unknown>;
    delete card.org;
    const missingField = build(cardsDirWith("invalid", { "tiny-2024-notes.yaml": card }), "invalid");
    expect(missingField.status).toBe(1);
    expect(missingField.log).toContain("must have required property 'org'");
    expect(existsSync(missingField.out)).toBe(false);

    // A rule only the validator's cross-checks know: an incident card needs a failure record.
    const incident = parse(readFileSync(join(fixtures, "murky-2022-queue.yaml"), "utf8")) as Record<string, unknown>;
    const crossCheck = build(cardsDirWith("cross", { "murky-2022-queue.yaml": { ...incident, evidence: "incident" } }), "cross");
    expect(crossCheck.status).toBe(1);
    expect(crossCheck.log).toContain("an incident card needs at least one failure record");
    expect(existsSync(crossCheck.out)).toBe(false);
  });

  it("would still publish only the tombstone if a retracted card with content got past validation", () => {
    const leftover = retractedWithContent() as unknown as Tombstone;
    const [published] = publishable([leftover]);
    expect(Object.keys(published!).sort()).toEqual(TOMBSTONE_KEYS);
    expect(JSON.stringify(published)).not.toMatch(/SQLite|Tiny \(fictional\)|example\.com|architecture|"records"/);

    const index = buildIndex([leftover as unknown as Card], "fixture00002", corpus.vocabulary);
    expect(index.docs).toEqual([]);
    expect(index.cards).toEqual({});
    expect(Object.keys(index.tombstones["tiny-2024-notes"]!).sort()).toEqual(TOMBSTONE_KEYS);
    expect(JSON.stringify(index)).not.toMatch(/SQLite|sqlite|Tiny \(fictional\)|example\.com/);
  });
});
