import { Link, createFileRoute } from "@tanstack/react-router";
import { CONTACT_URL, PLANS, REPO, count, pageHead } from "../site";

export const Route = createFileRoute("/terms")({
  head: () => pageHead("Terms: Precedent", "The terms for using the Precedent website, corpus and MCP server."),
  component: Terms,
});

function Terms() {
  return (
    <main className="page">
      <h1 className="page-title" style={{ paddingTop: 56 }}>Terms</h1>
      <div className="prose">
        <p className="lede">The terms for using this website, the corpus and the MCP server. Last changed 22 November 2026.</p>

        <h2>What you are getting</h2>
        <p>
          Precedent is a pilot. Its records summarise public sources. Each was drafted by a model and checked against its source by a second
          model and by script; a record says whether a person has reviewed it, and most have not been. Treat a record as a lead and read the
          source before relying on it. Nothing here is professional advice, and the service is provided as it is, with no warranty that a
          record is accurate, complete or current, or that the service will be available.
        </p>

        <h2>Accounts and keys</h2>
        <ul>
          <li>An account is for one person, and so is its API key. Keep the key private; rotate it on your account page if it leaks.</li>
          <li>
            The free plan allows {count(PLANS.free.calls)} tool calls a month. Requests are also rate limited. Calls over a limit are refused,
            not charged.
          </li>
          <li>Do not create accounts to get around a limit. An account or key used that way, or to disrupt the service, may be closed.</li>
        </ul>

        <h2>Using the corpus</h2>
        <ul>
          <li>You may use what you read, at work or otherwise, to design and explain your own systems, and cite records by their ids.</li>
          <li>
            You may not republish or resell the corpus or a substantial part of it, copy it in bulk, or use it to build a competing collection
            or to train a model.
          </li>
          <li>
            The sample cards in the <a href={REPO}>repository</a> are the exception: they are under CC BY 4.0, and the code there is under the
            MIT licence.
          </li>
        </ul>

        <h2>Sources</h2>
        <p>
          The sources a card summarises belong to their publishers. If a card misstates its source, or you are the publisher and want it
          removed, <a href={CONTACT_URL}>open an issue</a>. Removal requests from publishers are honoured without argument.
        </p>

        <h2>Liability</h2>
        <p>
          To the extent the law allows, the operator is not liable for loss arising from use of the service or from reliance on a record.
          Design decisions made with it are yours.
        </p>

        <h2>Changes</h2>
        <p>
          The service, its limits and these terms may change; the date above says when the terms last did. What is kept about you is in the{" "}
          <Link to="/privacy">privacy notice</Link>.
        </p>
      </div>
    </main>
  );
}
