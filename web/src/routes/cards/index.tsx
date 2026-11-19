import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Cite } from "../../components/Cite";
import { getCorpusVersion, searchRecords } from "../../corpus/api";
import { KIND, SETUP, sentence } from "../../site";

interface CatalogueSearch {
  q?: string;
  workload?: string[];
  kind?: string[];
  setup?: string[];
}
type Filter = "workload" | "kind" | "setup";

const list = (value: unknown) => {
  const items = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string" && v !== "");
  return items.length ? items : undefined;
};

// Upper bound of each traffic tier, in requests per second at peak (README, Scale).
const TRAFFIC_UNDER = ["10", "100", "1,000", "10,000", "100,000"];
const scaleTag = (tier: number) => (tier < TRAFFIC_UNDER.length ? `peak under ${TRAFFIC_UNDER[tier]} requests/s` : "peak of 100,000 requests/s or more");

export const Route = createFileRoute("/cards/")({
  validateSearch: (search: Record<string, unknown>): CatalogueSearch => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    workload: list(search.workload),
    kind: list(search.kind),
    setup: list(search.setup),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({ ...(await searchRecords({ data: deps })), version: await getCorpusVersion() }),
  head: () => ({ meta: [{ title: "Catalogue: Precedent" }] }),
  component: Catalogue,
});

function Catalogue() {
  const { rows, matched, cards, records, workloads, version } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filtered = matched < records;
  const hidden = matched - rows.length;

  const chip = (filter: Filter, value: string, label = value) => {
    const picked = search[filter] ?? [];
    const on = picked.includes(value);
    const next = on ? picked.filter((v) => v !== value) : [...picked, value];
    return (
      <Link key={value} to="." search={(prev) => ({ ...prev, [filter]: next.length ? next : undefined })} aria-current={on ? "true" : undefined} resetScroll={false}>
        {label}
      </Link>
    );
  };

  return (
    <main className="page">
      <div className="catalogue-head">
        <h1 className="page-title">Catalogue</h1>
        <dl className="stats">
          {[
            ["Cards", cards],
            ["Records", records],
            ["Workloads", workloads.length],
            ["Corpus version", version],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="label">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <form
        className="search"
        onSubmit={(event) => {
          event.preventDefault();
          const q = new FormData(event.currentTarget).get("q");
          navigate({ search: (prev) => ({ ...prev, q: typeof q === "string" && q.trim() ? q.trim() : undefined }), resetScroll: false });
        }}
      >
        <input name="q" type="text" defaultValue={search.q ?? ""} aria-label="Describe the system you are building" placeholder="Describe the system you are building" />
        <button type="submit">Search</button>
      </form>

      <div className="filters">
        <div>
          <span className="label">Workload</span>
          <div className="chips">{workloads.map((w) => chip("workload", w))}</div>
        </div>
        <div>
          <span className="label">Kind</span>
          <div className="chips">{Object.entries(KIND).map(([value, label]) => chip("kind", value, label))}</div>
        </div>
        <div>
          <span className="label">Setup</span>
          <div className="chips">{Object.entries(SETUP).map(([value, label]) => chip("setup", value, label))}</div>
        </div>
      </div>

      <section className="records" aria-label="Records">
        <p className="muted">
          {filtered
            ? `${matched} of ${records} records match${hidden > 0 ? `; the first ${rows.length} are shown` : ""}.`
            : hidden > 0
              ? `The ${rows.length} most recent of ${records} records.`
              : `All ${records} records, most recent first.`}
        </p>
        {rows.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr className="label">
                  <th scope="col" style={{ width: 104 }}>Kind</th>
                  <th scope="col">Record</th>
                  <th scope="col" style={{ width: 190 }}>Organisation</th>
                  <th scope="col" style={{ width: 72 }}>Year</th>
                  <th scope="col" style={{ width: 136 }}>Setup</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.cite}>
                    <td>{KIND[row.kind]}</td>
                    <td>
                      <p>{row.title}</p>
                      <p className="record-meta">
                        <Cite cite={row.cite} />
                        {row.trafficTier !== null && <span className="scale-tag">{scaleTag(row.trafficTier)}</span>}
                        {row.reviewed && <span className="scale-tag">human-reviewed</span>}
                      </p>
                    </td>
                    <td>{row.org}</td>
                    <td>{row.year}</td>
                    <td>{row.shape && sentence(SETUP[row.shape])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hidden > 0 && (
          <div className="locked">
            <svg aria-hidden="true" width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="#111111" strokeWidth="1.2">
              <rect x="1.6" y="7" width="10.8" height="8" />
              <path d="M4 7V4.5a3 3 0 0 1 6 0V7" />
            </svg>
            <p>
              {hidden} more records. <Link to="/account">Sign in</Link> to see all {matched}.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
