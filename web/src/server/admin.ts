// What the operator sees: who signed up, who uses their key, and what was searched for. Read from D1 for the
// /admin page and for the daily digest email. Only the accounts named in ADMIN_GITHUB_IDS may read it.
import { CALL_LOG_DAYS, SITE_URL } from "../site";
import { env } from "./env";

const adminIds = () => (env.ADMIN_GITHUB_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
const marks = (values: unknown[]) => values.map(() => "?").join(", ");
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
// Better Auth writes dates as text or as milliseconds, depending on the driver.
const JOINED = `case typeof(x."createdAt") when 'integer' then strftime('%Y-%m-%dT%H:%M:%SZ', x."createdAt" / 1000, 'unixepoch') else x."createdAt" end`;

export async function isAdmin(userId: string) {
  const ids = adminIds();
  if (!ids.length) return false;
  const found = await env.DB.prepare(`select 1 from "account" where "userId" = ? and "providerId" = 'github' and "accountId" in (${marks(ids)})`)
    .bind(userId, ...ids)
    .first();
  return found !== null;
}

async function adminEmails() {
  const ids = adminIds();
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(`select x."email" from "user" x join "account" a on a."userId" = x."id" where a."providerId" = 'github' and a."accountId" in (${marks(ids)})`)
    .bind(...ids)
    .all<{ email: string }>();
  return results.map((row) => row.email);
}

const rows = async <Row>(sql: string, ...values: unknown[]) => (await env.DB.prepare(sql).bind(...values).all<Row>()).results;

export async function usageReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [totals, signups, calls, people, queries, misses, offScale, clients] = await Promise.all([
    env.DB.prepare(
      `select (select count(*) from "user") as "users",
              (select count(*) from "apiKey") as "keys",
              (select count(distinct "userId") from "usage" where "calls" > 0) as "callers",
              (select count(*) from "accountPlan" where "wantsProAt" is not null) as "wantPro",
              (select coalesce(sum("calls"), 0) from "usage" where "month" = ?1) as "callsThisMonth",
              (select count(distinct "userId") from "call" where "at" >= ?2) as "callersThisWeek",
              (select coalesce(sum("sent"), 0) from "emailDay" where "day" = ?3) as "emailsToday"`,
    )
      .bind(today.slice(0, 7), daysAgo(7), today)
      .first<{ users: number; keys: number; callers: number; wantPro: number; callsThisMonth: number; callersThisWeek: number; emailsToday: number }>(),
    rows<{ day: string; signups: number }>(`select substr(${JOINED}, 1, 10) as "day", count(*) as "signups" from "user" x group by 1 having "day" >= ? order by 1 desc`, daysAgo(14).slice(0, 10)),
    rows<{ day: string; callers: number; calls: number; searches: number; empty: number }>(
      `select substr("at", 1, 10) as "day", count(distinct "userId") as "callers", count(*) as "calls",
              sum("tool" = 'precedent_search') as "searches", sum("tool" = 'precedent_search' and "matched" = 0) as "empty"
       from "call" where "at" >= ? group by 1 order by 1 desc`,
      daysAgo(14).slice(0, 10),
    ),
    rows<{ email: string; joined: string; via: string | null; hasKey: number; calls: number; lastCall: string | null; wantsPro: number }>(
      `select x."email", ${JOINED} as "joined",
              (select group_concat("providerId", ', ') from "account" where "userId" = x."id") as "via",
              exists (select 1 from "apiKey" where "userId" = x."id") as "hasKey",
              coalesce((select "calls" from "usage" where "userId" = x."id" and "month" = ?), 0) as "calls",
              (select max("at") from "call" where "userId" = x."id") as "lastCall",
              exists (select 1 from "accountPlan" where "userId" = x."id" and "wantsProAt" is not null) as "wantsPro"
       from "user" x order by "joined" desc limit 100`,
      today.slice(0, 7),
    ),
    rows<{ query: string; calls: number; callers: number; matched: number }>(
      `select lower(json_extract("asked", '$.query')) as "query", count(*) as "calls", count(distinct "userId") as "callers", round(avg("matched")) as "matched"
       from "call" where "tool" = 'precedent_search' and "at" >= ? and json_valid("asked") and json_extract("asked", '$.query') is not null
       group by 1 order by "calls" desc, "query" limit 40`,
      daysAgo(7),
    ),
    rows<{ asked: string; calls: number; callers: number; last: string }>(
      `select "asked", count(*) as "calls", count(distinct "userId") as "callers", max("at") as "last"
       from "call" where "tool" = 'precedent_search' and "matched" = 0 and "at" >= ? group by 1 order by "last" desc limit 60`,
      daysAgo(30),
    ),
    rows<{ asked: string; calls: number; callers: number; matched: number; last: string }>(
      `select "asked", count(*) as "calls", count(distinct "userId") as "callers", max("matched") as "matched", max("at") as "last"
       from "call" where "tool" = 'precedent_search' and "matched" > 0 and "atScale" = 0 and "at" >= ? group by 1 order by "last" desc limit 40`,
      daysAgo(30),
    ),
    rows<{ client: string; calls: number; callers: number }>(
      `select coalesce("client", 'not sent') as "client", count(*) as "calls", count(distinct "userId") as "callers" from "call" where "at" >= ? group by 1 order by "calls" desc limit 20`,
      daysAgo(7),
    ),
  ]);
  const byDay = new Map(calls.map((day) => [day.day, day]));
  const joinedOn = new Map(signups.map((day) => [day.day, day.signups]));
  const days = Array.from({ length: 14 }, (_, back) => {
    const day = daysAgo(back).slice(0, 10);
    return { day, signups: joinedOn.get(day) ?? 0, callers: byDay.get(day)?.callers ?? 0, calls: byDay.get(day)?.calls ?? 0, searches: byDay.get(day)?.searches ?? 0, empty: byDay.get(day)?.empty ?? 0 };
  });
  return { totals: totals!, days, people, queries, misses, offScale, clients, keptDays: CALL_LOG_DAYS };
}

