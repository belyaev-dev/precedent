import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CopyButton } from "../../components/CopyButton";
import { RecordFields } from "../../components/RecordFields";
import { getCard, getCorpusVersion } from "../../corpus/api";
import { KIND, SETUP, sentence } from "../../site";

const EVIDENCE = { production: "Reported from production", incident: "Incident report", experiment: "Experiment" };

export const Route = createFileRoute("/cards/$cardId")({
  loader: async ({ params }) => ({ found: await getCard({ data: params.cardId }), version: await getCorpusVersion() }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { found } = loaderData;
    const title = found.locked ? found.outline.title : found.card.title;
    return { meta: [{ title: `${title}: Precedent` }, ...(found.locked ? [] : [{ name: "description", content: found.card.architecture.text }])] };
  },
  component: CardRoute,
});

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Table({ heads, rows }: { heads: string[]; rows: ReactNode[][] }) {
  return (
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
          {rows.map((cells, i) => (
            <tr key={i}>{cells}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Found = Awaited<ReturnType<typeof getCard>>;

function CardRoute() {
  const { found, version } = Route.useLoaderData();
  return found.locked ? <Outline outline={found.outline} /> : <CardPage card={found.card} version={version} />;
}

// What a visitor who is not signed in sees of a card outside the public samples.
function Outline({ outline }: { outline: Extract<Found, { locked: true }>["outline"] }) {
  return (
    <main className="page">
      <div className="card-page">
        <p className="crumbs">
          <Link to="/cards">Catalogue</Link> / {outline.id}
        </p>
        <h1 className="card-title">{outline.title}</h1>
        <p className="lede">
          {[outline.org, outline.as_of?.slice(0, 4)].filter(Boolean).join(", ")}. {sentence(outline.system)}.
        </p>

        <dl className="meta">
          <Meta label="Organisation">{outline.org}</Meta>
          <Meta label="Evidence">{EVIDENCE[outline.evidence]}</Meta>
          <Meta label="Source">
            <a href={outline.source.url}>{outline.source.title}</a>
            <p className="locator">
              {outline.source.publisher}, published {outline.source.published}
              {outline.source.published_note && ` (${outline.source.published_note})`}
            </p>
          </Meta>
        </dl>

        <section className="block">
          <h2 className="section-title">Records</h2>
          {outline.records.map((record) => (
            <article className="record" id={record.recordId} key={record.recordId}>
              <p className="record-kind">
                <span className="label">{KIND[record.kind]}</span>
                <a href={`#${record.recordId}`}>#{record.recordId}</a>
              </p>
              <h3 className="record-title">{record.title}</h3>
            </article>
          ))}
          <div className="locked">
            <svg aria-hidden="true" width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="#111111" strokeWidth="1.2">
              <rect x="1.6" y="7" width="10.8" height="8" />
              <path d="M4 7V4.5a3 3 0 0 1 6 0V7" />
            </svg>
            <p>
              <Link to="/account">Sign in</Link> to read what was chosen, what was rejected and what it cost, each with its place in the source. An
              account is free.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function CardPage({ card, version }: { card: Extract<Found, { locked: false }>["card"]; version: string }) {
  const pending = /^pending/i.test(card.review.reviewed_by);
  return (
    <main className="page">
      <div className="card-page">
        <p className="crumbs">
          <Link to="/cards">Catalogue</Link> / {card.id}
        </p>
        <h1 className="card-title">{card.title}</h1>
        <p className="lede">
          {[card.org, card.as_of?.slice(0, 4)].filter(Boolean).join(", ")}. {sentence(card.system)}.
        </p>
        {card.status === "disputed" && (
          <p className="notice">
            <span className="strong">Disputed.</span> {card.status_note}
          </p>
        )}
        {card.later_update && (
          <p className="notice">
            <span className="strong">Since changed.</span> {card.later_update.text}
            <span className="locator"> {card.later_update.locator}</span>
          </p>
        )}

        <dl className="meta">
          <Meta label="Organisation">{card.org}</Meta>
          <Meta label="Evidence">{EVIDENCE[card.evidence]}</Meta>
          <Meta label="System">{card.system}</Meta>
          {card.footprint && (
            <Meta label="Setup">
              {sentence(SETUP[card.footprint.shape])}
              <p className="locator">{card.footprint.locator}</p>
            </Meta>
          )}
          {card.as_of && <Meta label="As of">{card.as_of}</Meta>}
          <Meta label="Source">
            <a href={card.source.url}>{card.source.title}</a>
            <p className="locator">
              {card.source.publisher}, published {card.source.published}
              {card.source.published_note && ` (${card.source.published_note})`}
            </p>
          </Meta>
        </dl>

        <section className="block">
          <h2 className="sub-title">Architecture</h2>
          <p className="lede">{card.architecture.text}</p>
          <p className="locator">{card.architecture.locator}</p>
        </section>

        {card.components && card.components.length > 0 && (
          <section className="block">
            <h2 className="sub-title">Components</h2>
            <Table
              heads={["Component", "Role", "Where"]}
              rows={card.components.map((c) => [<td key="name">{c.name}</td>, <td key="role">{c.role}</td>, <td key="where" className="locator">{c.locator}</td>])}
            />
          </section>
        )}

        {card.scale.metrics.length > 0 && (
          <section className="block">
            <h2 className="sub-title">Figures, as the source states them</h2>
            <Table
              heads={["Figure", "As stated", "Note", "Where"]}
              rows={card.scale.metrics.map((m) => [
                <td key="name">{sentence(m.name)}</td>,
                <td key="value" className="mono nowrap">
                  {typeof m.value === "number" ? m.value.toLocaleString("en-GB") : m.value} {m.unit}
                </td>,
                <td key="note">{m.qualifier && sentence(m.qualifier)}</td>,
                <td key="where" className="locator">{m.locator}</td>,
              ])}
            />
          </section>
        )}

        <section className="block">
          <h2 className="section-title">Records</h2>
          {card.records.map((record) => {
            const cite = `${card.id}#${record.id}`;
            return (
              <article className="record" id={record.id} key={record.id}>
                <p className="record-kind">
                  <span className="label">{KIND[record.kind]}</span>
                  <a href={`#${record.id}`}>#{record.id}</a>
                </p>
                <h3 className="record-title">{record.title}</h3>
                <div className="citation">
                  <span>
                    <span className="id">{cite}</span> <span className="muted">at corpus version {version}</span>
                  </span>
                  <CopyButton label="Copy citation" text={`${cite} at corpus version ${version}`} />
                </div>
                <RecordFields record={record} />
              </article>
            );
          })}
        </section>

        <section className="block">
          <h2 className="sub-title">Review</h2>
          <dl className="meta narrow">
            <Meta label="Extracted by">
              <span className="mono">{card.review.extracted_by}</span>
            </Meta>
            <Meta label="Human review">
              {pending ? `Not started. Status recorded on ${card.review.reviewed_at}.` : `${card.review.reviewed_by}, on ${card.review.reviewed_at}.`}
            </Meta>
          </dl>
        </section>
      </div>
    </main>
  );
}
