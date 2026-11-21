import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Cite } from "../components/Cite";
import { CopyButton } from "../components/CopyButton";
import { INSTALL } from "../components/Snippet";
import { getMcpExample } from "../corpus/api";
import { PLANS, count, pageHead } from "../site";

export const Route = createFileRoute("/mcp")({
  loader: () => getMcpExample(),
  head: () => pageHead("MCP: Precedent", "Connect a coding agent to Precedent over MCP: three read-only tools that search and fetch records of how real systems were built and how they failed."),
  component: Mcp,
});

function Mcp() {
  const { cited } = Route.useLoaderData();
  const [clientId, setClientId] = useState(INSTALL[0].id);
  const client = INSTALL.find((c) => c.id === clientId)!;
  const tools = [
    [
      "precedent_search",
      "Systems, decisions and failures that match a described problem, grouped by how their scale compares with yours: at your scale, at a different scale, or of unknown scale.",
      'precedent_search({ query: "job queue on postgres", workload: ["job-queue"], traffic: 1, team: 0 })',
    ],
    [
      "precedent_get",
      "Up to eight records or systems in full, each fact with its place in the source and an explicit note where the source is silent.",
      'precedent_get({ ids: ["notion-2021-postgres-sharding#d1", "healthchecks-2025-tarpit-outage"] })',
    ],
    ["precedent_facets", "What the corpus covers: its size and version, the tier definitions, and the workloads, topics, tech tags and footprints in use.", "precedent_facets()"],
  ];
  const calls = [
    'precedent_search({ query: "background jobs rails", workload: ["job-queue"], traffic: 1, team: 0 })',
    `precedent_get({ ids: [${cited.map((row) => `"${row.cite}"`).join(", ")}] })`,
  ].join("\n");
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
              Every request needs a key, sent as a bearer token. A free key allows {count(PLANS.free.calls)} tool calls a month; Pro will allow{" "}
              {count(PLANS.pro.calls)}. Listing the tools and connecting do not count.{" "}
              <Link className="nowrap" to="/pricing">Pricing →</Link>
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
