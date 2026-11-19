// The Worker: a stateless MCP endpoint at /mcp over Streamable HTTP. Read-only, no storage of its own, no
// outbound requests. It is an internal engine with no public route and does no authentication: the website
// Worker checks keys and quotas and forwards MCP requests to it over a service binding. What it serves is
// the compiled index in the CORPUS bucket, re-read at most once a minute; without one, the bundled index.
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { limiterKey } from "./address.ts";
import { hostnames, originHostnames } from "./origins.ts";
import { bounded, OVERRUN } from "./bounded.ts";
import generated from "./generated/corpus.json" with { type: "json" };
import { corpusSource, type CorpusBucket } from "./corpus-source.ts";
import { instructions, SERVER_NAME, SERVER_VERSION, toolset, type Log } from "./tools.ts";
import type { CorpusIndex } from "./types.ts";

interface Env {
  /** The private bucket that holds the compiled index as index.json. Absent in unit tests; the bundled index is served then. */
  CORPUS?: CorpusBucket;
  /** Workers rate limiting binding. Absent in unit tests; the endpoint then serves without a limit. */
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Comma-separated hostnames a request URL may name. Unset: any host is accepted. */
  ALLOWED_HOSTNAMES?: string;
  /** Comma-separated hostnames of browser origins allowed to call the endpoint, beyond localhost and the endpoint's own. */
  ALLOWED_ORIGIN_HOSTNAMES?: string;
}

// A Worker's entry module may export only handlers, so these stay private to it.
const ROUTE = "/mcp";
/** Far more than any call to these tools needs; small enough that parsing it costs nothing. */
const MAX_BODY_BYTES = 16 * 1024;
const WORKER_HEADER = { "x-precedent-worker": "1" };

// One CORS policy for everything this endpoint sends: the handler's answers and this file's refusals
// alike. Any origin may read a response (there are no credentials to protect, and who may use the corpus is
// decided in front of this Worker); which origins may call it at all is the handler's Origin check.
// Retry-After is exposed so that a browser client can read it off a rate-limit refusal.
const CORS = {
  origin: "*",
  methods: "POST, OPTIONS",
  headers: "Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
  exposeHeaders: "Retry-After",
  maxAge: 86400,
};
const CORS_HEADERS = {
  "access-control-allow-origin": CORS.origin,
  "access-control-allow-methods": CORS.methods,
  "access-control-allow-headers": CORS.headers,
  "access-control-expose-headers": CORS.exposeHeaders,
  "access-control-max-age": String(CORS.maxAge),
};

// Methods worth counting by name. Anything else a caller sends is logged as "other", never verbatim.
const KNOWN_METHODS = new Set(["initialize", "server/discover", "ping", "tools/list", "tools/call", "subscriptions/listen", "notifications/initialized", "notifications/cancelled"]);

const log: Log = (entry) => console.log(JSON.stringify(entry));

const corpus = corpusSource({ bundled: generated as unknown as CorpusIndex, log });

// Everything built from an index lives and dies with it: the tool schemas take their enums from the index's
// vocabulary, and a handler closes over the index it serves. Keyed by the index itself, so a request is
// always served by what was built for the index it was given, and the old ones go when the index does.
interface Built {
  register: ReturnType<typeof toolset>;
  // One handler per hostname the endpoint is reached on, because the Origin allowlist depends on it. That
  // is a handful of entries at most; the cap only stops a stray run from growing the map without end.
  handlers: Map<string, ReturnType<typeof createMcpHandler>>;
}
const built = new WeakMap<CorpusIndex, Built>();

