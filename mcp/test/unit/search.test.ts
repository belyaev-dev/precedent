import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/build-index.ts";
import { renderFacets } from "../../src/render.ts";
import { DEFAULT_LIMIT, MAX_LIMIT, search, type Group, type SearchParams } from "../../src/search.ts";
import { KINDS, type Card } from "../../src/types.ts";
import { corpus, fixtureCards, fixtureIndex } from "../helpers.ts";

const index = fixtureIndex();
const ALL = { kind: [...KINDS], limit: MAX_LIMIT };

/** Every hit for the parameters, as "id -> group". One search per kind keeps each under the maximum limit. */
function groups(params: SearchParams): Record<string, Group> {
  const out: Record<string, Group> = {};
  for (const kind of KINDS) {
    const result = search(index, { ...params, kind: [kind], limit: MAX_LIMIT });
    expect(result.matched).toBeLessThanOrEqual(MAX_LIMIT);
    for (const hit of result.hits) out[`${hit.doc.card}${hit.doc.record ? `#${hit.doc.record}` : ""}`] = hit.group;
  }
  return out;
}

describe("scale grouping", () => {
  it("puts a hit at the caller's scale only when every axis given is known and equal", () => {
    const got = groups({ traffic: 0, data: 0, team: 0 });
    expect(got["tiny-2024-notes"]).toBe("at_scale");
    expect(got["tiny-2024-notes#d1"]).toBe("at_scale");
    expect(got["tiny-2024-notes#f1"]).toBe("at_scale");
    expect(Object.values(got).filter((g) => g === "at_scale")).toHaveLength(3);
  });

  it("never treats a null tier as a match: equal on the known axis and null on the others is unknown scale", () => {
    const got = groups({ traffic: 0, data: 0, team: 0 });
    // halfknown has traffic tier 0, like the caller, and nothing on data or team.
    expect(got["halfknown-2023-webhooks"]).toBe("unknown_scale");
    expect(got["halfknown-2023-webhooks#d1"]).toBe("unknown_scale");
    const hit = search(index, { traffic: 0, data: 0, team: 0, query: "idempotency key", limit: 1 }).hits[0]!;
    expect(hit.equal).toEqual(["traffic"]);
    expect(hit.unknown).toEqual(["data", "team"]);
  });

  it("groups a card with no tiers at all as unknown scale whatever the caller's envelope", () => {
    for (const envelope of [{ traffic: 0 }, { traffic: 5, data: 5, team: 4 }, { data: 2 }, { team: 0 }]) {
      const got = groups(envelope);
      expect(got["murky-2022-queue"]).toBe("unknown_scale");
      expect(got["murky-2022-queue#d1"]).toBe("unknown_scale");
      expect(got["hostile-2025-injection#d1"]).toBe("unknown_scale");
    }
  });

  it("compares only the axes the caller gave", () => {
    // acme is T3, data unknown, team 1.
    expect(groups({ traffic: 3 })["acme-2023-orders#f1"]).toBe("at_scale");
    expect(groups({ traffic: 3, team: 1 })["acme-2023-orders#f1"]).toBe("at_scale");
    expect(groups({ traffic: 3, data: 3 })["acme-2023-orders#f1"]).toBe("unknown_scale");
    expect(groups({ data: 3 })["acme-2023-orders#f1"]).toBe("unknown_scale");
  });

  it("calls it a different scale as soon as one known tier differs, even when other axes are unknown", () => {
    const got = groups({ traffic: 0, data: 0, team: 0 });
    expect(got["acme-2023-orders"]).toBe("different_scale");
    expect(got["acme-2023-orders#f1"]).toBe("different_scale");
    expect(got["bigco-2020-streams"]).toBe("different_scale");
  });

  it("puts a decision whose floor is above the envelope out of envelope, ahead of any scale match", () => {
    const small = groups({ traffic: 0, data: 0, team: 0 });
    expect(small["acme-2023-orders#d1"]).toBe("out_of_envelope");
    expect(small["bigco-2020-streams#d1"]).toBe("out_of_envelope");
    // One tier below a traffic floor of 3 is still below it.
    expect(groups({ traffic: 2 })["acme-2023-orders#d1"]).toBe("out_of_envelope");
    // At the floor the decision is back in an ordinary group.
    expect(groups({ traffic: 3 })["acme-2023-orders#d1"]).toBe("at_scale");
    // A floor on several axes must be met on each: traffic is met here, data is not.
    expect(groups({ traffic: 5, data: 3 })["bigco-2020-streams#d1"]).toBe("out_of_envelope");
    expect(groups({ traffic: 5, data: 5, team: 4 })["bigco-2020-streams#d1"]).toBe("at_scale");
  });

  it("never puts a failure or a system out of envelope: floors belong to decisions", () => {
    const got = groups({ traffic: 0, data: 0, team: 0 });
    expect(Object.entries(got).filter(([, g]) => g === "out_of_envelope").map(([id]) => id).sort()).toEqual(["acme-2023-orders#d1", "bigco-2020-streams#d1"]);
  });

  it("does not exclude a decision for a floor at or below the envelope", () => {
    expect(groups({ traffic: 0 })["halfknown-2023-webhooks#d1"]).toBe("at_scale");
  });

  it("never lists a decision at the caller's scale while its floor names an axis the caller left out", () => {
    // bigco is traffic tier 5 and its decision's floor is traffic 4, data 4. The caller gives traffic only.
    const result = search(index, { ...ALL, traffic: 5, query: "partitioned replicated log polling" });
    const hit = result.hits.find((h) => h.doc.record === "d1" && h.doc.card === "bigco-2020-streams")!;
    expect(hit.group).toBe("floor_unchecked");
    expect(hit.equal).toEqual(["traffic"]);
    expect(hit.floorAbove).toEqual([]);
    expect(hit.floorUnchecked).toEqual(["data"]);
    expect(result.counts.floor_unchecked).toBe(1);
    // The same holds whatever the card's own tiers say, and for a source-stated floor.
    expect(groups({ data: 5, team: 4 })["bigco-2020-streams#d1"]).toBe("floor_unchecked");
    expect(groups({ team: 1 })["acme-2023-orders#d1"]).toBe("floor_unchecked");
    // A floor known to be above the envelope on one axis outranks one that could not be checked on another.
    expect(groups({ data: 3 })["bigco-2020-streams#d1"]).toBe("out_of_envelope");
    // Once every floor axis is given and met, the decision is back in a scale group.
    expect(groups({ traffic: 5, data: 5 })["bigco-2020-streams#d1"]).toBe("at_scale");
    // Systems and failures have no floor.
    expect(groups({ traffic: 5 })["bigco-2020-streams"]).toBe("at_scale");
  });

  it("compares nothing when no envelope is given, and marks every floor as not checked", () => {
    const result = search(index, ALL);
    expect(result.counts.no_envelope + result.counts.floor_unchecked).toBe(result.matched);
    expect(result.counts.at_scale + result.counts.different_scale + result.counts.unknown_scale + result.counts.out_of_envelope).toBe(0);
    const floored = groups({});
    expect(Object.entries(floored).filter(([, g]) => g === "floor_unchecked").map(([id]) => id).sort()).toEqual(["acme-2023-orders#d1", "bigco-2020-streams#d1", "halfknown-2023-webhooks#d1"]);
  });

  it("counts every group honestly, including the ones the limit cuts off", () => {
    const result = search(index, { kind: [...KINDS], traffic: 0, data: 0, team: 0, limit: 2 });
    expect(result.matched).toBe(index.docs.length);
    expect(result.counts).toEqual({ at_scale: 3, different_scale: 3, unknown_scale: 7, floor_unchecked: 0, out_of_envelope: 2, no_envelope: 0 });
    expect(result.hits).toHaveLength(2);
  });

  it("says so in the counts when nothing is at the caller's scale", () => {
    const result = search(index, { ...ALL, traffic: 2, data: 2, team: 2 });
    expect(result.matched).toBeGreaterThan(0);
    expect(result.counts.at_scale).toBe(0);
  });

  it("lists hits at the caller's scale first, whatever their relevance", () => {
    // Half the words are halfknown's and bigco's title words; the other half appear only in tiny's facts, which weigh less.
    const result = search(index, { ...ALL, query: "webhook delivery database file", traffic: 0, data: 0, team: 0 });
    const best = [...result.hits].sort((a, b) => b.score - a.score)[0]!;
    expect(best.group).not.toBe("at_scale");
    const order = result.hits.map((hit) => hit.group);
    expect(order[0]).toBe("at_scale");
    expect(order).toEqual([...order].sort((a, b) => ["at_scale", "different_scale", "unknown_scale", "out_of_envelope"].indexOf(a) - ["at_scale", "different_scale", "unknown_scale", "out_of_envelope"].indexOf(b)));
  });
});

describe("keyword search", () => {
  it("finds a record by its aliases, title and facts, best match first", () => {
    const result = search(index, { query: "duplicate webhooks after a retry" });
    expect(result.hits[0]!.doc).toEqual({ kind: "decision", card: "halfknown-2023-webhooks", record: "d1" });
    expect(result.hits[0]!.matched).toEqual(expect.arrayContaining(["duplicate", "webhooks", "retry"]));
  });

  it("matches near misses such as idempotence for idempotency", () => {
    const result = search(index, { query: "idempotence" });
    expect(result.hits.map((h) => `${h.doc.card}#${h.doc.record}`)).toContain("halfknown-2023-webhooks#d1");
    expect(result.unknownWords).toEqual([]);
  });

  it("returns records only by default, and systems when asked", () => {
    expect(search(index, { query: "sqlite" }).hits.every((hit) => hit.doc.kind !== "system")).toBe(true);
    const systems = search(index, { query: "sqlite", kind: ["system"] });
    expect(systems.hits.map((hit) => hit.doc.card)).toEqual(["tiny-2024-notes"]);
    expect(systems.hits[0]!.record).toBeNull();
  });

  it("reports words that occur nowhere in the corpus, and still matches on the rest", () => {
    const result = search(index, { query: "zookeeper sqlite" });
    expect(result.unknownWords).toEqual(["zookeeper"]);
    expect(result.matched).toBeGreaterThan(0);
  });

  it("requires at least half of the known words, so one common word is not a match", () => {
    const one = search(index, { ...ALL, query: "database" }).matched;
    const four = search(index, { ...ALL, query: "database sqlite backup restore" });
    expect(four.matched).toBeLessThan(one);
    expect(four.hits.every((hit) => hit.matched.length >= 2)).toBe(true);
  });

  it("returns an empty, well-formed result when nothing matches", () => {
    const result = search(index, { query: "zookeeper quorum paxos", traffic: 1 });
    expect(result.matched).toBe(0);
    expect(result.hits).toEqual([]);
    expect(result.unknownWords).toEqual(["zookeeper", "quorum", "paxos"]);
    expect(result.counts).toEqual({ at_scale: 0, different_scale: 0, unknown_scale: 0, floor_unchecked: 0, out_of_envelope: 0, no_envelope: 0 });
  });

  it("matches nothing when a query was given but holds no usable words", () => {
    for (const query of ["the of and !!! ???", "?", "a", "x".repeat(41), "🙂 → ∑"]) {
      const result = search(index, { ...ALL, traffic: 0, data: 0, team: 0, query });
      expect(result).toMatchObject({ queryGiven: true, noUsableWords: true, matched: 0, hits: [], words: [] });
      expect(Object.values(result.counts).every((count) => count === 0)).toBe(true);
    }
    expect(search(index, { query: "x".repeat(41) }).tooLongWords).toBe(1);
  });

  it("treats an absent or blank query as filters only", () => {
    for (const query of [undefined, "", "  \n\t "]) {
      const result = search(index, { ...ALL, query });
      expect(result).toMatchObject({ queryGiven: false, noUsableWords: false, matched: index.docs.length });
    }
  });

  it("searches words in any script, so that a non-Latin query is reported as absent instead of matching everything", () => {
    for (const query of ["очередь задач", "数据库 分片", "قاعدة بيانات", "ουρά μηνυμάτων"]) {
      const result = search(index, { ...ALL, traffic: 0, data: 0, team: 0, query });
      expect(result.noUsableWords).toBe(false);
      expect(result.matched).toBe(0);
      expect(result.words.length).toBeGreaterThan(0);
      expect(result.unknownWords).toEqual(result.words);
    }
    // A mixed query still matches on its English words and names the rest.
    const mixed = search(index, { query: "sqlite резервная копия backup" });
    expect(mixed.unknownWords).toEqual(["резервная", "копия"]);
    expect(mixed.matched).toBeGreaterThan(0);
  });

  it("clamps the limit and defaults it", () => {
    expect(search(index, { kind: [...KINDS] }).hits).toHaveLength(DEFAULT_LIMIT);
    expect(search(index, { kind: [...KINDS], limit: 1 }).hits).toHaveLength(1);
    expect(search(index, { kind: [...KINDS], limit: 10_000 }).hits).toHaveLength(MAX_LIMIT);
    expect(search(index, { kind: [...KINDS], limit: -5 }).hits).toHaveLength(1);
  });
});

describe("filters", () => {
  const ids = (params: SearchParams): string[] => search(index, { ...ALL, ...params }).hits.map((hit) => `${hit.doc.card}${hit.doc.record ? `#${hit.doc.record}` : ""}`).sort();

  it("filters by kind", () => {
    expect(ids({ kind: ["failure"] })).toEqual(["acme-2023-orders#f1", "tiny-2024-notes#f1"]);
  });

  it("filters by the card's workloads, any of", () => {
    expect(ids({ workload: ["job-queue"] })).toEqual(["murky-2022-queue", "murky-2022-queue#d1"]);
    expect(ids({ workload: ["job-queue", "rate-limiting"] })).toHaveLength(4);
    // bigco lists webhook-delivery second.
    expect(ids({ workload: ["webhook-delivery"], kind: ["system"] })).toEqual(["bigco-2020-streams", "halfknown-2023-webhooks"]);
  });

  it("filters by topic, which leaves systems out", () => {
    expect(ids({ topic: ["backup-restore"] })).toEqual(["tiny-2024-notes#f1"]);
    expect(ids({ topic: ["backup-restore"], kind: ["system"] })).toEqual([]);
  });

  it("filters by tech tag, on a system through its components and records", () => {
    expect(ids({ tech: ["sqlite"] })).toEqual(["tiny-2024-notes", "tiny-2024-notes#d1", "tiny-2024-notes#f1"]);
    expect(ids({ tech: ["rails"] })).toEqual(["tiny-2024-notes"]);
    expect(ids({ tech: ["kafka"], kind: ["decision"] })).toEqual(["bigco-2020-streams#d1"]);
  });

  it("names tech tags that no card uses", () => {
    const result = search(index, { tech: ["cobol", "sqlite"] });
    expect(result.unknownTech).toEqual(["cobol"]);
    expect(search(index, { tech: ["constructor"] })).toMatchObject({ unknownTech: ["constructor"], matched: 0 });
  });

  it("counts a tag named like an object internal as a tag", () => {
    const cards = fixtureCards();
    const tiny = cards.find((card) => card.id === "tiny-2024-notes") as Card;
    tiny.records[0]!.tech.push("constructor");
    tiny.components![0]!.tech = "constructor";
    const odd = buildIndex(cards, "fixture00001", index.vocabulary);
    expect(Object.hasOwn(odd.facets.tech, "constructor")).toBe(true);
    expect(odd.facets.tech.constructor).toBe(1);
    expect(odd.facets.tech.sqlite).toBe(1);
    for (const count of Object.values(odd.facets.tech)) expect(count).toBeTypeOf("number");
    expect(renderFacets(odd)).toMatch(/Tech tags \(tag, systems\): postgres 3, .*\bconstructor 1\b/);
    expect(search(odd, { tech: ["constructor"], kind: [...KINDS] })).toMatchObject({ unknownTech: [], matched: 2 });
    // The untouched index still has no such tag, and nothing leaked in from Object.prototype.
    expect(Object.keys(index.facets.tech)).not.toContain("constructor");
  });

  it("filters by footprint and counts what it dropped for stating none", () => {
    const result = search(index, { ...ALL, footprint: ["single-node", "single-database"] });
    expect(new Set(result.hits.map((hit) => hit.doc.card))).toEqual(new Set(["tiny-2024-notes", "halfknown-2023-webhooks"]));
    // murky and hostile state no footprint: two docs each.
    expect(result.excludedNoFootprint).toBe(4);
  });

  it("combines filters with and", () => {
    expect(ids({ workload: ["crud-app"], kind: ["decision"], tech: ["postgres"] })).toEqual(["acme-2023-orders#d1"]);
  });
});

describe("withdrawn cards", () => {
  it("are not searchable: nothing of a tombstone is indexed", () => {
    expect(index.docs.some((doc) => doc.card === "gone-2021-cache" || doc.card === "acme-2021-search")).toBe(false);
    expect(Object.keys(index.cards)).not.toContain("gone-2021-cache");
    // The reason for withdrawal is not search text either.
    expect(search(index, { ...ALL, query: "withdrawn publisher bench" })).toMatchObject({ matched: 0, unknownWords: ["withdrawn", "publisher", "bench"] });
    expect(index.facets.withdrawn).toEqual(["acme-2021-search", "gone-2021-cache"]);
  });
});

describe("hostile query strings", () => {
  const strings = [
    "constructor",
    "__proto__",
    "toString valueOf hasOwnProperty prototype",
    "constructor prototype __defineGetter__ isPrototypeOf",
    '"; DROP TABLE cards; --',
    "title:foo AND (bar OR baz) NOT qux~2 ^5 +must -mustnot",
    "a* b? [a-z]+ (x|y){1,99999} \\d+ (?=look) (a+)+$",
    "<script>alert(1)</script> ]( javascript://x `rm -rf /`",
    "\u0000\u0001\u001f\u007f ‮​﻿",
    "💥 ｆｕｌｌｗｉｄｔｈ ﬁligature Ω≈ç√ 数据库 قاعدة",
    "%00 %27 ../../etc/passwd ${jndi:ldap://x} {{7*7}}",
    " ".repeat(200),
    "x".repeat(5000),
    "word ".repeat(2000),
    "",
  ];

  it.each([["fixtures", index], ["the real corpus", corpus]] as const)("never throws and never matches on object internals (%s)", (_name, target) => {
    for (const query of strings) {
      const result = search(target, { query, kind: [...KINDS], traffic: 0, limit: MAX_LIMIT });
      expect(Number.isInteger(result.matched)).toBe(true);
      expect(result.words.length).toBeLessThanOrEqual(12);
      // Words are echoed back, so they may hold letters, digits and their marks and nothing else.
      for (const word of [...result.words, ...result.unknownWords]) expect(word).toMatch(/^[\p{L}\p{N}\p{M}]{2,40}$/u);
      for (const hit of result.hits) expect(Number.isFinite(hit.score)).toBe(true);
    }
    // "constructor" is a word like any other: it matches only where a card uses it.
    const inherited = search(target, { query: "constructor", kind: [...KINDS] });
    expect(inherited.matched).toBe(Object.hasOwn(target.postings, "constructor") ? inherited.matched : 0);
    if (!Object.hasOwn(target.postings, "constructor")) expect(inherited.unknownWords).toEqual(["constructor"]);
  });

  it("gives the same result for a query with operators as for its plain words", () => {
    const plain = search(index, { query: "sqlite backup" });
    const dressed = search(index, { query: '+sqlite AND "backup"~3 OR (NOT *)' });
    // and, or, not are ordinary words here; none of them is an operator. "and", "or", "not" are stopwords.
    expect(dressed.words).toEqual(plain.words);
    expect(dressed.hits.map((h) => h.doc)).toEqual(plain.hits.map((h) => h.doc));
  });

  it("stays fast on the longest input it will read", () => {
    const start = performance.now();
    for (let i = 0; i < 200; i++) search(corpus, { query: "queue ".repeat(40) + "x".repeat(4000), kind: [...KINDS], traffic: 0 });
    expect((performance.now() - start) / 200).toBeLessThan(5);
  });
});
