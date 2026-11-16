import { describe, expect, it } from "vitest";
import { isPendingReview, MAX_QUERY_TERMS, nearMiss, queryTerms, stem, tokenize } from "../../src/text.ts";

describe("stem", () => {
  it.each([
    ["queues", "queued", "queuing", "queue"],
    ["caches", "cached", "caching", "cache"],
    ["retries", "retried", "retrying", "retry"],
    ["shards", "sharded", "sharding", "shard"],
    ["batches", "batched", "batching", "batch"],
    ["writes", "writing", "write"],
    ["shedding", "shed"],
    ["running", "runs", "run"],
    ["processes", "processing", "process"],
    ["databases", "database"],
  ])("brings %s and its relatives to one term", (...forms) => {
    expect(new Set(forms.map(stem)).size).toBe(1);
  });

  it("leaves short words, names ending in s, and anything with a digit alone", () => {
    expect(stem("sqs")).toBe("sqs");
    expect(stem("redis")).toBe("redis");
    expect(stem("status")).toBe("status");
    expect(stem("s3")).toBe("s3");
    expect(stem("http2")).toBe("http2");
    expect(stem("string")).toBe("string");
    expect(stem("speed")).toBe("speed");
  });
});

describe("tokenize", () => {
  it("keeps letters and digits only, lower-cased, without stopwords", () => {
    expect(tokenize("The Queue's back-pressure: 429s & S3!")).toEqual(["queu", "back", "pressur", "429s", "s3"]);
  });

  it("folds diacritics instead of splitting on them", () => {
    expect(tokenize("Pēteris café")).toEqual(["peteris", "caf"]);
  });

  it("drops single characters and over-long runs", () => {
    expect(tokenize(`a b ${"x".repeat(41)} ok`)).toEqual(["ok"]);
  });
});

describe("queryTerms", () => {
  it("returns distinct terms with the word as written", () => {
    expect(queryTerms("Queues queued POSTGRES").terms).toEqual([
      { term: "queu", word: "queues" },
      { term: "postgr", word: "postgres" },
    ]);
  });

  it("caps the number of terms and reports how many were dropped", () => {
    const { terms, dropped } = queryTerms(Array.from({ length: 20 }, (_, i) => `word${i}`).join(" "));
    expect(terms).toHaveLength(MAX_QUERY_TERMS);
    expect(dropped).toBe(8);
  });

  it("reads at most 200 characters", () => {
    // 40 six-character words, 7 characters apiece with the space: only the first 28 fit, and 12 are kept.
    const words = Array.from({ length: 40 }, (_, i) => `word${String(i).padStart(2, "0")}`);
    const { terms, dropped } = queryTerms(words.join(" "));
    expect(terms.length + dropped).toBeLessThanOrEqual(29);
    expect(terms.map((t) => t.word)).not.toContain("word39");
    expect(queryTerms(`${" ".repeat(200)}late`).terms).toEqual([]);
  });

  it("keeps words in any script, lower-cased, so that they can be reported as absent", () => {
    expect(queryTerms("Очередь ЗАДАЧ 数据库 ουρά").terms.map((t) => t.word)).toEqual(["очередь", "задач", "数据库", "ουρα"]);
    // Bidirectional overrides, zero-width characters and other format characters are not part of any word.
    expect(queryTerms("ab\u202ecd \u200bef\ufeff").terms.map((t) => t.word)).toEqual(["ab", "cd", "ef"]);
  });

  it("counts words over the length limit instead of dropping them silently", () => {
    expect(queryTerms(`queue ${"x".repeat(41)} ${"я".repeat(50)}`)).toMatchObject({ terms: [{ term: "queu", word: "queue" }], tooLong: 2 });
  });

  it("reduces operators, markup and control characters to plain words or nothing", () => {
    const hostile = 'title:"x" OR 1=1; DROP TABLE cards;-- <script>alert(1)</script> ${7*7} {{x}} \u0000‮ (a|b)* .*+?^$ \\';
    for (const { term, word } of queryTerms(hostile).terms) {
      expect(term).toMatch(/^[a-z0-9]+$/);
      expect(word).toMatch(/^[a-z0-9]+$/);
    }
    expect(queryTerms('"" :: -- || && !! ((( ))) *** ???').terms).toEqual([]);
  });
});

describe("isPendingReview", () => {
  it.each(["PENDING human review", " PENDING human review", "\tpending", "Pending review", "pending", "  \u00a0Pending — awaiting a reader", "\u200bPENDING human review", "*PENDING*", "(pending)", "PENDINGREVIEW", "pending-review"])(
    "treats %j as not yet reviewed",
    (value) => expect(isPendingReview(value)).toBe(true),
  );

  it.each(["Ada Example", "hand-written example", "A. Pending-Smith", "reviewed, nothing pending", "Dr Pendergast"])("treats %j as a reviewer's name", (value) => expect(isPendingReview(value)).toBe(false));
});

describe("nearMiss", () => {
  it("accepts long words that differ only at the end", () => {
    expect(nearMiss("idempotent", "idempotency")).toBe(true);
    expect(nearMiss("postgr", "postgresql")).toBe(true);
    expect(nearMiss("tenant", "tenancy")).toBe(true);
  });

  it("rejects short words and words that only share a start", () => {
    expect(nearMiss("lock", "locks")).toBe(false);
    expect(nearMiss("operation", "operator")).toBe(false);
    expect(nearMiss("replica", "replicationlag")).toBe(false);
  });
});
