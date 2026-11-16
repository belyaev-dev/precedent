import { describe, expect, it } from "vitest";
import { bounded } from "../../src/bounded.ts";

const encoder = new TextEncoder();

describe("bounding a response", () => {
  it("returns a body that ends as a finished body, with status and headers kept", async () => {
    const chunks = ["event: message\n", "data: {}\n\n"];
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next) controller.enqueue(encoder.encode(next));
        else controller.close();
      },
    });
    const result = await bounded(new Response(stream, { status: 207, headers: { "content-type": "text/event-stream", "x-kept": "yes" } }));
    expect(result!.status).toBe(207);
    expect(result!.headers.get("x-kept")).toBe("yes");
    expect(await result!.text()).toBe("event: message\ndata: {}\n\n");
  });

  it("passes a response with no body through", async () => {
    const empty = new Response(null, { status: 202 });
    expect(await bounded(empty)).toBe(empty);
  });

  it("cancels and gives up on a stream that is held open", async () => {
    let cancelled = false;
    // An acknowledgement, then nothing: what a subscription stream looks like between keepalives.
    const held = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": subscribed\n\n"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const started = Date.now();
    expect(await bounded(new Response(held), { ms: 60, bytes: 1024 })).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(cancelled).toBe(true);
  });

  it("cancels and gives up on a stream that keeps sending", async () => {
    let cancelled = false;
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(encoder.encode(": keepalive\n\n".repeat(50)));
      },
      cancel() {
        cancelled = true;
      },
    });
    expect(await bounded(new Response(endless), { ms: 5000, bytes: 16 * 1024 })).toBeNull();
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(40);
  });
});
