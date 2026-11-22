// The Worker's entry: TanStack Start answers requests, and a daily timer runs the housekeeping and the digest.
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { daily } from "./server/admin";

const entry = createServerEntry({
  fetch(request, opts) {
    return handler.fetch(request, opts);
  },
});

export default {
  ...entry,
  scheduled(_event: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(daily().catch((error) => console.error(JSON.stringify({ event: "error", name: "daily", message: String(error) }))));
  },
};
