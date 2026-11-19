import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { MAX_RESPONSE_BYTES, MAX_TOOL_RESULT_BYTES, wireBytes } from "../../src/limits.ts";
import { renderGet } from "../../src/render.ts";
import { answer } from "../../src/tools.ts";
import { largestCards, LARGEST_VERSION, textLength } from "../largest.ts";

// The Worker below is given this corpus in place of the real one: eight cards at the size limits.
vi.mock("../../src/generated/corpus.json", async () => {
  const { buildIndex } = await import("../../src/build-index.ts");
  const largest = await import("../largest.ts");
  const real = (await vi.importActual<{ default: { vocabulary: { workloads: []; topics: [] } } }>("../../src/generated/corpus.json")).default;
  return { default: buildIndex(largest.largestCards(8), largest.LARGEST_VERSION, real.vocabulary) };
});

const { default: worker } = await import("../../src/worker.ts");
const { default: index } = (await import("../../src/generated/corpus.json")) as unknown as { default: import("../../src/types.ts").CorpusIndex };

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../../..");
const cards = largestCards(8);
const cardIds = cards.map((card) => card.id);
const scratch = mkdtempSync(join(tmpdir(), "precedent-largest-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));

describe("cards at the size limits", () => {
  it("are valid cards: the repository's validator accepts them, and they are close to its size limit", () => {
    const dir = join(scratch, "cards");
    mkdirSync(dir);
    for (const card of cards) writeFileSync(join(dir, `${card.id}.yaml`), stringify(card));
    const run = spawnSync(process.execPath, [join(repoRoot, "scripts/validate.mjs"), dir], { encoding: "utf8" });
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
    for (const card of cards) {
      expect(textLength(card)).toBeGreaterThan(11_500);
      expect(textLength(card)).toBeLessThanOrEqual(12_000);
    }
  });

  it("together render to more than one response may hold", () => {
    const everything = renderGet(index, cardIds, { maxBytes: Number.MAX_SAFE_INTEGER }).text;
    expect(wireBytes(everything)).toBeGreaterThan(MAX_RESPONSE_BYTES);
  });
});

describe("precedent_get on more than fits", () => {
  it("sends whole ids up to the limit and names the rest, instead of an oversized or cut-off answer", () => {
    const result = renderGet(index, cardIds);
    expect(wireBytes(result.text)).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
    expect(result.found).toBeGreaterThanOrEqual(2);
    expect(result.leftOut).toBeGreaterThanOrEqual(1);
    expect(result.found + result.leftOut).toBe(8);
    expect(result.missing).toBe(0);

    // What was sent is the first ids, each complete; what was left out is the rest, in order.
    const sent = cardIds.slice(0, result.found);
    const left = cardIds.slice(result.found);
    expect(result.text).toContain(`LEFT OUT to keep this response within its size limit: ${left.join(", ")}. They are in the corpus and nothing is wrong with them: fetch them in another call.`);
    expect(result.text.match(/^CARD /gm)).toHaveLength(sent.length);
    for (const id of sent) expect(result.text).toContain(`cite the system as: ${id} | `);
    for (const id of left) expect(result.text).not.toContain(`CARD ${id}`);
    // The notice comes before the records, where a reader will not miss it.
    expect(result.text.indexOf("LEFT OUT")).toBeLessThan(result.text.indexOf("CARD "));
  });

  it("serves every id across follow-up calls for the ones left out", () => {
    let pending = cardIds;
    const served: string[] = [];
    for (let calls = 0; pending.length; calls++) {
      expect(calls).toBeLessThan(8);
      const result = renderGet(index, pending);
      expect(wireBytes(result.text)).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
      expect(result.found).toBeGreaterThan(0);
      served.push(...pending.slice(0, result.found));
      pending = pending.slice(result.found);
    }
    expect(served).toEqual(cardIds);
  });

  it("keeps a card's records together with its context when the cut falls inside a card", () => {
    const ids = cards.slice(0, 2).flatMap((card) => [card.id, ...card.records.map((record) => `${card.id}#${record.id}`)]).slice(0, 8);
    const one = wireBytes(renderGet(index, [ids[0]!, ids[1]!], { maxBytes: Number.MAX_SAFE_INTEGER }).text);
    const result = renderGet(index, ids, { maxBytes: one + 4096 });
    expect(wireBytes(result.text)).toBeLessThanOrEqual(one + 4096);
    expect(result.found).toBeGreaterThanOrEqual(2);
    expect(result.leftOut).toBe(ids.length - result.found);
    expect(result.text).toContain(`LEFT OUT to keep this response within its size limit: ${ids.slice(result.found).join(", ")}.`);
    // Every record sent is whole: it has its last line.
    expect(result.text.match(/^RECORD /gm)).toHaveLength(result.found - 1);
    expect(result.text.match(/^applies_from /gm)).toHaveLength(result.found - 1);
  });

  it("says plainly when even one record is more than the tool will send, and does not invent a way out", () => {
    const result = renderGet(index, [`${cardIds[0]}#d1`], { maxBytes: 3000 });
    expect(result.text).toContain(`TOO LARGE ${cardIds[0]}#d1: it is in the corpus, but it renders to more than this tool sends in one response. This tool cannot return it.`);
    expect(result.text).not.toMatch(/static|\.json|https?:/);
    expect(result).toMatchObject({ found: 0, leftOut: 0, missing: 1 });
  });

  it("says so honestly when a single id is more than the tool will ever send, and says what can still be asked for", () => {
    // A limit that one record with its card's context fits under, and a whole system does not.
    const record = wireBytes(renderGet(index, [`${cardIds[1]}#d1`]).text);
    const system = wireBytes(renderGet(index, [cardIds[0]!]).text);
    const maxBytes = record + 3000;
    expect(maxBytes).toBeLessThan(system);
    const result = renderGet(index, [cardIds[0]!, `${cardIds[1]}#d1`], { maxBytes });
    expect(wireBytes(result.text)).toBeLessThanOrEqual(maxBytes);
    expect(result.text).toContain(`TOO LARGE ${cardIds[0]}: it is in the corpus, but it renders to more than this tool sends in one response. Ask for its records one at a time, as ${cardIds[0]}#<record id>; a search shows their ids.`);
    expect(result.text.split("\n").find((line) => line.startsWith("TOO LARGE"))).not.toMatch(/static|\.json|https?:/);
    // The smaller id asked for with it is still served.
    expect(result.text).toContain(`RECORD ${cardIds[1]}#d1 (decision)`);
    expect(result).toMatchObject({ found: 1, leftOut: 0, missing: 1 });
  });
});

describe("the Worker on more than fits", () => {
  const call = (ids: string[]) =>
    worker.fetch(
      new Request("https://precedent.example/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "precedent_get", arguments: { ids } } }),
      }),
      {},
      { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext,
    );

  it("answers eight cards at the size limits with 200 and a left-out notice, never with a held-stream error", async () => {
    const logged: string[] = [];
    vi.mocked(console.log).mockImplementation((line: string) => void logged.push(line));
    const response = await call(cardIds);
    expect(response.status).toBe(200);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.byteLength).toBeLessThanOrEqual(MAX_RESPONSE_BYTES);
    const message = JSON.parse(new TextDecoder().decode(body).split("\n").find((line) => line.startsWith("data: "))!.slice(6));
    expect(message.result.isError).toBeFalsy();
    const text: string = message.result.content[0].text;
    expect(text).toContain(`Precedent corpus ${LARGEST_VERSION}.`);
    expect(text).toContain("LEFT OUT to keep this response within its size limit: ");
    expect(text).not.toMatch(/hold streams open|did not finish/);
    const counts = JSON.parse(logged.find((line) => line.includes('"event":"get"'))!);
    expect(counts.asked).toBe(8);
    expect(counts.found + counts.left_out).toBe(8);
    expect(counts.left_out).toBeGreaterThan(0);
  });
});

describe("any tool result over the limit", () => {
  it("becomes an honest error that says how big it was and what to do", () => {
    const small = answer("fine", "Lower `limit`.");
    expect(small).toEqual({ content: [{ type: "text", text: "fine" }] });

    const oversized = "\u3042".repeat(Math.ceil(MAX_TOOL_RESULT_BYTES / 3) + 1);
    const big = answer(oversized, "Lower `limit`, or narrow the search.");
    expect("isError" in big && big.isError).toBe(true);
    expect(big.content[0]!.text).toBe(
      `This answer would be ${wireBytes(oversized)} bytes, more than the ${MAX_TOOL_RESULT_BYTES} this endpoint sends in one response, so it was not sent. Lower \`limit\`, or narrow the search.`,
    );
    expect(wireBytes(big.content[0]!.text)).toBeLessThan(1024);
  });

  it("counts bytes as they are sent: multi-byte characters and JSON escapes included", () => {
    expect(wireBytes("abc")).toBe(3);
    expect(wireBytes("\u3042")).toBe(3);
    expect(wireBytes('a"b\\c\nd')).toBe(10);
  });
});
