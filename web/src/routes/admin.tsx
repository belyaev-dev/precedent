import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { getUsage } from "../admin/api";
import { count } from "../site";

export const Route = createFileRoute("/admin")({
  loader: () => getUsage(),
  head: () => ({ meta: [{ title: "Usage: Precedent" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

function Table({ title, note, heads, rows }: { title: string; note?: string; heads: string[]; rows: ReactNode[][] }) {
  return (
    <section className="admin-block">
      <h2 className="sub-title">{title}</h2>
      {note && <p className="muted">{note}</p>}
      {rows.length ? (
        <div className="table-scroll">
          <table className="compact">
            <thead>
              <tr className="label">
                {heads.map((head) => (
                  <th scope="col" key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, at) => (
                <tr key={at}>
                  {row.map((cell, column) => (
                    <td key={column}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nothing yet.</p>
      )}
    </section>
  );
}

function Admin() {
  const { totals, days, people, queries, misses, offScale, clients, keptDays } = Route.useLoaderData();
  const figures = [
    [totals.users, "accounts"],
    [totals.keys, "with a key"],
    [totals.callers, "have made a call"],
    [totals.callersThisWeek, "keys used in 7 days"],
    [totals.callsThisMonth, "calls this month"],
    [totals.wantPro, "waiting for Pro"],
    [totals.emailsToday, "sign-in emails today"],
  ] as const;
  return (
    <main className="page admin">
      <h1 className="page-title" style={{ paddingTop: 56 }}>Usage</h1>
      <p className="lede" style={{ marginTop: 20 }}>
        Accounts, keys and tool calls. Times are UTC. Calls are kept for {keptDays} days. Visitors and referrers are in Cloudflare Web Analytics.
      </p>
      <dl className="admin-figures">
        {figures.map(([value, label]) => (
          <div key={label}>
            <dt className="label">{label}</dt>
            <dd>{count(value)}</dd>
          </div>
        ))}
      </dl>

      <Table
        title="Last 14 days"
        heads={["Day", "New accounts", "Keys in use", "Calls", "Searches", "Found nothing"]}
        rows={days.map((day) => [day.day, day.signups, day.callers, day.calls, day.searches, day.empty])}
      />
      <Table
        title="Searches that found nothing"
        note="Last 30 days, newest first. This is what the corpus is being asked for and does not hold."
        heads={["Search", "Calls", "Keys", "Last"]}
        rows={misses.map((miss) => [miss.search, miss.calls, miss.callers, when(miss.last)])}
      />
      <Table
        title="Searches with nothing at the caller's scale"
        note="Last 30 days. Records matched, but none at the scale the caller gave."
        heads={["Search", "Matched", "Calls", "Keys", "Last"]}
        rows={offScale.map((miss) => [miss.search, miss.matched, miss.calls, miss.callers, when(miss.last)])}
      />
      <Table
        title="Most searched"
        note="Last 7 days, by query text."
        heads={["Query", "Calls", "Keys", "Records matched"]}
        rows={queries.map((query) => [query.query, query.calls, query.callers, query.matched])}
      />
      <Table
        title="Clients"
        note="Last 7 days, by the user agent each call sent."
        heads={["Client", "Calls", "Keys"]}
        rows={clients.map((client) => [client.client, client.calls, client.callers])}
      />
      <Table
        title="Accounts"
        note="Newest first, up to 100."
        heads={["Email", "Joined", "Signed in with", "Key", "Calls this month", "Last call", "Pro"]}
        rows={people.map((person) => [person.email, when(person.joined), person.via ?? "", person.hasKey ? "yes" : "no", person.calls, when(person.lastCall), person.wantsPro ? "asked" : ""])}
      />
    </main>
  );
}
