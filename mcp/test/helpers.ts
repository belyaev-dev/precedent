import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import generated from "../src/generated/corpus.json" with { type: "json" };
import { buildIndex } from "../src/build-index.ts";
import type { Card, CorpusIndex, Tombstone } from "../src/types.ts";

const here = resolve(fileURLToPath(import.meta.url), "..");
export const repoRoot = resolve(here, "../..");

/** The index compiled from the real cards by `npm run build`. */
export const corpus = generated as unknown as CorpusIndex;

export const FIXTURE_VERSION = "fixture00000";

function readCards(dir: string): (Card | Tombstone)[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => parse(readFileSync(join(dir, name), "utf8")) as Card | Tombstone);
}

/**
 * An index over synthetic cards only: the fixtures in test/fixtures/cards plus the two examples in
 * schema/examples. Between them they cover what the real corpus does not yet contain: floors,
 * a withdrawn card, a disputed card, a reversed decision and hostile text.
 */
export function fixtureCards(): (Card | Tombstone)[] {
  return [...readCards(join(here, "fixtures/cards")), ...readCards(join(repoRoot, "schema/examples"))];
}

export function fixtureIndex(): CorpusIndex {
  return buildIndex(fixtureCards(), FIXTURE_VERSION, corpus.vocabulary);
}
