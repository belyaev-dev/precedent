// The public MCP address: checks the caller's API key and monthly allowance, then hands the request
// to the MCP engine (the Worker in mcp/), which is reachable only from here.
import { PLANS, SITE_URL, count } from "../site";
import { env } from "./env";
import { ownerOfKey, spendCall } from "./keys";

// The engine reads this host off the request; the service binding delivers it without leaving Cloudflare.
const ENGINE_URL = `${SITE_URL}/mcp`;
// The engine refuses anything larger, so there is no reason to read more than this.
const MAX_BODY_BYTES = 16 * 1024;
const FORWARDED = ["content-type", "accept", "mcp-protocol-version", "mcp-method", "mcp-name", "mcp-session-id", "cf-connecting-ip"];
// A browser client must be allowed to send the key, which the engine's own policy does not list.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
  "access-control-expose-headers": "Retry-After",
  "access-control-max-age": "86400",
};

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS, ...headers } });

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function handleMcp(request: Request) {
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const owner = key ? await ownerOfKey(key) : null;
  if (!owner) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: `A Precedent API key is required. Get one at ${SITE_URL}/account.` } }, 401, {
      "www-authenticate": 'Bearer realm="precedent"',
    });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: `Request body over ${MAX_BODY_BYTES} bytes.` } }, 413);

  // Only tool calls count against the allowance. Anything unreadable is passed on for the engine to refuse.
  let message: { id?: unknown; method?: unknown } | null = null;
  try {
    message = JSON.parse(body);
  } catch {}
  if (message?.method === "tools/call" && !(await spendCall(owner.userId, owner.plan))) {
    const text = `This key has used its ${count(PLANS[owner.plan].calls)} calls for the month. The count resets on the 1st (UTC). See ${SITE_URL}/pricing.`;
    return json({ jsonrpc: "2.0", id: message.id ?? null, result: { content: [{ type: "text", text }], isError: true } }, 200);
  }

  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The engine checks the Host header against the one host it accepts; a service binding does not always supply it.
  headers.set("host", new URL(ENGINE_URL).host);
  const answer = await env.MCP.fetch(new Request(ENGINE_URL, { method: "POST", headers, body }));
  const answered = new Headers(answer.headers);
  for (const [name, value] of Object.entries(CORS)) answered.set(name, value);
  return new Response(answer.body, { status: answer.status, headers: answered });
}
