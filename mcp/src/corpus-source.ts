// Where the Worker gets its index. The compiled index is an object in a private R2 bucket, read at run time
// so that a new card needs no deploy. The index bundled at build time is the fallback: it is what unit
// tests and a plain `wrangler dev` (whose local bucket is empty) serve.
import type { Log } from "./tools.ts";
import type { CorpusIndex } from "./types.ts";

/** The object the private repository's CI uploads: exactly what scripts/build-corpus.mjs writes to src/generated/corpus.json. */
export const INDEX_KEY = "index.json";
/** How long an isolate keeps what it has before it asks the bucket again. */
export const RECHECK_MS = 60_000;

/**
 * The part of an R2 object read here. An R2 conditional get that finds the object unchanged returns it
 * without a body, which is why the readers are optional.
 */
export interface CorpusObject {
  etag: string;
  json?(): Promise<unknown>;
  text?(): Promise<string>;
}

/** The part of an R2 bucket binding read here. */
export interface CorpusBucket {
  get(key: string, options?: { onlyIf?: { etagDoesNotMatch?: string } }): Promise<CorpusObject | null>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A cheap check that what was read is an index at all: a truncated or foreign upload must not replace a good one. */
function assertIndex(value: unknown): CorpusIndex {
  const index = isRecord(value) ? value : {};
  const vocabulary = isRecord(index.vocabulary) ? index.vocabulary : {};
  const ok =
    typeof index.version === "string" &&
    [index.cards, index.tombstones, index.postings, index.prefixes, index.facets].every(isRecord) &&
    Array.isArray(index.docs) &&
    [vocabulary.workloads, vocabulary.topics].every((terms) => Array.isArray(terms) && terms.length > 0);
  if (!ok) throw new Error("not a corpus index");
  return value as CorpusIndex;
}

async function read(object: CorpusObject): Promise<unknown> {
  if (object.json) return object.json();
  if (object.text) return JSON.parse(await object.text());
  throw new Error("the object has no body");
}

interface State {
  bucket: CorpusBucket;
  /** The last index read from the bucket, with the etag it had. Kept through failed checks. */
  loaded: { index: CorpusIndex; etag: string } | null;
  checkedAt: number;
  /** The check under way, shared by every request that arrives meanwhile. */
  checking: Promise<CorpusIndex> | null;
}

/**
 * The index to serve. One source lives for the isolate. It never throws: whatever goes wrong with the
 * bucket, the answer is the last good index or, before there is one, the bundled one.
 */
export function corpusSource({ bundled, log, now = () => Date.now() }: { bundled: CorpusIndex; log: Log; now?: () => number }) {
  let state: State | null = null;

  async function check(s: State): Promise<CorpusIndex> {
    try {
      // With an index in hand its etag is sent, so that an unchanged object comes back without its body.
      const object = await s.bucket.get(INDEX_KEY, s.loaded ? { onlyIf: { etagDoesNotMatch: s.loaded.etag } } : undefined);
      if (!object) throw new Error("the object is missing");
      if (s.loaded && object.etag === s.loaded.etag) return s.loaded.index;
      const index = assertIndex(await read(object));
      s.loaded = { index, etag: object.etag };
      return index;
    } catch {
      // A name only, like every other error line this Worker writes. The next check is an interval away, so
      // a bucket that stays broken costs one line a minute, not one per request.
      log({ event: "error", name: "corpus_source" });
      return s.loaded?.index ?? bundled;
    }
  }

  return {
    /** The index as of the last check, checking first if the last one was more than RECHECK_MS ago. */
    current(bucket: CorpusBucket | undefined): Promise<CorpusIndex> {
      // No binding is a plain local run or a test, not a fault.
      if (!bucket) return Promise.resolve(bundled);
      // A different bucket (only tests pass one) starts from nothing.
      if (state?.bucket !== bucket) state = { bucket, loaded: null, checkedAt: -Infinity, checking: null };
      const s = state;
      if (s.checking) return s.checking;
      if (now() - s.checkedAt < RECHECK_MS) return Promise.resolve(s.loaded?.index ?? bundled);
      s.checkedAt = now();
      const checking = check(s).finally(() => void (s.checking = null));
      s.checking = checking;
      return checking;
    },
  };
}
