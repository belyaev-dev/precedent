// One request, one finite answer. The handler's own responses are small and complete within
// milliseconds; this is the guarantee that holds even if a protocol feature would stream.
import { MAX_RESPONSE_BYTES, MAX_RESPONSE_MS } from "./limits.ts";

/** Why a response was not passed on: it did not end in time, or it grew past the size limit. */
export type Overrun = "late" | "too_large";

/**
 * Reads a response to its end and returns it as a finished body, so that nothing downstream is a
 * stream that can be held open. When the body does not end in time or grows past the size limit,
 * the source is cancelled and the reason returned instead.
 */
export async function bounded(response: Response, limits = { ms: MAX_RESPONSE_MS, bytes: MAX_RESPONSE_BYTES }): Promise<Response | Overrun> {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => (timer = setTimeout(() => resolve("late"), limits.ms)));
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), late]);
      if (next !== "late" && next.done) break;
      const overrun: Overrun | null = next === "late" ? "late" : (size += next.value.byteLength) > limits.bytes ? "too_large" : null;
      if (overrun) {
        await reader.cancel().catch(() => {});
        return overrun;
      }
      chunks.push((next as { value: Uint8Array }).value);
    }
  } finally {
    clearTimeout(timer);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** What to tell the caller, and what to count in the log, for each kind of overrun. The two are different faults and are reported as such. */
export const OVERRUN: Record<Overrun, { reason: string; message: string }> = {
  late: { reason: "stream_held", message: `The answer did not finish within ${MAX_RESPONSE_MS / 1000} seconds. This server answers each request once and does not hold streams open.` },
  too_large: {
    reason: "response_too_large",
    message: `The answer was larger than the ${MAX_RESPONSE_BYTES / 1024} KiB this endpoint sends in one response, so it was not sent. Ask for less in one call: fewer ids, or a lower limit.`,
  },
};
