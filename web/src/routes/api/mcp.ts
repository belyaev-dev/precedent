import { createFileRoute } from "@tanstack/react-router";
import { handleMcp, preflight } from "../../server/mcp";

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: ({ request }) => handleMcp(request),
      OPTIONS: () => preflight(),
      // The server never opens a stream, which the protocol says to answer with 405.
      GET: () => new Response(null, { status: 405, headers: { allow: "POST, OPTIONS" } }),
    },
  },
});