export type UsageReport = Awaited<ReturnType<typeof usageReport>>;

/** A search as its caller put it: the words, then whichever filters were given. */
export function describeSearch(asked: string) {
  try {
    const { query, limit: _limit, ...filters } = JSON.parse(asked) as Record<string, unknown>;
    const given = Object.entries(filters).map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`);
    return [typeof query === "string" && query ? `"${query}"` : "(no words)", ...given].join("  ·  ");
  } catch {
    return asked;
  }
}

/** Run once a day: deletes what is past its keeping time, and emails the operators yesterday's numbers. */
export async function daily() {
  await env.DB.batch([
    env.DB.prepare(`delete from "call" where "at" < ?`).bind(daysAgo(CALL_LOG_DAYS)),
    env.DB.prepare(`delete from "emailSender" where "day" < ?`).bind(daysAgo(2).slice(0, 10)),
  ]);
  const to = await adminEmails();
  if (!env.EMAIL || !to.length) return;
  const { totals, days, people, misses } = await usageReport();
  const yesterday = days[1];
  const joined = people.filter((person) => person.joined?.slice(0, 10) === yesterday.day);
  const missed = misses.filter((miss) => miss.last.slice(0, 10) === yesterday.day);
  const text = [
    `Precedent on ${yesterday.day} (UTC)`,
    "",
    `New accounts: ${yesterday.signups}`,
    ...joined.map((person) => `  ${person.email}${person.hasKey ? "" : " (no key yet)"}`),
    `Keys in use: ${yesterday.callers}`,
    `Tool calls: ${yesterday.calls}, of which searches: ${yesterday.searches}`,
    `Searches that found nothing: ${yesterday.empty}`,
    ...missed.slice(0, 20).map((miss) => `  ${describeSearch(miss.asked)}`),
    "",
    `In total: ${totals.users} accounts, ${totals.keys} keys, ${totals.callers} that have made a call, ${totals.wantPro} waiting for Pro.`,
    `${totals.callsThisMonth} calls this month.`,
    "",
    `${SITE_URL}/admin`,
  ].join("\n");
  for (const email of to) {
    await env.EMAIL.send({ from: { email: env.EMAIL_FROM, name: "Precedent" }, to: email, subject: `Precedent, ${yesterday.day}: ${yesterday.signups} new, ${yesterday.calls} calls`, text });
  }
}
