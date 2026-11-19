import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import generated from "../src/generated/corpus.json" with { type: "json" };
import { buildIndex } from "../src/build-index.ts";
import { INDEX_KEY, type CorpusBucket } from "../src/corpus-source.ts";
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

/** What a read of the fake bucket was asked, and whether the object came back with its body. */
export interface Read {
  key: string;
  etagDoesNotMatch: string | undefined;
  downloaded: boolean;
}

export interface FakeBucket extends CorpusBucket {
  /** Every read so far, in order. */
  reads: Read[];
  /** While true, every read fails, as when R2 is unavailable. */
  failing: boolean;
  /** Replaces what is stored under index.json: an index, raw text (for an upload that is not one), or null for no object. A new etag unless one is given. */
  put(content: CorpusIndex | string | null, etag?: string): void;
}

/** An in-memory stand-in for the R2 binding that holds index.json. A conditional read of an unchanged object returns its metadata without a body, as R2 does. */
export function fakeBucket(content: CorpusIndex | string | null = null): FakeBucket {
  let stored = { content, etag: "etag-1" };
  let puts = 1;
  const bucket: FakeBucket = {
    reads: [],
    failing: false,
    put(next, etag = `etag-${++puts}`) {
      stored = { content: next, etag };
    },
    async get(key, options) {
      const read: Read = { key, etagDoesNotMatch: options?.onlyIf?.etagDoesNotMatch, downloaded: false };
      bucket.reads.push(read);
      if (bucket.failing) throw new Error("R2 is unavailable");
      if (key !== INDEX_KEY || stored.content === null) return null;
      if (read.etagDoesNotMatch === stored.etag) return { etag: stored.etag };
      read.downloaded = true;
      const text = typeof stored.content === "string" ? stored.content : JSON.stringify(stored.content);
      return { etag: stored.etag, json: async () => JSON.parse(text), text: async () => text };
    },
  };
  return bucket;
}
