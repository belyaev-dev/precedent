// The Worker's bindings, as declared in alchemy.run.ts.
import * as cf from "cloudflare:workers";

export interface Env {
  DB: D1Database;
  // The private bucket holding the compiled corpus. Absent in a checkout without it; the sample cards are served then.
  CORPUS?: R2Bucket;
  // The MCP engine in mcp/, which has no public address of its own.
  MCP: Fetcher;
  // Absent on accounts without Cloudflare Email Service; sign-in by email is then switched off.
  EMAIL?: SendEmail;
  EMAIL_FROM: string;
  SITE_URL: string;
  BETTER_AUTH_SECRET: string;
  // Absent until a GitHub OAuth app is configured; the GitHub button is then hidden.
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  // Counts requests to /api/mcp per client address. Absent where no limiter is bound; the endpoint then serves without one.
  LIMITER?: RateLimit;
  // Comma-separated GitHub account ids of the people who may open /admin and who are sent the daily digest.
  ADMIN_GITHUB_IDS?: string;
}

// TanStack Start's dev server cannot read `cf.env` while modules load, so each property is read when it is used.
export const env = new Proxy({} as Env, {
  get: (_, name) => (cf.env as unknown as Env)[name as keyof Env],
});
