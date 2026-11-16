// The Worker: a stateless MCP endpoint at /mcp over Streamable HTTP. Read-only, no auth, no storage,
// no outbound requests. Everything it serves was compiled from cards/*.yaml at build time.
// Static files under /corpus/ are served by the platform and never reach this code.
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import generated from "./generated/corpus.json" with { type: "json" };
import { instructions, SERVER_NAME, SERVER_VERSION, toolset, type Log } from "./tools.ts";
import type { CorpusIndex } from "./types.ts";

interface Env {
  /** Workers rate limiting binding. Absent in unit tests; the endpoint then serves without a limit. */
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Comma-separated hostnames this endpoint answers on, for a custom domain. Unset: the handler's defaults apply. */
  ALLOWED_HOSTNAMES?: string;
  /** Comma-separated hostnames of browser origins allowed to call the endpoint, beyond localhost and the endpoint's own. */
  ALLOWED_ORIGIN_HOSTNAMES?: string;
}

const index = generated as unknown as CorpusIndex;
const register = toolset(index);

// A Worker's entry module may export only handlers, so these stay private to it.
const ROUTE = "/mcp";
/** Far more than any call to these tools needs; small enough that parsing it costs nothing. */
const MAX_BODY_BYTES = 16 * 1024;
const WORKER_HEADER = { "x-precedent-worker": "1" };

// Methods worth counting by name. Anything else a caller sends is logged as "other", never verbatim.
const KNOWN_METHODS = new Set(["initialize", "server/discover", "ping", "tools/list", "tools/call", "notifications/initialized", "notifications/cancelled"]);

const log: Log = (entry) => console.log(JSON.stringify(entry));

const list = (value: string | undefined): string[] | undefined => {
  const items = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
};

let handler: ReturnType<typeof createMcpHandler> | undefined;
function mcp(env: Env): ReturnType<typeof createMcpHandler> {
  return (handler ??= createMcpHandler(
    (context) => {
      const origin = context.requestInfo ? new URL(context.requestInfo.url).origin : "";
      const server = new McpServer({ name: SERVER_NAME, version: `${SERVER_VERSION}+${index.version}` }, { instructions: instructions(index, origin) });
      register(server, log);
      return server;
    },
    {
      route: ROUTE,
      allowedHostnames: list(env.ALLOWED_HOSTNAMES),
      allowedOriginHostnames: list(env.ALLOWED_ORIGIN_HOSTNAMES),
      maxRequestBodySize: MAX_BODY_BYTES,
      onerror: (error) => log({ event: "error", name: error.name }),
    },
  ));
}

function refuse(status: number, code: number, reason: string, message: string, origin: string, headers: Record<string, string> = {}): Response {
  log({ event: "refused", reason });
  const pointer = `The whole corpus is a static file with no request limits: ${origin}/corpus/corpus.json`;
  return Response.json({ jsonrpc: "2.0", error: { code, message: `${message} ${pointer}` }, id: null }, { status, headers: { ...WORKER_HEADER, ...headers } });
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

function withWorkerHeader(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-precedent-worker", "1");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== ROUTE) {
      return new Response(`Not found. The MCP endpoint is POST ${ROUTE}. The corpus as a static file is /corpus/corpus.json.\n`, {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", ...WORKER_HEADER },
      });
    }
    if (request.method !== "POST") return withWorkerHeader(await mcp(env)(request, env, ctx));

    // The client address is used as the counting key and for nothing else. It is not logged.
    // If the limiter itself fails, serve the request: a broken counter should not take a read-only endpoint down.
    if (env.RATE_LIMITER) {
      const allowed = await env.RATE_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" }).then(
        (outcome) => outcome.success,
        () => (log({ event: "error", name: "rate_limiter" }), true),
      );
      if (!allowed) return refuse(429, -32000, "rate_limit", "Too many requests from this address; wait a minute and retry.", url.origin, { "retry-after": "60" });
    }

    const body = await readBounded(request, MAX_BODY_BYTES);
    if (body === null) return refuse(413, -32000, "too_large", `Request body over ${MAX_BODY_BYTES} bytes.`, url.origin);
    let message: unknown;
    try {
      message = JSON.parse(body);
    } catch {
      return refuse(400, -32700, "bad_json", "The request body is not JSON.", url.origin);
    }
    if (Array.isArray(message)) return refuse(400, -32600, "batch", "Send one JSON-RPC message per request; batches are not accepted.", url.origin);

    const method = typeof (message as { method?: unknown } | null)?.method === "string" ? (message as { method: string }).method : "";
    // A tool call logs its own line, with counts, from the tool.
    if (method !== "tools/call") log({ event: "rpc", method: KNOWN_METHODS.has(method) ? method : "other" });

    // The body has been read, so hand the handler a request that carries everything but the body.
    const bodiless = new Request(request.url, { method: "POST", headers: request.headers, signal: request.signal });
    return withWorkerHeader(await mcp(env).fetch(bodiless, { parsedBody: message }));
  },
};
