import { beforeEach, describe, expect, it } from "vitest";
import { buildIndex } from "../../src/build-index.ts";
import { corpusSource, INDEX_KEY, RECHECK_MS, type CorpusBucket } from "../../src/corpus-source.ts";
import type { CorpusIndex } from "../../src/types.ts";
import { corpus, fakeBucket, fixtureCards, fixtureIndex, type FakeBucket } from "../helpers.ts";

// The real binding must fit the part of it that is read. Checked by the compiler, not at run time.
export const realBinding: CorpusBucket = null as unknown as R2Bucket;

const FIRST = fixtureIndex();
/** A second, different index: fewer cards, another version. */
const SECOND: CorpusIndex = buildIndex(fixtureCards().filter((card) => card.id !== "tiny-2024-notes"), "fixture00002", corpus.vocabulary);
const ERROR = { event: "error", name: "corpus_source" };

let now: number;
let logged: Record<string, string | number>[];
const source = () => corpusSource({ bundled: corpus, log: (entry) => logged.push(entry), now: () => now });
beforeEach(() => {
  now = 1_000_000;
  logged = [];
});

describe("the corpus source", () => {
  it("serves the bundled index when there is no binding, and logs nothing: that is a plain local run, not a fault", async () => {
    const corpora = source();
    expect(await corpora.current(undefined)).toBe(corpus);
    now += 10 * RECHECK_MS;
    expect(await corpora.current(undefined)).toBe(corpus);
    expect(logged).toEqual([]);
  });

  it("serves the bucket's index, not the bundled one, and reads the index.json object", async () => {
    const bucket = fakeBucket(FIRST);
    const served = await source().current(bucket);
    expect(served.version).toBe(FIRST.version);
    expect(served.version).not.toBe(corpus.version);
    expect(served).toEqual(FIRST);
    // The first read has no etag to send: there is nothing yet to compare with.
    expect(bucket.reads).toEqual([{ key: INDEX_KEY, etagDoesNotMatch: undefined, downloaded: true }]);
    expect(logged).toEqual([]);
  });

  it("reads an object that offers only text() as well as one that offers json()", async () => {
    const text = JSON.stringify(FIRST);
    const textOnly: CorpusBucket = { get: async () => ({ etag: "t", text: async () => text }) };
    expect((await source().current(textOnly)).version).toBe(FIRST.version);
  });

  const failures: [string, (bucket: FakeBucket) => void][] = [
    ["the object is missing", (bucket) => bucket.put(null)],
    ["the read fails", (bucket) => void (bucket.failing = true)],
    ["the object is not JSON", (bucket) => bucket.put("{not json")],
    ["the object is JSON but not an index", (bucket) => bucket.put(JSON.stringify({ version: "x", cards: {} }))],
    ["the object is JSON null", (bucket) => bucket.put("null")],
  ];

  it.each(failures)("falls back to the bundled index and logs one error line when %s", async (_name, break_) => {
    const bucket = fakeBucket(FIRST);
    break_(bucket);
    const corpora = source();
    expect(await corpora.current(bucket)).toBe(corpus);
    expect(logged).toEqual([ERROR]);
    // Within the interval it neither reads again nor logs again.
    expect(await corpora.current(bucket)).toBe(corpus);
    expect(bucket.reads).toHaveLength(1);
    expect(logged).toHaveLength(1);
  });

  it.each(failures)("keeps serving the last good index when a refresh fails because %s", async (_name, break_) => {
    const bucket = fakeBucket(FIRST);
    const corpora = source();
    const good = await corpora.current(bucket);
    expect(good.version).toBe(FIRST.version);

    break_(bucket);
    now += RECHECK_MS;
    expect(await corpora.current(bucket)).toBe(good);
    expect(logged).toEqual([ERROR]);
    expect(bucket.reads).toHaveLength(2);

    // Once the bucket is well again, the next check picks up what it holds.
    bucket.failing = false;
    bucket.put(SECOND);
    now += RECHECK_MS;
    expect((await corpora.current(bucket)).version).toBe(SECOND.version);
    expect(logged).toEqual([ERROR]);
  });

  it("recovers from a bucket that had no index when one appears", async () => {
    const bucket = fakeBucket(null);
    const corpora = source();
    expect(await corpora.current(bucket)).toBe(corpus);
    bucket.put(FIRST);
    now += RECHECK_MS - 1;
    expect(await corpora.current(bucket)).toBe(corpus);
    now += 1;
    expect((await corpora.current(bucket)).version).toBe(FIRST.version);
  });

  it("does not read the bucket again within 60 seconds, however many calls arrive", async () => {
    expect(RECHECK_MS).toBe(60_000);
    const bucket = fakeBucket(FIRST);
    const corpora = source();
    const first = await corpora.current(bucket);
    bucket.put(SECOND);
    const start = now;
    for (const wait of [1, 1000, 30_000, 28_998]) {
      now += wait;
      expect(await corpora.current(bucket)).toBe(first);
    }
    expect(now - start).toBe(RECHECK_MS - 1);
    expect(bucket.reads).toHaveLength(1);
  });

  it("asks again after the interval with the etag it holds, and does not download an object that has not changed", async () => {
    const bucket = fakeBucket(FIRST);
    const corpora = source();
    const first = await corpora.current(bucket);

    now += RECHECK_MS;
    expect(await corpora.current(bucket)).toBe(first);
    expect(bucket.reads).toHaveLength(2);
    expect(bucket.reads[1]).toEqual({ key: INDEX_KEY, etagDoesNotMatch: "etag-1", downloaded: false });

    // The wait counts from that check, so the third is a minute after the second.
    now += RECHECK_MS - 1;
    expect(await corpora.current(bucket)).toBe(first);
    expect(bucket.reads).toHaveLength(2);
    now += 1;
    expect(await corpora.current(bucket)).toBe(first);
    expect(bucket.reads).toHaveLength(3);
    expect(bucket.reads.map((read) => read.downloaded)).toEqual([true, false, false]);
    expect(logged).toEqual([]);
  });

  it("does not parse again when a bucket ignores the condition and returns the same etag with its body", async () => {
    const text = JSON.stringify(FIRST);
    let parsed = 0;
    const bucket: CorpusBucket = { get: async () => ({ etag: "same", json: async () => (parsed++, JSON.parse(text)) }) };
    const corpora = source();
    const first = await corpora.current(bucket);
    now += RECHECK_MS;
    expect(await corpora.current(bucket)).toBe(first);
    expect(parsed).toBe(1);
  });

  it("swaps in the new index when the etag has changed after the interval", async () => {
    const bucket = fakeBucket(FIRST);
    const corpora = source();
    const first = await corpora.current(bucket);
    expect(Object.keys(first.cards)).toContain("tiny-2024-notes");

    bucket.put(SECOND, "etag-new");
    now += RECHECK_MS;
    const second = await corpora.current(bucket);
    expect(second.version).toBe(SECOND.version);
    expect(Object.keys(second.cards)).not.toContain("tiny-2024-notes");
    expect(bucket.reads[1]).toEqual({ key: INDEX_KEY, etagDoesNotMatch: "etag-1", downloaded: true });

    // And the new etag is what it compares with next.
    now += RECHECK_MS;
    expect(await corpora.current(bucket)).toBe(second);
    expect(bucket.reads[2]).toEqual({ key: INDEX_KEY, etagDoesNotMatch: "etag-new", downloaded: false });
  });

  it("shares one read between requests that arrive while it is under way", async () => {
    const bucket = fakeBucket(FIRST);
    const corpora = source();
    const served = await Promise.all([corpora.current(bucket), corpora.current(bucket), corpora.current(bucket)]);
    expect(bucket.reads).toHaveLength(1);
    expect(new Set(served).size).toBe(1);
    expect(served[0]!.version).toBe(FIRST.version);
  });

  it("starts from nothing when given a different bucket", async () => {
    const corpora = source();
    expect((await corpora.current(fakeBucket(FIRST))).version).toBe(FIRST.version);
    expect((await corpora.current(fakeBucket(SECOND))).version).toBe(SECOND.version);
  });
});
