// Which browser origins may call the endpoint.
import { localhostAllowedOrigins } from "@modelcontextprotocol/server";

/** A comma-separated setting as lower-case hostnames. */
export const hostnames = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

/**
 * The hostnames a browser may call from: the endpoint's own (the host of this request, and every
 * hostname the endpoint is configured to answer on), local development origins, and whatever
 * ALLOWED_ORIGIN_HOSTNAMES adds. The handler's built-in list covers the endpoint's own hostname only
 * on workers.dev and is replaced, not extended, by a configured one; this list is the whole of it, so a
 * page served from a custom domain can call the endpoint on that domain, and extra origins add to the
 * defaults. Requests that send no Origin (every non-browser client) are not affected.
 */
export function originHostnames(hostname: string, settings: { ALLOWED_HOSTNAMES?: string; ALLOWED_ORIGIN_HOSTNAMES?: string }): string[] {
  return [...new Set([hostname.toLowerCase(), ...hostnames(settings.ALLOWED_HOSTNAMES), ...localhostAllowedOrigins(), ...hostnames(settings.ALLOWED_ORIGIN_HOSTNAMES)])];
}
