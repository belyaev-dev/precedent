#!/usr/bin/env node
// Measures what one request costs under local emulation. Three independent readings, because none of
// them is the number Cloudflare bills or limits:
//   isolate  CPU-profiler samples taken inside the Worker's isolate under `wrangler dev` (workerd),
//            counted and multiplied by the sampling interval. The closest local stand-in for Worker CPU time.
//   process  CPU time the whole local workerd process used, per request. An upper bound: it includes
//            HTTP handling, the runtime, and wrangler's own proxy and asset-routing Workers.
//   node     CPU time per request of the same handler called in-process under Node (same V8 family, no HTTP).
// Local numbers on a developer machine are not production numbers. Use them for the order of magnitude.
// Usage: node scripts/bench.mjs [requests per scenario, default 400]
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import worker from "../src/worker.ts";

const mcpDir = resolve(fileURLToPath(import.meta.url), "../..");
const N = Number(process.argv[2] ?? 400);
const WARMUP = Math.min(100, N);
const INTERVAL_US = 100;
console.log = ((write) => (...args) => (typeof args[0] === "string" && args[0].startsWith('{"event"') ? undefined : write(...args)))(console.log); // the handler's own count lines

const freePort = () =>
  new Promise((done, fail) => {
    const server = createServer();
    server.on("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });

const [port, inspectorPort] = [await freePort(), await freePort()];
const origin = `http://127.0.0.1:${port}`;
const dev = spawn(resolve(mcpDir, "node_modules/.bin/wrangler"), ["dev", "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", String(inspectorPort)], {
  cwd: mcpDir,
  detached: true,
  stdio: "ignore",
  env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
});
const stop = () => {
  try {
    process.kill(-dev.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stop);

for (let i = 0; ; i++) {
  if (await fetch(`${origin}/corpus/corpus.json`).then((r) => r.ok, () => false)) break;
  if (i > 200) throw new Error("wrangler dev did not come up");
  await new Promise((r) => setTimeout(r, 250));
}

// --- process CPU: every workerd process in wrangler's process group ---
function workerdCpuMs() {
  const rows = execFileSync("ps", ["-axo", "pgid=,time=,comm="], { encoding: "utf8" }).split("\n");
  let total = 0;
  for (const row of rows) {
    const match = row.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!match || Number(match[1]) !== dev.pid || !match[3].includes("workerd")) continue;
    // [[dd-]hh:]mm:ss[.cc]
    const [clock, days = "0"] = match[2].split("-").reverse();
    const parts = clock.split(":").map(Number);
    total += (Number(days) * 86400 + parts.reduce((sum, part) => sum * 60 + part, 0)) * 1000;
  }
  return total;
}

// --- isolate CPU: a minimal Chrome DevTools Protocol client on wrangler's inspector ---
const targets = await (await fetch(`http://127.0.0.1:${inspectorPort}/json`)).json();
// wrangler's inspector proxy accepts only connections that name a local or DevTools origin.
const socket = new WebSocket(targets[0].webSocketDebuggerUrl, { headers: { origin: `http://127.0.0.1:${inspectorPort}` } });
await new Promise((done, fail) => {
  socket.onopen = done;
  socket.onerror = fail;
});
let nextId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { done, fail } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? fail(new Error(message.error.message)) : done(message.result);
};
const cdp = (method, params = {}) =>
  new Promise((done, fail) => {
    const id = ++nextId;
    pending.set(id, { done, fail });
    socket.send(JSON.stringify({ id, method, params }));
  });
await cdp("Profiler.enable");
await cdp("Profiler.setSamplingInterval", { interval: INTERVAL_US });

/**
 * Samples that landed in the isolate while fn ran, times the sampling interval. workerd samples only
 * while the isolate is executing, so the profile's own time deltas span the waits between requests
 * and would report wall-clock time; the count does not.
 */
async function isolateCpuMs(fn) {
  await cdp("Profiler.start");
  await fn();
  const { profile } = await cdp("Profiler.stop");
  const idle = new Set(profile.nodes.filter((node) => node.callFrame.functionName === "(idle)").map((node) => node.id));
  return (profile.samples.filter((id) => !idle.has(id)).length * INTERVAL_US) / 1000;
}

// Each request comes from its own address, so the per-address rate limit never trips; the limiter is still called.
let caller = 0;
const address = () => `10.${(caller >> 16) & 255}.${(caller >> 8) & 255}.${caller++ & 255}`;
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
const check = (status, body) => {
  if (status !== 200 || body.includes('"isError":true') || body.includes('"error"')) throw new Error(`${status} ${body.slice(0, 300)}`);
};

/** A 2025-era request, as a pair: over HTTP to the local Worker, and straight into the handler under Node. */
const legacy = (method, params) => {
  const body = () => JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: typeof params === "function" ? params() : params });
  return {
    http: async () => {
      const response = await fetch(`${origin}/mcp`, { method: "POST", headers: { ...HEADERS, "cf-connecting-ip": address() }, body: body() });
      check(response.status, await response.text());
    },
    node: async () => {
      const response = await worker.fetch(new Request("http://127.0.0.1/mcp", { method: "POST", headers: { ...HEADERS, host: "127.0.0.1" }, body: body() }), {}, {});
      check(response.status, await response.text());
    },
  };
};

const client = new Client({ name: "precedent-bench", version: "0.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    fetch: (url, init) => fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), "cf-connecting-ip": address() } }),
  }),
);

