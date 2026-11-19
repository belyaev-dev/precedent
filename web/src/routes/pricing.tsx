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
        <Plan
          name="Free"
          price="$0"
          lines={[`${count(PLANS.free.calls)} tool calls a month.`, "The whole corpus, over MCP and on the website.", "One API key."]}
          action="Get a key"
        />
        <Plan
          name="Pro"
          price={PLANS.pro.price}
          lines={[`${count(PLANS.pro.calls)} tool calls a month.`, "Everything in Free.", "Not open yet. Sign in and ask to be told when it is."]}
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
            <dt>May I use what I read at work?</dt>
            <dd>
              Yes. Records are there to inform the systems you design, on either plan. The corpus itself is not open: do not republish or resell
              the cards. A few sample cards are public in the <a href={REPO}>repository</a> under CC BY 4.0.
            </dd>
          </div>
          <div>
            <dt>What happens when I reach the limit?</dt>
            <dd>Tool calls are refused until the month resets. Nothing is charged, on either plan.</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
