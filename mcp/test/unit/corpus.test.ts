import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderGet } from "../../src/render.ts";
import { corpus, repoRoot } from "../helpers.ts";

// These run against what `npm run build` compiled from the real cards.
const publicDir = join(repoRoot, "mcp/public/corpus");
const skillIndex = readFileSync(join(repoRoot, "skills/precedent/corpus/INDEX.md"), "utf8");

describe("the compiled corpus", () => {
  it("reports the same version as the skill bundle built from the same cards", () => {
    const [, version, records, cards] = skillIndex.match(/Corpus version: `([0-9a-f]{12})` \((\d+) records from (\d+) cards\)/)!;
    expect(corpus.version).toBe(version);
    expect(corpus.facets.decisions + corpus.facets.failures).toBe(Number(records));
    expect(corpus.facets.systems).toBe(Number(cards));
  });

  it("indexes one system per card and every record, each of which can be fetched", () => {
    const cardFiles = readdirSync(join(repoRoot, "cards")).filter((name) => name.endsWith(".yaml"));
    expect(Object.keys(corpus.cards).length + Object.keys(corpus.tombstones).length).toBe(cardFiles.length);
    for (const doc of corpus.docs) {
      const id = doc.record ? `${doc.card}#${doc.record}` : doc.card;
      expect(renderGet(corpus, [id])).toMatchObject({ found: 1, missing: 0, withdrawn: 0 });
    }
    expect(corpus.docs).toHaveLength(corpus.facets.systems + corpus.facets.decisions + corpus.facets.failures);
  });

  it("offers exactly the schema's workloads and topics", () => {
    const schema = JSON.parse(readFileSync(join(repoRoot, "schema/card.schema.json"), "utf8"));
    expect(corpus.vocabulary.workloads.map((t) => t.value)).toEqual(schema.$defs.workload.enum);
    expect(corpus.vocabulary.topics.map((t) => t.value)).toEqual(schema.$defs.topic.enum);
  });
});

describe("the static corpus", () => {
  const whole = JSON.parse(readFileSync(join(publicDir, "corpus.json"), "utf8"));

  it("is one file holding every card, stamped with the corpus version", () => {
    expect(whole.corpus_version).toBe(corpus.version);
    expect(whole.cards.map((card: { id: string }) => card.id).sort()).toEqual([...Object.keys(corpus.cards), ...Object.keys(corpus.tombstones)].sort());
  });

  it("has one file per card and no others", () => {
    const files = readdirSync(join(publicDir, "cards")).sort();
    expect(files).toEqual(whole.cards.map((card: { id: string }) => `${card.id}.json`).sort());
    const one = JSON.parse(readFileSync(join(publicDir, "cards", files[0]!), "utf8"));
    expect(one.corpus_version).toBe(corpus.version);
    expect(`${one.card.id}.json`).toBe(files[0]);
  });

  it("is served with open CORS headers and never routed through the Worker", () => {
    expect(readFileSync(join(repoRoot, "mcp/public/_headers"), "utf8")).toMatch(/^\/corpus\/\*\n\s+Access-Control-Allow-Origin: \*/);
    expect(existsSync(join(repoRoot, "mcp/public/index.html"))).toBe(true);
    // Comments stripped, the configuration must leave run_worker_first unset, which means false.
    const config = readFileSync(join(repoRoot, "mcp/wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(JSON.parse(config).assets).toEqual({ directory: "./public" });
  });
});
