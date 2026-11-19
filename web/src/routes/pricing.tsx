import { Link, createFileRoute } from "@tanstack/react-router";
import { Cite } from "../components/Cite";
import { PLANS, REPO, WAITLIST_URL, count } from "../site";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Pricing: Precedent" }] }),
  component: Pricing,
});

function Plan({ name, price, lines, action }: { name: string; price: string; lines: string[]; action: string }) {
  return (
    <section className="plan" aria-label={`${name} plan`}>
      <div className="plan-head">
        <h2>{name}</h2>
        <span>{price}</span>
      </div>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Link className="button" to="/account">{action}</Link>
    </section>
  );
}

function Pricing() {
  return (
    <main className="page">
      <h1 className="display pricing-title">Free to try. Pro for daily use.</h1>
      <div className="plans">
        <Plan name="Free" price="$0" lines={[`${count(PLANS.free.calls)} calls a month.`, `Top ${PLANS.free.searchResults} records per search.`, "The whole catalogue on the website."]} action="Get a key" />
        <Plan
          name="Pro"
          price={PLANS.pro.price}
          lines={[
            `${count(PLANS.pro.calls)} calls a month.`,
            "Every matching record.",
            "Search only the records a person has reviewed.",
            "Not open yet. Sign in and ask to be told when it is.",
          ]}
          action="Join the Pro list"
        />
      </div>
      <p className="waitlist">
        <span className="strong">Private precedent.</span> Your own decision records and postmortems as cards, searched alongside the public corpus.{" "}
        <a className="nowrap" href={WAITLIST_URL}>Join the waitlist.</a>
      </p>

      <section className="questions">
        <h2 className="section-title">Questions</h2>
        <dl>
          <div>
            <dt>How do I cite a record?</dt>
            <dd>
              Use its id, for example <Cite cite="notion-2021-postgres-sharding#d1" />, and add the corpus version if the text must not change.
            </dd>
          </div>
          <div>
            <dt>What licence is the corpus under?</dt>
            <dd>
              CC BY-NC 4.0. Using records to design your own systems is fine on every plan, at work too. Republishing or selling the cards needs a
              commercial licence; <a href={`${REPO}/issues/new?title=Commercial+licence`}>ask for one</a>.
            </dd>
          </div>
          <div>
            <dt>What happens when I reach the limit?</dt>
            <dd>Searches stop until the month resets. Nothing is charged unless you upgrade.</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