const QUERIES = [
  "background jobs in postgres instead of redis",
  "webhook retries duplicate delivery idempotency",
  "one customer slows everyone down",
  "when to shard the database",
  "rate limiting made the outage worse",
  "restore from backup took too long",
  "queue backlog database overloaded connections",
  "cache invalidation redis",
];
let q = 0;
const searchArgs = () => ({ query: QUERIES[q++ % QUERIES.length], traffic: q % 6, data: q % 6, team: q % 5 });
const longest = { query: "queue postgres redis webhook retry shard cache backup tenant deploy latency outage ".repeat(3).slice(0, 200), kind: ["system", "decision", "failure"], traffic: 0, data: 0, team: 0, limit: 10 };
const eightIds = ["slack-2017-job-queue#f1", "slack-2017-job-queue#d1", "notion-2021-postgres-sharding#d1", "stackoverflow-2016-architecture", "healthchecks-2025-tarpit-outage#f1", "nylas-2018-webhooks#d1", "tailscale-2021-control-plane-state#d2", "atlassian-2022-site-deletion-restore#f2"];

const scenarios = [
  ["tools/list", legacy("tools/list")],
  ["precedent_search, default", legacy("tools/call", () => ({ name: "precedent_search", arguments: searchArgs() }))],
  ["precedent_search, default, 2026-07-28 client", { http: async () => void (await client.callTool({ name: "precedent_search", arguments: searchArgs() })) }],
  ["precedent_search, 200-character query, all kinds, limit 10", legacy("tools/call", { name: "precedent_search", arguments: longest })],
  ["precedent_get, one record", legacy("tools/call", { name: "precedent_get", arguments: { ids: ["slack-2017-job-queue#f1"] } })],
  ["precedent_get, eight ids", legacy("tools/call", { name: "precedent_get", arguments: { ids: eightIds } })],
  ["precedent_facets", legacy("tools/call", { name: "precedent_facets", arguments: {} })],
  // The floor: a static file never enters the Worker's isolate, so what is left is the local runtime's own cost.
  ["static file /corpus/cards/<id>.json (Worker not invoked)", { http: async () => void (await (await fetch(`${origin}/corpus/cards/slack-2017-job-queue.json`)).arrayBuffer()) }],
];

const repeat = async (request, count) => {
  const latencies = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    await request();
    latencies.push(performance.now() - start);
  }
  return latencies.sort((a, b) => a - b);
};

console.log(`${N} sequential requests per scenario after ${WARMUP} warm-up requests. 2025-era client unless stated. Local emulation: not production numbers.\n`);
console.log("| Request | isolate CPU (ms) | workerd process CPU (ms) | node handler CPU (ms) | latency p50 (ms) | latency p95 (ms) |");
console.log("|---|---|---|---|---|---|");
for (const [label, { http, node }] of scenarios) {
  await repeat(http, WARMUP);
  let latencies;
  const isolate = await isolateCpuMs(async () => (latencies = await repeat(http, N)));
  // Process CPU is read without the profiler running, over enough requests for ps's 10 ms resolution.
  const before = workerdCpuMs();
  await repeat(http, N);
  const processCpu = workerdCpuMs() - before;

  let nodeCpu = "n/a";
  if (node) {
    await repeat(node, WARMUP);
    const start = process.cpuUsage();
    await repeat(node, N);
    const used = process.cpuUsage(start);
    nodeCpu = ((used.user + used.system) / 1000 / N).toFixed(2);
  }
  const at = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))].toFixed(1);
  console.log(`| ${label} | ${(isolate / N).toFixed(2)} | ${(processCpu / N).toFixed(2)} | ${nodeCpu} | ${at(0.5)} | ${at(0.95)} |`);
}

await client.close();
socket.close();
stop();
process.exit(0);
