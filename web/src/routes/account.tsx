import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { createKey, getAccount, requestPro } from "../account/api";
import { authClient } from "../auth-client";
import { CopyButton } from "../components/CopyButton";
import { PLANS, count } from "../site";

export const Route = createFileRoute("/account")({
  loader: () => getAccount(),
  head: () => ({ meta: [{ title: "Account: Precedent" }] }),
  component: AccountPage,
});

type Account = Awaited<ReturnType<typeof getAccount>>;

function AccountPage() {
  const account = Route.useLoaderData();
  return (
    <main className="page">
      <div className="account">{account.signedIn ? <SignedIn account={account} /> : <SignIn methods={account.methods} />}</div>
    </main>
  );
}

function SignIn({ methods }: { methods: Extract<Account, { signedIn: false }>["methods"] }) {
  const [sentTo, setSentTo] = useState<string>();
  const [problem, setProblem] = useState<string>();

  const sendLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/account" });
    setProblem(error ? (error.message ?? "The link could not be sent.") : undefined);
    if (!error) setSentTo(email);
  };

  return (
    <>
      <div className="account-head">
        <h1 className="page-title">Sign in</h1>
      </div>
      <p className="lede" style={{ marginTop: 20 }}>
        A key is free and allows {count(PLANS.free.calls)} calls a month. Signing in also opens the full catalogue.
      </p>

      {methods.github && (
        <section>
          <button className="button" type="button" onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/account" })}>
            Continue with GitHub
          </button>
        </section>
      )}

      {methods.email && (
        <section>
          <label className="label" htmlFor="email">Email</label>
          <form className="key-field" onSubmit={sendLink}>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
            <button type="submit">Email me a link</button>
          </form>
          {sentTo && <p style={{ margin: "12px 0 0 24px" }}>Check {sentTo} for the link. It works once and expires in five minutes.</p>}
          {problem && <p role="alert" style={{ margin: "12px 0 0 24px" }}>{problem}</p>}
        </section>
      )}

      {!methods.github && !methods.email && (
        <section>
          <p>Sign-in is not switched on for this deployment yet.</p>
        </section>
      )}
    </>
  );
}

function SignedIn({ account }: { account: Extract<Account, { signedIn: true }> }) {
  const router = useRouter();
  const [newKey, setNewKey] = useState<string>();
  const used = Math.min(100, (account.calls / account.limit) * 100);

  const makeKey = async () => {
    if (account.key && !window.confirm("Rotating makes a new key and stops the current one working. Continue?")) return;
    setNewKey(await createKey());
    router.invalidate();
  };
  const signOut = async () => {
    await authClient.signOut();
    router.invalidate();
  };
  const askForPro = async () => {
    await requestPro();
    router.invalidate();
  };

  return (
    <>
      <div className="account-head">
        <h1 className="page-title">Account</h1>
        <p>
          {account.email} <button className="link" type="button" onClick={signOut}>Sign out</button>
        </p>
      </div>

      <section>
        <label className="label" htmlFor="api-key">API key</label>
        {newKey ? (
          <>
            <div className="key-field">
              <input id="api-key" type="text" readOnly value={newKey} />
              <CopyButton className="" text={newKey} />
            </div>
            <p style={{ margin: "12px 0 0 24px" }}>Copy it now. It is shown once and cannot be read again.</p>
          </>
        ) : account.key ? (
          <div className="key-field">
            <input id="api-key" type="text" readOnly value={`prc_${"•".repeat(20)}${account.key.lastFour}`} />
          </div>
        ) : (
          <div className="key-field">
            <input id="api-key" type="text" readOnly value="" placeholder="No key yet" />
            <button type="button" onClick={makeKey}>Create key</button>
          </div>
        )}
        <div className="key-links">
          <Link to="/mcp">Install steps →</Link>
          {account.key && <button className="link" type="button" onClick={makeKey}>Rotate key →</button>}
        </div>
      </section>

      <section>
        <h2 className="label">Usage this month</h2>
        <div className="usage-bar" role="img" aria-label={`${count(account.calls)} of ${count(account.limit)} calls used`}>
          <div style={{ width: `${used}%` }} />
        </div>
        <p>
          <span className="mono">
            {count(account.calls)} of {count(account.limit)}
          </span>{" "}
          calls. The count resets on {account.resetsOn}.
        </p>
      </section>

      <section>
        <h2 className="label">Plan</h2>
        <div className="plan-line">
          <span className="plan-name">{account.plan === "pro" ? "Pro" : "Free"}</span>
          {account.plan === "pro" ? (
            <p>{count(PLANS.pro.calls)} calls a month, every matching record and search limited to human-reviewed records.</p>
          ) : (
            <p>
              {count(PLANS.free.calls)} calls a month, the top {PLANS.free.searchResults} records per search and the latest corpus version. Pro will be{" "}
              {PLANS.pro.price}.{" "}
              {account.wantsPro ? (
                "You are on the list; we will email you when it opens."
              ) : (
                <button className="link nowrap" type="button" onClick={askForPro}>Tell me when Pro opens →</button>
              )}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
