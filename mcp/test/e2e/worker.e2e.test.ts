// Speaks MCP to the Worker running under `wrangler dev`: the real bundle, the real static assets,
// the local emulation of the rate limiting binding. Nothing here touches Cloudflare.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { corpus } from "../helpers.ts";

const mcpDir = resolve(fileURLToPath(import.meta.url), "../../..");
let origin: string;
let dev: ChildProcess;
let output = "";
// The local rate limiter keeps its counters on disk. A fresh directory per run stops one run's
// requests from counting against the next when the suite is run twice within a minute.
const stateDir = mkdtempSync(join(tmpdir(), "precedent-e2e-"));

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.on("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

beforeAll(async () => {
  const [port, inspectorPort] = [await freePort(), await freePort()];
  origin = `http://127.0.0.1:${port}`;
  dev = spawn(resolve(mcpDir, "node_modules/.bin/wrangler"), ["dev", "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", String(inspectorPort), "--persist-to", stateDir], {
    cwd: mcpDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" },
  });
  dev.stdout!.on("data", (chunk) => (output += chunk));
  dev.stderr!.on("data", (chunk) => (output += chunk));
  const deadline = Date.now() + 50_000;
  for (;;) {
    if (dev.exitCode !== null) throw new Error(`wrangler dev exited early:\n${output}`);
    const up = await fetch(`${origin}/corpus/corpus.json`).then((r) => r.ok, () => false);
    if (up) return;
    if (Date.now() > deadline) throw new Error(`wrangler dev did not come up:\n${output}`);
    await new Promise((r) => setTimeout(r, 250));
  }
});

afterAll(() => {
  // wrangler runs workerd as a child; stop the whole group.
  if (dev?.pid) process.kill(-dev.pid, "SIGTERM");
  rmSync(stateDir, { recursive: true, force: true });
});

// The local rate limiter counts per client address, as production does. Each group of tests uses its
// own address so that one group's requests are not counted against another's.
const from = (address: string): Record<string, string> => ({ "cf-connecting-ip": address });

/** An SDK client pinned to the 2026-07-28 protocol, or left to the SDK's default, which is the 2025 handshake. */
async function connect(address: string, era: "modern" | "legacy"): Promise<Client> {
  const client = new Client({ name: "precedent-e2e", version: "0.0.0" }, era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: from(address) } }));
  return client;
}

const textOf = (result: unknown): string => {
  const { content, isError } = result as { content: { type: string; text: string }[]; isError?: boolean };
  expect(isError).toBeFalsy();
  expect(content).toHaveLength(1);
  expect(content[0]!.type).toBe("text");
  return content[0]!.text;
};

