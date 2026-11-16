// The size limits on what one request may be answered with, in one place so that they agree.

const encoder = new TextEncoder();

/**
 * The most a tool's text may take up in the response, measured as it is sent: UTF-8 bytes of the text
 * as a JSON string. About fifty times a typical record. precedent_get fills this budget id by id and
 * says which ids it left out; no tool result is ever larger.
 */
export const MAX_TOOL_RESULT_BYTES = 128 * 1024;

/**
 * The most any response may hold. A tool result at its limit, plus the JSON-RPC envelope, the
 * event-stream framing and room for the largest fixed answer (tools/list), fits with space to spare,
 * so a complete, permitted answer can never be mistaken for a runaway one.
 */
export const MAX_RESPONSE_BYTES = MAX_TOOL_RESULT_BYTES + 32 * 1024;

/** Longest any response may take to finish. The handlers answer in milliseconds. */
export const MAX_RESPONSE_MS = 3000;

/** Bytes a piece of text occupies inside a JSON-RPC response: escapes and multi-byte characters counted. */
export const wireBytes = (text: string): number => encoder.encode(JSON.stringify(text)).byteLength - 2;
