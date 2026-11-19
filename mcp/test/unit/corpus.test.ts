import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_TOOL_RESULT_BYTES, wireBytes } from "../../src/limits.ts";
import { renderGet } from "../../src/render.ts";
import { corpus, repoRoot } from "../helpers.ts";

// These run against what `npm run build` compiled from the cards in cards/.
/** wrangler.jsonc with its comments stripped. */
const config = () => JSON.parse(readFileSync(join(repoRoot, "mcp/wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
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

  it("fits its eight largest records or systems in one response, with nothing left out", () => {
    const ids = corpus.docs.map((doc) => (doc.record ? `${doc.card}#${doc.record}` : doc.card));
    const largest = ids
      .map((id) => ({ id, size: wireBytes(renderGet(corpus, [id]).text) }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 8)
      .map((entry) => entry.id);
    const result = renderGet(corpus, largest);
    expect(result).toMatchObject({ found: 8, leftOut: 0, missing: 0 });
    // Real answers are nowhere near the limit; it exists for cards far larger than any yet written.
    expect(wireBytes(result.text)).toBeLessThan(MAX_TOOL_RESULT_BYTES / 2);
  });

  it("offers exactly the schema's workloads and topics", () => {
    const schema = JSON.parse(readFileSync(join(repoRoot, "schema/card.schema.json"), "utf8"));
    expect(corpus.vocabulary.workloads.map((t) => t.value)).toEqual(schema.$defs.workload.enum);
    expect(corpus.vocabulary.topics.map((t) => t.value)).toEqual(schema.$defs.topic.enum);
  });
});

describe("the Worker's configuration", () => {
  it("is for local development only: no public route, no static assets, no production environment, and no deployment of its own", () => {
    const configuration = config();
    for (const key of ["assets", "routes", "route", "env", "workers_dev", "preview_urls", "vars", "triggers"]) expect(configuration, key).not.toHaveProperty(key);
    expect(JSON.stringify(configuration)).not.toMatch(/precedents\.dev|custom_domain|\.workers\.dev/);
    expect(existsSync(join(repoRoot, "mcp/public"))).toBe(false);
  });

  it("binds the private corpus bucket as CORPUS, which wrangler dev gives an empty local copy of", () => {
    expect(config().r2_buckets).toEqual([{ binding: "CORPUS", bucket_name: "precedent-corpus" }]);
  });

  it("keeps the Node compatibility flag the MCP handler needs", () => {
    expect(config().compatibility_flags).toContain("nodejs_compat");
  });

  it("logs the Worker's own lines only: no invocation logs, and tracing explicitly off", () => {
    expect(config().observability).toEqual({ enabled: true, logs: { invocation_logs: false }, traces: { enabled: false } });
  });

  it("limits each address to 120 requests a minute", () => {
    expect(config().ratelimits).toEqual([{ name: "RATE_LIMITER", namespace_id: "1001", simple: { limit: 120, period: 60 } }]);
  });
});
