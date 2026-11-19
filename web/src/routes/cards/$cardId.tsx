import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CopyButton } from "../../components/CopyButton";
import { RecordFields } from "../../components/RecordFields";
import { getCard, getCorpusVersion } from "../../corpus/api";
import { KIND, SETUP, sentence } from "../../site";

const EVIDENCE = { production: "Reported from production", incident: "Incident report", experiment: "Experiment" };

export const Route = createFileRoute("/cards/$cardId")({
  loader: async ({ params }) => ({ card: await getCard({ data: params.cardId }), version: await getCorpusVersion() }),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: `${loaderData.card.title}: Precedent` }, { name: "description", content: loaderData.card.architecture.text }] : [],
  }),
  component: CardPage,
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

function CardPage() {
  const { card, version } = Route.useLoaderData();
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
