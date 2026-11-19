import { createFileRoute } from "@tanstack/react-router";
import { handleMcp } from "../../server/mcp";

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: ({ request }) => handleMcp(request),
      // This server never opens a stream, which the protocol says to answer with 405.
      GET: () => new Response(null, { status: 405, headers: { allow: "POST" } }),
    },
  },
});
