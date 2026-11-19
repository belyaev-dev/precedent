// The MCP server: JSON-RPC over HTTP POST, one JSON response per request, no session state.
import { cards, cardsPerWorkload, isReviewed, search, version } from "../corpus/store.server";
import { PLANS, SITE_URL, count, type PlanName } from "../site";
import { ownerOfKey, spendCall } from "./keys";

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS =
  "Precedent holds records of what real teams chose for a system, what forced the choice and how things failed. " +
  "Search it before proposing a backend design, then cite each record you rely on by its id (card-id#record-id). " +
  "A null field means the source did not say; do not fill it in. A record with no traffic tier has unknown scale, not small scale.";

const TOOLS = [
  {
    name: "search_records",
    description:
      "Find decision and failure records that match a described system. Returns one line per record, best match first. " +
      "Give traffic_tier (0 to 5: under 10, 100, 1,000, 10,000, 100,000 requests/s at peak, or more) to have each result marked against your scale. " +
      "Each result says whether a person has reviewed it (review: human) or only a model has (review: model).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The system or problem, in plain words." },
        kind: { type: "string", enum: ["decision", "failure"] },
        workload: { type: "string", description: "A workload name from list_workloads." },
        topic: { type: "string", description: "A topic tag such as datastore-partitioning or caching." },
        tech: { type: "string", description: "A technology tag such as postgres or redis." },
        traffic_tier: { type: "integer", minimum: 0, maximum: 5 },
        human_reviewed_only: { type: "boolean", description: "Return only records from cards a person has read against the source. Pro plan." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_card",
    description: "One card in full: the system, its figures as the source states them, the architecture and every record with its source locators.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "A card id, such as notion-2021-postgres-sharding." } }, required: ["id"] },
  },
  {
    name: "get_record",
    description: "One record by its citation id, with the system it belongs to.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "A record id, such as notion-2021-postgres-sharding#d1." } }, required: ["id"] },
  },
  { name: "list_workloads", description: "The workload names in the corpus, with the number of cards under each.", inputSchema: { type: "object", properties: {} } },
];

class ToolError extends Error {}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const one = (value: unknown) => (text(value) ? [text(value)] : []);

function callTool(name: string, args: Record<string, unknown>, plan: PlanName) {
  const resultCap = PLANS[plan].searchResults;
  if (name === "list_workloads") return { corpus_version: version, workloads: cardsPerWorkload() };

  if (name === "get_card" || name === "get_record") {
    const [cardId, recordId] = text(args.id).split("#");
    const card = cards.find((c) => c.id === cardId);
    if (!card) throw new ToolError(`No card "${cardId}" in the corpus. Use search_records to find ids.`);
    if (name === "get_card") return { corpus_version: version, card };
    const record = card.records.find((r) => r.id === recordId);
    if (!record) throw new ToolError(`Card "${cardId}" has no record "${recordId ?? ""}". Its records are: ${card.records.map((r) => r.id).join(", ")}.`);
    const { records: _, components: __, ...system } = card;
    return { corpus_version: version, card: system, record };
  }

  if (name === "search_records") {
    if (!text(args.query)) throw new ToolError("search_records needs a query.");
    const reviewedOnly = args.human_reviewed_only === true;
    if (reviewedOnly && !PLANS[plan].reviewedOnlySearch) throw new ToolError(`human_reviewed_only is part of the Pro plan. See ${SITE_URL}/pricing.`);
    const callerTier = typeof args.traffic_tier === "number" ? args.traffic_tier : null;
    const matched = search({ q: text(args.query), kind: one(args.kind), workload: one(args.workload), setup: [], topic: one(args.topic), tech: one(args.tech), reviewedOnly });
    const shown = matched.slice(0, resultCap);
    return {
      corpus_version: version,
      total_matches: matched.length,
      returned: shown.length,
      ...(shown.length < matched.length ? { note: `Your plan returns the top ${resultCap} records per search. See ${SITE_URL}/pricing.` } : {}),
      records: shown.map(({ card, record }) => {
        const tier = card.scale.traffic?.tier ?? null;
        return {
          id: `${card.id}#${record.id}`,
          kind: record.kind,
          title: record.title,
          org: card.org,
          as_of: card.as_of,
          setup: card.footprint?.shape ?? null,
          traffic_tier: tier,
          ...(callerTier === null ? {} : { scale: tier === null ? "unknown" : tier <= callerTier ? "at_or_below_yours" : "larger_than_yours" }),
          review: isReviewed(card) ? "human" : "model",
          topics: record.topics,
        };
      }),
    };
  }

  throw new ToolError(`Unknown tool "${name}".`);
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const rpcError = (id: unknown, code: number, message: string, status = 200) => json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);

export async function handleMcp(request: Request) {
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const owner = key ? await ownerOfKey(key) : null;
  if (!owner) {
    return json({ error: `A Precedent API key is required. Get one at ${SITE_URL}/account.` }, 401, { "www-authenticate": 'Bearer realm="precedent"' });
  }

  let message: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, "The request body is not JSON.", 400);
  }
  if (Array.isArray(message) || message?.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(null, -32600, "Send one JSON-RPC 2.0 request per POST.", 400);
  }
  const { id, method, params = {} } = message;
  // A notification carries no id and gets no reply.
  if (id === undefined) return new Response(null, { status: 202 });
  const result = (value: unknown) => json({ jsonrpc: "2.0", id, result: value });

  if (method === "initialize") {
    const asked = text(params.protocolVersion);
    return result({
      protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
      capabilities: { tools: {} },
      serverInfo: { name: "precedent", version },
      instructions: INSTRUCTIONS,
    });
  }
  if (method === "ping") return result({});
  if (method === "tools/list") return result({ tools: TOOLS });
  if (method === "tools/call") {
    const failed = (reason: string) => result({ content: [{ type: "text", text: reason }], isError: true });
    if (!(await spendCall(owner.userId, owner.plan))) {
      return failed(`This key has used its ${count(PLANS[owner.plan].calls)} calls for the month. The count resets on the 1st (UTC). See ${SITE_URL}/pricing.`);
    }
    try {
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      return result({ content: [{ type: "text", text: JSON.stringify(callTool(text(params.name), args, owner.plan)) }] });
    } catch (error) {
      if (error instanceof ToolError) return failed(error.message);
      throw error;
    }
  }
  return rpcError(id, -32601, `Method "${method}" is not supported.`);
}