describe("a 2026-07-28 MCP client against the local Worker", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect("198.51.100.1", "modern");
  });
  afterAll(() => client?.close());

  it("connects without a handshake and learns what the server is", () => {
    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getServerVersion()).toMatchObject({ name: "precedent", version: `0.1.0+${corpus.version}` });
    expect(client.getInstructions()).toContain(`${origin}/corpus/corpus.json`);
    // No list-change notifications: there is nothing to subscribe to.
    expect(client.getServerCapabilities()).toEqual({ tools: { listChanged: false } });
  });

  it("is not given a stream to hold open when it asks to subscribe", async () => {
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "precedent-e2e", version: "0.0.0" }, "io.modelcontextprotocol/clientCapabilities": {} };
    const started = Date.now();
    const response = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": "subscriptions/listen", ...from("198.51.100.3") },
      body: JSON.stringify({ jsonrpc: "2.0", id: 41, method: "subscriptions/listen", params: { notifications: { toolsListChanged: true }, _meta: meta } }),
      signal: AbortSignal.timeout(5000),
    });
    // Reading to the end only returns if the server closed the response.
    const body = await response.text();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).not.toBeNull();
    expect(body).toContain('"method":"notifications/subscriptions/acknowledged","params":{"notifications":{}');
    expect(body).toContain('"resultType":"complete"');
    expect(body).not.toContain("keepalive");
  });

  it("lists the three read-only tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["precedent_search", "precedent_get", "precedent_facets"]);
    for (const tool of tools) expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
  });

  it("precedent_search groups hits by the caller's envelope and reports coverage", async () => {
    const text = textOf(await client.callTool({ name: "precedent_search", arguments: { query: "background jobs in postgres instead of redis", traffic: 0, data: 0, team: 0 } }));
    expect(text).toContain(`Precedent corpus ${corpus.version}.`);
    expect(text).toContain("Your envelope: T0 D0 O0.");
    expect(text).toMatch(/Coverage: \d+ matched; \d+ at your scale, \d+ at a different scale, \d+ of unknown scale, \d+ with a floor not checked, \d+ out of envelope\. Showing \d+\./);
    expect(text).toContain("cite: tosbourn-2023-client-rails-jobs#d1 | Unnamed client of Tosbourn Ltd, 2023 | https://tosbourn.com/replacing-sidekiq-with-goodjob/ | corpus ");
    expect(text).toContain("UNKNOWN SCALE:");
  });

  it("precedent_search finds a baseline system when asked for one", async () => {
    const text = textOf(await client.callTool({ name: "precedent_search", arguments: { kind: ["system"], footprint: ["single-node"], traffic: 2, data: 2, team: 0 } }));
    expect(text).toContain("AT YOUR SCALE:");
    expect(text).toContain("cite: healthchecks-2026-object-storage | Healthchecks.io, 2026-04 | ");
    expect(text).toContain("scale T2 D2 O0");
  });

  it("precedent_get returns full records, a system, and honest notices for ids it cannot serve", async () => {
    const text = textOf(await client.callTool({ name: "precedent_get", arguments: { ids: ["healthchecks-2025-tarpit-outage#d1", "healthchecks-2025-tarpit-outage#f1", "tailscale-2021-control-plane-state", "no-such-card#d1"] } }));
    expect(text).toContain("RECORD healthchecks-2025-tarpit-outage#d1 (decision)");
    expect(text).toContain("RECORD healthchecks-2025-tarpit-outage#f1 (failure)");
    expect(text).toContain("rejected: Tarpit (wait, then return 429); reason: ");
    expect(text).toContain("applies_from (floor below which not to copy this): none recorded");
    expect(text).toContain("CARD tailscale-2021-control-plane-state");
    expect(text).toContain("review: PENDING human review (machine-checked only)");
    expect(text).toContain(`NOT FOUND no-such-card#d1: corpus ${corpus.version} has no card with that id.`);
    expect(text.match(/^CARD /gm)).toHaveLength(2);
  });

  it("precedent_facets describes the corpus", async () => {
    const text = textOf(await client.callTool({ name: "precedent_facets", arguments: {} }));
    expect(text).toContain(`Size: ${corpus.facets.systems} systems, ${corpus.facets.decisions} decision records, ${corpus.facets.failures} failure records.`);
    expect(text).toContain("- job-queue, ");
    expect(text).toContain("Tech tags (tag, systems): ");
  });

  it("turns a call outside the schema into an error, not a guess", async () => {
    const outcome = await client.callTool({ name: "precedent_search", arguments: { query: "x", traffic: 9 } }).then(
      (result) => (result as { isError?: boolean }).isError,
      () => true,
    );
    expect(outcome).toBe(true);
  });
});

describe("the SDK's client with its default 2025 handshake against the local Worker", () => {
  it("connects, lists and calls", async () => {
    const client = await connect("198.51.100.4", "legacy");
    expect(client.getProtocolEra()).toBe("legacy");
    expect(client.getServerCapabilities()).toEqual({ tools: { listChanged: false } });
    expect((await client.listTools()).tools).toHaveLength(3);
    expect(textOf(await client.callTool({ name: "precedent_facets", arguments: {} }))).toContain(`Precedent corpus ${corpus.version}.`);
    await client.close();
  });
});

