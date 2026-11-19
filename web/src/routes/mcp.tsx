import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Cite } from "../components/Cite";
import { CopyButton } from "../components/CopyButton";
import { INSTALL } from "../components/Snippet";
import { getMcpExample } from "../corpus/api";
import { PLANS, count } from "../site";

export const Route = createFileRoute("/mcp")({
  loader: () => getMcpExample(),
  head: () => ({ meta: [{ title: "MCP: Precedent" }] }),
  component: Mcp,
});

const BRIEF = "job queue, under 100 req/s, team of 5";

function Mcp() {
  const { workloads, cited } = Route.useLoaderData();
  const [clientId, setClientId] = useState(INSTALL[0].id);
  const client = INSTALL.find((c) => c.id === clientId)!;
  const tools = [
    ["search_records", "Decision and failure records that match a described system.", `search_records({ query: "${BRIEF}" })`],
    ["get_card", "One card in full: the system, its figures as stated, the architecture summary and every record with its source locators.", 'get_card({ id: "notion-2021-postgres-sharding" })'],
    ["get_record", "One record by its citation id, with the system it belongs to.", 'get_record({ id: "healthchecks-2025-tarpit-outage#f1" })'],
    ["list_workloads", `The ${workloads} workload names, with the number of cards under each.`, "list_workloads()"],
  ];
  const calls = [`search_records({ query: "${BRIEF}" })`, `get_card({ id: "${cited[0].cardId}" })`, `get_record({ id: "${cited[2].cite}" })`].join("\n");
  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

  return (
    <>
      <div className="mcp-hero on-black">
        <div>
          <h1 className="page-title">MCP</h1>
          <p className="lede">
            Precedent is one MCP server. Add it once and your agent can search the corpus while it designs, then cite each record it used by its id.
          </p>
          <h2 className="sub-title" id="install">Install</h2>
          <p>
            Set <span className="mono">PRECEDENT_KEY</span> to the key from your <Link to="/account">account</Link>, then pick your client.
          </p>
          <div className="install">
            <div className="tabs" role="tablist" aria-label="Client">
              {INSTALL.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={c.id === clientId} onClick={() => setClientId(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="snippet-head">
              <span>{client.where}</span>
              <CopyButton className="copy on-black" text={client.code} />
            </div>
            <pre>{client.code}</pre>
          </div>
        </div>
      </div>

      <div className="mcp-body">
        <nav className="on-this-page" aria-label="On this page">
          <span className="label">On this page</span>
          <a href="#install">Install</a>
          <a href="#tools">Tool reference</a>
          <a href="#example">Worked example</a>
          <a href="#keys">Keys and limits</a>
        </nav>
        <main>
          <section>
            <h2 className="sub-title" id="tools">Tool reference</h2>
            <div className="table-scroll" style={{ marginTop: 20 }}>
              <table>
                <thead>
                  <tr className="label">
                    <th scope="col">Tool</th>
                    <th scope="col">Returns</th>
                    <th scope="col">Example call</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map(([name, returns, call]) => (
                    <tr key={name}>
                      <td className="mono nowrap">{name}</td>
                      <td>{returns}</td>
                      <td className="locator">{call}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="block">
            <h2 className="sub-title" id="example">Worked example</h2>
            <div className="steps">
              <div>
                <span className="label">Brief</span>
                <div>
                  <p className="lede">Design the background job system for our Rails app. Under 100 requests a second. We are a team of 5.</p>
                </div>
              </div>
              <div>
                <span className="label">Calls</span>
                <div>
                  <pre className="dark">{calls}</pre>
                </div>
              </div>
              <div>
                <span className="label">Cited in the design</span>
                <div>
                  <ul>
                    {cited.map((row) => (
                      <li key={row.cite}>
                        <span>{row.kind === "failure" ? `A failure to design around: ${lower(row.title)}` : row.title}.</span>
                        <Cite cite={row.cite} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="block">
            <h2 className="sub-title" id="keys">Keys and limits</h2>
            <p>
              Every call needs a key. A free key allows {count(PLANS.free.calls)} calls a month and returns the top {PLANS.free.searchResults} records per
              search. Pro allows {count(PLANS.pro.calls)} calls a month, returns every matching record and can search only the records a person has reviewed.{" "}
              <Link className="nowrap" to="/pricing">Pricing →</Link>
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
