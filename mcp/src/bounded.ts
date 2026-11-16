// One request, one finite answer. The handler's own responses are small and complete within
// milliseconds; this is the guarantee that holds even if a protocol feature would stream.

/** Longest any response may take to finish, and the most it may hold. Both are far above what a real answer needs. */
export const MAX_RESPONSE_MS = 3000;
export const MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * Reads a response to its end and returns it as a finished body, so that nothing downstream is a
 * stream that can be held open. Returns null, after cancelling the source, when the body does not
 * end in time or grows past the size limit.
 */
export async function bounded(response: Response, limits = { ms: MAX_RESPONSE_MS, bytes: MAX_RESPONSE_BYTES }): Promise<Response | null> {
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
      if (next === "late" || (size += next.value.byteLength) > limits.bytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(next.value);
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
