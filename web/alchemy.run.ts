// Everything Precedent runs on Cloudflare: the website and the MCP engine (two Workers), the accounts database,
// the bucket holding the compiled corpus, sign-in email and the precedents.dev domain.
// `alchemy dev` runs it locally; `alchemy deploy --stage prod` publishes it.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

const DOMAIN = "precedents.dev";
const MAIL_DOMAIN = `mail.${DOMAIN}`;
const DEV_PORT = 4173;

export const Database = Cloudflare.D1.Database("Database", { migrations: "./migrations" });
export const Email = Cloudflare.Email.SendEmail("Email");
// The private repository's workflow uploads index.json and cards.json here by this name, so the name is fixed.
export const Corpus = Cloudflare.R2.Bucket("Corpus", { name: "precedent-corpus" });

// A GitHub OAuth app's credentials, read from the environment or .env. Left empty, the GitHub button stays hidden.
const optionalSecret = (name: string) => Config.Redacted(name).pipe(Config.withDefault(Redacted.make("")));

export default Alchemy.Stack(
  "Precedent",
  // Local development keeps its state on disk, so it needs no Cloudflare login. Deploys keep theirs in the account.
  { providers: Cloudflare.providers(), state: process.env.PRECEDENT_LOCAL_STATE ? Alchemy.localState() : Cloudflare.state() },
  Effect.gen(function* () {
    const live = (yield* Alchemy.Stage) === "prod";
    if (live) {
      const zone = Cloudflare.Zone.Zone.lookup({ name: DOMAIN });
      yield* Cloudflare.Email.SendingSubdomain("Mail", { zoneId: zone.zoneId, name: MAIL_DOMAIN });
    }
    const authSecret = yield* Alchemy.Random("AuthSecret");

    // The search and the MCP tools. It has no address of its own: only the website's Worker can call it,
    // after checking the caller's key. The website addresses it as precedents.dev, which is the one host it accepts.
    const engine = yield* Cloudflare.Worker("Engine", {
      main: "../mcp/src/worker.ts",
      workersDev: false,
      compatibility: { date: "2026-11-01", flags: ["nodejs_compat"] },
      env: { CORPUS: Corpus, ALLOWED_HOSTNAMES: DOMAIN },
    });

    const website = yield* Cloudflare.Website.Vite("Website", {
      domain: live ? { name: DOMAIN } : undefined,
      dev: { port: DEV_PORT },
      env: {
        DB: Database,
        CORPUS: Corpus,
        MCP: engine,
        EMAIL: Email,
        EMAIL_FROM: `signin@${MAIL_DOMAIN}`,
        SITE_URL: live ? `https://${DOMAIN}` : `http://localhost:${DEV_PORT}`,
        BETTER_AUTH_SECRET: authSecret.text,
        GITHUB_CLIENT_ID: optionalSecret("GITHUB_CLIENT_ID"),
        GITHUB_CLIENT_SECRET: optionalSecret("GITHUB_CLIENT_SECRET"),
      },
    });
    return { url: website.url };
  }),
);