describe("a 2025-era client against the local Worker", () => {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", ...from("198.51.100.2") };
  const send = async (message: unknown, extra: Record<string, string> = {}) => {
    const response = await fetch(`${origin}/mcp`, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(message) });
    const body = await response.text();
    const data = body.split("\n").find((line) => line.startsWith("data: "));
    return { response, message: data ? JSON.parse(data.slice(6)) : body ? JSON.parse(body) : null };
  };

  it("completes the initialize handshake and a tool call without a session", async () => {
    const init = await send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "legacy", version: "0" } } });
    expect(init.response.status).toBe(200);
    expect(init.response.headers.get("mcp-session-id")).toBeNull();
    expect(init.message.result.protocolVersion).toBe("2025-06-18");

    const version = { "mcp-protocol-version": "2025-06-18" };
    const ack = await send({ jsonrpc: "2.0", method: "notifications/initialized" }, version);
    expect(ack.response.status).toBe(202);

    const called = await send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "precedent_get", arguments: { ids: ["slack-2017-job-queue#f1"] } } }, version);
    expect(called.message.id).toBe(2);
    expect(called.message.result.content[0].text).toContain("RECORD slack-2017-job-queue#f1 (failure)");
  });

  it("is refused a batch and an oversized body, each with a pointer to the static corpus", async () => {
    const batch = await send([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
    expect(batch.response.status).toBe(400);
    expect(batch.message.error.message).toContain(`${origin}/corpus/corpus.json`);

    const large = await send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "precedent_search", arguments: { query: "x".repeat(40_000) } } });
    expect(large.response.status).toBe(413);
    expect(large.message.error.message).toContain(`${origin}/corpus/corpus.json`);

    // A page on the endpoint's own origin or on a local one may call; a page anywhere else may not.
    const list = { jsonrpc: "2.0", id: 4, method: "tools/list" };
    const version = { "mcp-protocol-version": "2025-06-18" };
    expect((await send(list, { ...version, origin })).response.status).toBe(200);
    expect((await send(list, { ...version, origin: "http://localhost:5173" })).response.status).toBe(200);
    expect((await send(list, { ...version, origin: "https://evil.example" })).response.status).toBe(403);

    // A browser client on an allowed origin can read both refusals, as it can read an answer.
    const answered = await send({ jsonrpc: "2.0", id: 3, method: "tools/list" }, { "mcp-protocol-version": "2025-06-18", origin: "http://localhost:5173" });
    expect(answered.response.headers.get("access-control-allow-origin")).toBe("*");
    for (const { response } of [batch, large]) {
      expect(response.headers.get("access-control-allow-origin")).toBe(answered.response.headers.get("access-control-allow-origin"));
      expect(response.headers.get("access-control-expose-headers")).toBe(answered.response.headers.get("access-control-expose-headers"));
    }
  });
});

describe("the static corpus on the local Worker", () => {
  it("serves the whole corpus and each card as files, without running the Worker", async () => {
    const whole = await fetch(`${origin}/corpus/corpus.json`);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toContain("application/json");
    expect(whole.headers.get("access-control-allow-origin")).toBe("*");
    // Every response the Worker produces carries this header; a file served by the platform does not.
    expect(whole.headers.get("x-precedent-worker")).toBeNull();
    const body = await whole.json() as { corpus_version: string; cards: { id: string }[] };
    expect(body.corpus_version).toBe(corpus.version);
    expect(body.cards).toHaveLength(corpus.facets.systems + corpus.facets.withdrawn.length);

    const one = await fetch(`${origin}/corpus/cards/slack-2017-job-queue.json`);
    expect(one.status).toBe(200);
    expect(one.headers.get("x-precedent-worker")).toBeNull();
    expect(((await one.json()) as { card: { id: string } }).card.id).toBe("slack-2017-job-queue");

    const home = await fetch(`${origin}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get("x-precedent-worker")).toBeNull();
  });

  it("falls through to the Worker only for paths that are not files", async () => {
    const missing = await fetch(`${origin}/corpus/cards/no-such-card.json`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("x-precedent-worker")).toBe("1");
  });
});

describe("rate limiting on the local Worker", () => {
  it("refuses one address once it passes the limit, points it at the static corpus, and leaves other addresses alone", async () => {
    const ping = (address: string) =>
      fetch(`${origin}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...from(address) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      });
    const statuses: number[] = [];
    let refusal: Response | undefined;
    for (let i = 0; i < 170 && !refusal; i++) {
      const response = await ping("198.51.100.99");
      statuses.push(response.status);
      if (response.status === 429) refusal = response;
      else await response.arrayBuffer();
    }
    // wrangler.jsonc allows 120 a minute; the binding is approximate, so only the order of magnitude is asserted.
    expect(refusal, `statuses: ${statuses.join(" ")}`).toBeDefined();
    expect(statuses.filter((status) => status === 200).length).toBeGreaterThanOrEqual(100);
    expect(refusal!.headers.get("retry-after")).toBe("60");
    expect(refusal!.headers.get("access-control-allow-origin")).toBe("*");
    expect(refusal!.headers.get("access-control-expose-headers")).toBe("Retry-After");
    expect(((await refusal!.json()) as { error: { message: string } }).error.message).toBe(
      `Too many requests from this address; wait a minute and retry. The whole corpus is a static file with no request limits: ${origin}/corpus/corpus.json`,
    );

    expect((await ping("198.51.100.100")).status).toBe(200);
    // Another address in the refused client's IPv6 /64 would be refused with it; here, a different /64 is not.
    expect((await ping("2001:db8:1:2::1")).status).toBe(200);
    expect((await fetch(`${origin}/corpus/corpus.json`, { headers: from("198.51.100.99") })).status).toBe(200);
  });
});
