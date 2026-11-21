import { Link, createFileRoute } from "@tanstack/react-router";
import { CALL_LOG_DAYS, CONTACT_URL, pageHead } from "../site";

export const Route = createFileRoute("/privacy")({
  head: () => pageHead("Privacy: Precedent", "What Precedent keeps about visitors, accounts and tool calls, why, and for how long."),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="page">
      <h1 className="page-title" style={{ paddingTop: 56 }}>Privacy</h1>
      <div className="prose">
        <p className="lede">What this site and the MCP server keep, why, and for how long. Last changed 22 November 2026.</p>

        <h2>Reading the site</h2>
        <p>
          You can read the site without an account. Visits are counted with Cloudflare Web Analytics, which sets no cookies and does not follow
          you to other sites; it reports pages, referrers, countries and browser types in aggregate. Cloudflare, which hosts the site, also keeps
          a technical log of requests (address, URL, user agent) for a few days. The fonts are loaded from Google Fonts, so your browser asks
          Google for them. There is no advertising and no other tracking.
        </p>

        <h2>An account</h2>
        <p>When you sign in, the following is stored:</p>
        <ul>
          <li>Your email address. If you sign in with GitHub, also your GitHub name, picture and account number.</li>
          <li>Your sessions, each with the address and user agent it was opened from. A session is held in one cookie, the only one this site sets.</li>
          <li>A hash of your API key and its last four characters. The key itself is shown once and not stored.</li>
          <li>Whether you asked to be told when Pro opens.</li>
        </ul>
        <p>
          To stop one address being flooded with sign-in links, a hash of each address a link was sent to, and the client address that asked,
          are counted for two days.
        </p>

        <h2>Tool calls</h2>
        <p>Each tool call made with your key is recorded against your account:</p>
        <ul>
          <li>the time and the tool;</li>
          <li>what was asked: a search's words and filters, or the ids fetched;</li>
          <li>how many records matched and how many were returned;</li>
          <li>the user agent your client sent.</li>
        </ul>
        <p>
          These are kept for {CALL_LOG_DAYS} days and then deleted. A count of your calls per month is kept for as long as the account exists,
          to apply the plan's limit. Your client address is used to limit request rates and is not stored with a call. The answers sent to you
          are not stored.
        </p>
        <p>Do not put secrets or personal data into a search. A search needs the shape of a system, not its contents.</p>

        <h2>What it is used for</h2>
        <p>
          To run the service and apply its limits, to see which clients and tools are in use, and to learn what people look for that the
          corpus does not hold, which decides what is written next. Your email is used to sign you in and, if you asked, to tell you when Pro
          opens. Nothing is sold, shared for advertising, or used to train a model.
        </p>

        <h2>Who else handles it</h2>
        <ul>
          <li>Cloudflare hosts the site, the database and the analytics, and sends the sign-in emails.</li>
          <li>GitHub, if you choose to sign in with it.</li>
          <li>Google, for the fonts.</li>
        </ul>

        <h2>Deleting it</h2>
        <p>
          <Link to="/account">Your account page</Link> has a link that deletes the account. Your sessions, key, usage counts and recorded calls
          are deleted with it, at once. For anything else, including a copy of what is held about you,{" "}
          <a href={CONTACT_URL}>open an issue</a> without including private details and you will be contacted.
        </p>
      </div>
    </main>
  );
}
