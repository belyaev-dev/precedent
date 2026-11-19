import { Link, createFileRoute } from "@tanstack/react-router";
import { Cite } from "../components/Cite";
import { FactLine, Field, RecordFields } from "../components/RecordFields";
import { INSTALL, Snippet } from "../components/Snippet";
import { getLanding } from "../corpus/api";
import { KIND, REPO, plural } from "../site";

export const Route = createFileRoute("/")({
  loader: () => getLanding(),
  component: Landing,
});

// Figures from bench/RESULTS.md, run 3.
const FIGURES = [
  ["4.3", "instead of 6.4", "components in a small-system design"],
  ["6.7", "instead of 11.7", "components in a large-system design"],
  ["42", "of 60", "design pairs where the judge preferred the one written with Precedent"],
];

const SMALL_SYSTEMS = [
  ["SourceHut, 2020. A code forge on 10 hand-provisioned servers, no Kubernetes or Docker.", "sourcehut-2020-simple-infrastructure#d1"],
  ["Stack Overflow, 2016. Every Q&A site from one application on two SQL Server clusters, 209 million requests in a day.", "stackoverflow-2016-architecture#d1"],
  ["A Rails client, 2023. Redis and Sidekiq removed for a job queue on the existing Postgres database.", "tosbourn-2023-client-rails-jobs#d1"],
];

type Box = [label: string, left: number, top: number, width: number, height: number, className?: string];

const MEMORY_BOXES: Box[] = [
  ["API gateway", 60, 0, 180, 48],
  ["Service 1", 0, 88, 92, 48],
  ["Service 2", 104, 88, 92, 48],
  ["Service 3", 208, 88, 92, 48],
  ["Service 4", 0, 184, 92, 48],
  ["Service 5", 104, 184, 92, 48],
  ["Cache", 208, 184, 92, 48],
  ["Message bus", 0, 280, 196, 48],
  ["Search cluster", 208, 280, 92, 48],
];
const MEMORY_LINES =
  "M150 48V88M46 68H254M46 68V88M254 68V88M98 68V168M46 168H150M46 168V184M150 168V184M46 136V152M150 136V152M254 136V184M46 152H254M202 152V304M196 304H208M46 232V280M150 232V280M254 232V280M196 208H208";
const PRECEDENT_BOXES: Box[] = [
  ["Application", 50, 0, 200, 56],
  ["Postgres database", 20, 112, 260, 216, "holds"],
  ["Job table", 70, 200, 160, 64],
];

function Diagram({ label, lines, boxes }: { label: string; lines: string; boxes: Box[] }) {
  return (
    <div className="diagram" role="img" aria-label={label}>
      <svg aria-hidden="true" width="300" height="328" viewBox="0 0 300 328">
        <path d={lines} />
      </svg>
      {boxes.map(([name, left, top, width, height, className]) => (
        <div key={name} className={className} style={{ left, top, width, height }}>
          {name}
        </div>
      ))}
    </div>
  );
}

