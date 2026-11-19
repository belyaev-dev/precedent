// API keys, plans and the monthly call count, all in D1.
import { PLANS, type PlanName } from "../site";
import { env } from "./env";

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
const month = () => new Date().toISOString().slice(0, 7);

// Makes the user's key, replacing any earlier one. The key itself is returned once and never stored.
export async function issueKey(userId: string) {
  const key = `prc_${hex(crypto.getRandomValues(new Uint8Array(24)))}`;
  await env.DB.prepare(
    `insert into "apiKey" ("userId", "hash", "lastFour", "createdAt") values (?1, ?2, ?3, ?4)
     on conflict ("userId") do update set "hash" = ?2, "lastFour" = ?3, "createdAt" = ?4`,
  )
    .bind(userId, await sha256(key), key.slice(-4), new Date().toISOString())
    .run();
  return key;
}

export async function accountOf(userId: string) {
  const row = await env.DB.prepare(
    `select k."lastFour", k."createdAt", coalesce(p."plan", 'free') as "plan", p."wantsProAt", coalesce(u."calls", 0) as "calls"
     from "user" x
     left join "apiKey" k on k."userId" = x."id"
     left join "accountPlan" p on p."userId" = x."id"
     left join "usage" u on u."userId" = x."id" and u."month" = ?2
     where x."id" = ?1`,
  )
    .bind(userId, month())
    .first<{ lastFour: string | null; createdAt: string | null; plan: PlanName; wantsProAt: string | null; calls: number }>();
  if (!row) throw new Error(`no user ${userId}`);
  const reset = new Date();
  reset.setUTCMonth(reset.getUTCMonth() + 1, 1);
  return {
    key: row.lastFour ? { lastFour: row.lastFour, createdAt: row.createdAt! } : null,
    plan: row.plan,
    wantsPro: row.wantsProAt !== null,
    calls: row.calls,
    limit: PLANS[row.plan].calls,
    resetsOn: reset.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }),
  };
}

export async function askForPro(userId: string) {
  await env.DB.prepare(
    `insert into "accountPlan" ("userId", "wantsProAt") values (?1, ?2)
     on conflict ("userId") do update set "wantsProAt" = coalesce("wantsProAt", ?2)`,
  )
    .bind(userId, new Date().toISOString())
    .run();
}

export async function ownerOfKey(key: string) {
  return env.DB.prepare(
    `select k."userId", coalesce(p."plan", 'free') as "plan" from "apiKey" k
     left join "accountPlan" p on p."userId" = k."userId" where k."hash" = ?`,
  )
    .bind(await sha256(key))
    .first<{ userId: string; plan: PlanName }>();
}

// Counts one call against this month's allowance. Returns false, counting nothing, when the allowance is used up.
export async function spendCall(userId: string, plan: PlanName) {
  const counted = await env.DB.prepare(
    `insert into "usage" ("userId", "month", "calls") values (?1, ?2, 1)
     on conflict ("userId", "month") do update set "calls" = "calls" + 1 where "calls" < ?3 returning "calls"`,
  )
    .bind(userId, month(), PLANS[plan].calls)
    .first();
  return counted !== null;
}