async function mcp(env: Env, ctx: ExecutionContext, hostname: string): Promise<ReturnType<typeof createMcpHandler>> {
  const loading = corpus.current(env.CORPUS);
  // A check one request starts is waited on by the others, so it must not end with that request.
  ctx.waitUntil(loading);
  const index = await loading;
  let entry = built.get(index);
  if (!entry) built.set(index, (entry = { register: toolset(index), handlers: new Map() }));
  const { register, handlers } = entry;

  const key = `${hostname}|${env.ALLOWED_HOSTNAMES ?? ""}|${env.ALLOWED_ORIGIN_HOSTNAMES ?? ""}`;
  let handler = handlers.get(key);
  if (handler) return handler;
  const hosts = hostnames(env.ALLOWED_HOSTNAMES);
  handler = createMcpHandler(
    () => {
      const server = new McpServer(
        { name: SERVER_NAME, version: `${SERVER_VERSION}+${index.version}` },
        // The tool list changes only when the index is replaced, which no connection is told about, so
        // list-change notifications are declared off. McpServer would otherwise advertise them, and a
        // subscriptions/listen request would then be honoured with a stream held open and kept alive for as
        // long as the client liked. With nothing to honour, the handler acknowledges an empty subscription
        // and completes at once.
        { instructions: instructions(index), capabilities: { tools: { listChanged: false } } },
      );
      register(server, log);
      return server;
    },
    {
      route: ROUTE,
      corsOptions: CORS,
      allowedHostnames: hosts.length ? hosts : undefined,
      allowedOriginHostnames: originHostnames(hostname, env),
      maxRequestBodySize: MAX_BODY_BYTES,
      onerror: (error) => log({ event: "error", name: error.name }),
    },
  );
  if (handlers.size >= 16) handlers.clear();
  handlers.set(key, handler);
  return handler;
}

function refuse(status: number, code: number, reason: string, message: string, headers: Record<string, string> = {}): Response {
  log({ event: "refused", reason });
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers: { ...CORS_HEADERS, ...WORKER_HEADER, ...headers } });
}

/** The body as text, or null once it exceeds the limit. Stops reading at the limit instead of buffering the rest. */
async function readBounded(request: Request, limit: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
}

/**
 * The handler's answer as a finished response. Whatever the protocol layer returns is read to its end
 * within fixed limits first, so no request can leave a stream open. An answer that overruns is refused
 * for what it did: taking too long and being too large are different faults and are reported as such.
 */
async function finished(answer: Promise<Response>): Promise<Response> {
  const response = await bounded(await answer);
  if (typeof response === "string") return refuse(500, -32603, OVERRUN[response].reason, OVERRUN[response].message);
  const headers = new Headers(response.headers);
  headers.set("x-precedent-worker", "1");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== ROUTE) {
      return new Response(`Not found. The MCP endpoint is POST ${ROUTE}.\n`, {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", ...CORS_HEADERS, ...WORKER_HEADER },
      });
    }
    if (request.method !== "POST") return finished((await mcp(env, ctx, url.hostname))(request, env, ctx));

    // The client address (its /64 for IPv6) is used as the counting key and for nothing else. It is not logged.
    // If the limiter itself fails, serve the request: a broken counter should not take a read-only endpoint down.
    if (env.RATE_LIMITER) {
      const allowed = await env.RATE_LIMITER.limit({ key: limiterKey(request.headers.get("cf-connecting-ip")) }).then(
        (outcome) => outcome.success,
        () => (log({ event: "error", name: "rate_limiter" }), true),
      );
      if (!allowed) return refuse(429, -32000, "rate_limit", "Too many requests from this address; wait a minute and retry.", { "retry-after": "60" });
    }

    const body = await readBounded(request, MAX_BODY_BYTES);
    if (body === null) return refuse(413, -32000, "too_large", `Request body over ${MAX_BODY_BYTES} bytes.`);
    let message: unknown;
    try {
      message = JSON.parse(body);
    } catch {
      return refuse(400, -32700, "bad_json", "The request body is not JSON.");
    }
    if (Array.isArray(message)) return refuse(400, -32600, "batch", "Send one JSON-RPC message per request; batches are not accepted.");

    const method = typeof (message as { method?: unknown } | null)?.method === "string" ? (message as { method: string }).method : "";
    // A tool call logs its own line, with counts, from the tool.
    if (method !== "tools/call") log({ event: "rpc", method: KNOWN_METHODS.has(method) ? method : "other" });

    // The body has been read, so hand the handler a request that carries everything but the body.
    const bodiless = new Request(request.url, { method: "POST", headers: request.headers, signal: request.signal });
    return finished((await mcp(env, ctx, url.hostname)).fetch(bodiless, { parsedBody: message }));
  },
};