function Landing() {
  const { cards, reviewedCards, records, decisions, groups, orgs, featured } = Route.useLoaderData();
  return (
    <main>
      <div className="hero">
        <div className="hero-copy">
          <h1 className="display">Your agent designs from memory. Give it evidence.</h1>
          <p className="lede">
            Ask a coding agent for a job queue and it draws a gateway, five services, a message bus, a cache and a search cluster. Precedent gives it
            records of what real teams ran instead, and why.
          </p>
          <div className="hero-actions">
            <Link className="button on-black" to="/mcp">Connect the MCP</Link>
            <Link className="button outline" to="/cards">Browse the catalogue</Link>
          </div>
        </div>
        <div className="hero-diagrams">
          <div className="diagram-column">
            <p>Designed from memory</p>
            <Diagram
              label="Nine boxes joined by many lines: an API gateway, five services, a message bus, a cache and a search cluster"
              lines={MEMORY_LINES}
              boxes={MEMORY_BOXES}
            />
          </div>
          <div className="diagram-column chosen">
            <p>Designed from precedent</p>
            <Diagram
              label="Two boxes joined by one line: the application and its Postgres database, with the job table inside the database"
              lines="M150 56V112"
              boxes={PRECEDENT_BOXES}
            />
            <div className="diagram-cites">
              <Cite cite="tosbourn-2023-client-rails-jobs#d1" />
              <Cite cite="37signals-2023-solid-queue#d1" />
            </div>
          </div>
        </div>
      </div>

      <section className="band first">
        <h2 className="section-title">Fewer parts, with reasons</h2>
        <div className="figures">
          {FIGURES.map(([value, versus, label]) => (
            <div key={label}>
              <p className="figure">
                {value} <span>{versus}</span>
              </p>
              <p>{label}</p>
            </div>
          ))}
        </div>
        <p className="muted measure" style={{ marginTop: 32 }}>
          Ten design briefs at two sizes, three runs each, judged by a second model. Method and limits are in the{" "}
          <a href={`${REPO}/blob/main/bench/RESULTS.md`}>repository</a>.
        </p>
      </section>

      <section className="band">
        <div className="band-head">
          <h2 className="section-title">One decision, as the team reported it</h2>
          <p className="lede">
            A record keeps what was chosen, what was turned down, what forced the choice and what it cost. Every line points to the place in the source
            where it is stated.
          </p>
        </div>
        <article className="featured">
          <p className="label">{KIND[featured.record.kind]}</p>
          <h3 className="record-title">{featured.record.title}</h3>
          <p className="summary">Notion, 2021. One Postgres database split into 480 logical shards across 32 databases.</p>
          <p className="cite-line">
            <Cite cite={featured.cite} />
          </p>
          <RecordFields record={featured.record} brief>
            <Field label="Source">
              <FactLine
                text={<a href={featured.source.url}>{featured.source.title}</a>}
                locator={`${featured.source.publisher}, published ${featured.source.published}`}
              />
            </Field>
          </RecordFields>
        </article>
      </section>

      <section className="band">
        <div className="band-head">
          <h2 className="section-title">Mostly small systems, on purpose</h2>
          <p className="lede">
            Large companies publish the most, so agents copy them. Precedent collects what small teams ran: one server, one database, a queue in
            Postgres.
          </p>
        </div>
        <div className="examples">
          {SMALL_SYSTEMS.map(([text, cite]) => (
            <div key={cite}>
              <p>{text}</p>
              <span>
                <Cite cite={cite} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <h2 className="section-title">
            {cards} systems, {records} records
          </h2>
          <p className="lede">
            {plural(decisions, "decision")} and {plural(records - decisions, "failure")} across {groups.length} kinds of workload.
          </p>
        </div>
        <div className="workloads">
          {groups.map((group) => (
            <div className="workload" key={group.name}>
              <div className="workload-head">
                <span>{group.name}</span>
                <span>{plural(group.cards, "card")}</span>
              </div>
              <div className="squares">
                {group.rows.map((row) => (
                  <Link
                    key={row.cite}
                    className={row.kind === "failure" ? "failure" : undefined}
                    to="/cards/$cardId"
                    params={{ cardId: row.cardId }}
                    hash={row.recordId}
                    title={row.title}
                    aria-label={`${KIND[row.kind]}: ${row.title}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="legend">
          <span>
            <i aria-hidden="true" />
            Decision
          </span>
          <span>
            <i className="failure" aria-hidden="true" />
            Failure
          </span>
        </div>
        <p className="muted orgs-label">Drawn from public engineering writing by</p>
        <p className="orgs">{orgs.join(", ")}.</p>
      </section>

      <section className="band">
        <h2 className="section-title">How records are checked</h2>
        <ol className="checks">
          <li>Every number in a record appears in its source.</li>
          <li>Every fact carries the section or passage it came from.</li>
          <li>Where the source says nothing, the record says nothing.</li>
        </ol>
        <p className="muted measure">
          Records are extracted by a model and checked by script and a second model.{" "}
          {reviewedCards === 0
            ? "Human review has not started yet."
            : `A person has read ${reviewedCards} of the ${cards} cards against their source; those are marked human-reviewed.`}
        </p>
      </section>

      <section className="band">
        <div className="band-head">
          <h2 className="section-title">Add it to your agent</h2>
        </div>
        <Snippet label={INSTALL[0].label} code={INSTALL[0].code} />
        <div className="link-row">
          <Link to="/mcp">Other clients →</Link>
          <Link to="/account">Get a key →</Link>
        </div>
      </section>
    </main>
  );
}
