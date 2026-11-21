// Everything Precedent runs on Cloudflare: the website and the MCP engine (two Workers), the accounts database,
// the bucket holding the compiled corpus, sign-in email and the precedents.dev domain.
// `alchemy dev` runs it locally; `alchemy deploy --stage prod` publishes it.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as GitHub from "@alchemy.run/github";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const DOMAIN = "precedents.dev";
const MAIL_DOMAIN = `mail.${DOMAIN}`;
const DEV_PORT = 4173;
// The private repository whose workflow compiles the cards and uploads them to the bucket.
// GitHub account ids (the number, not the login) of the people who may open /admin and who get the daily digest.
const ADMIN_GITHUB_IDS = "74226935";
// Both Workers keep their own log lines. Cloudflare's per-request line (URL, address, user agent) is kept for the
// website only, where it is what an error is traced with; the engine's lines stay counts and nothing else.
const logs = (invocationLogs: boolean) => ({ enabled: true, logs: { enabled: true, invocationLogs }, traces: { enabled: false } });
const CARDS_REPO = { owner: "belyaev-dev", repository: "precedent-cards" };

export const Database = Cloudflare.D1.Database("Database", { migrations: "./migrations" });
export const Email = Cloudflare.Email.SendEmail("Email");
// The private repository's workflow uploads index.json and cards.json here by this name, so the name is fixed.
export const Corpus = Cloudflare.R2.Bucket("Corpus", { name: "precedent-corpus" });

// A GitHub OAuth app's credentials, read from the environment or .env. Left empty, the GitHub button stays hidden.
const optionalSecret = (name: string) => Config.Redacted(name).pipe(Config.withDefault(Redacted.make("")));

export default Alchemy.Stack(
  "Precedent",
  // Local development keeps its state on disk, so it needs no Cloudflare login. Deploys keep theirs in the account.
  { providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()), state: process.env.PRECEDENT_LOCAL_STATE ? Alchemy.localState() : Cloudflare.state() },
  Effect.gen(function* () {
    const live = (yield* Alchemy.Stage) === "prod";
    if (live) {
      const zone = Cloudflare.Zone.Zone.lookup({ name: DOMAIN });
      yield* Cloudflare.Email.SendingSubdomain("Mail", { zoneId: zone.zoneId, name: MAIL_DOMAIN });
      // Cloudflare Web Analytics: visitors, referrers and pages, counted without cookies. The script is added at the edge.
      yield* Cloudflare.Rum.Site("Analytics", { zoneTag: zone.zoneId, autoInstall: true });
    }
    if (live) {
      // What the cards repository's workflow needs to upload: a token that can write R2 objects and nothing else.
      const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
      const uploader = yield* Cloudflare.ApiToken.AccountApiToken("CorpusUploader", {
        name: "precedent-corpus-upload",
        accountId,
        policies: [{ effect: "allow", permissionGroups: ["Workers R2 Storage Write"], resources: { [`com.cloudflare.api.account.${accountId}`]: "*" } }],
      });
      yield* GitHub.Secret("UploadToken", { ...CARDS_REPO, name: "CLOUDFLARE_API_TOKEN", value: uploader.value });
      yield* GitHub.Secret("UploadAccount", { ...CARDS_REPO, name: "CLOUDFLARE_ACCOUNT_ID", value: Redacted.make(accountId) });
    }
    const authSecret = yield* Alchemy.Random("AuthSecret");

    // The search and the MCP tools. It has no address of its own: only the website's Worker can call it,
    // after checking the caller's key. The website addresses it as precedents.dev, which is the one host it accepts.
    const engine = yield* Cloudflare.Worker("Engine", {
      main: "../mcp/src/worker.ts",
      workersDev: false,
      compatibility: { date: "2026-11-01", flags: ["nodejs_compat"] },
      observability: logs(false),
      env: {
        CORPUS: Corpus,
        ALLOWED_HOSTNAMES: DOMAIN,
        // A brake on a client stuck in a loop: 120 calls a minute per client address. mcp/README.md says how it was chosen.
        RATE_LIMITER: Cloudflare.RateLimit("RATE_LIMITER", { namespaceId: 1001, simple: { limit: 120, period: 60 } }),
      },
    });

    const website = yield* Cloudflare.Website.Vite("Website", {
      domain: live ? { name: DOMAIN } : undefined,
      dev: { port: DEV_PORT },
      // TanStack Start's handler plus the daily timer below.
      main: "src/server.ts",
      // 06:00 UTC: delete what is past its keeping time and email the admins yesterday's numbers.
      crons: ["0 6 * * *"],
      observability: logs(true),
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
        ADMIN_GITHUB_IDS,
        // Every request to /api/mcp, with a key or without, per client address: above the engine's own limit, so it
        // only stops what never reaches the engine, such as guesses at a key.
        LIMITER: Cloudflare.RateLimit("LIMITER", { namespaceId: 1002, simple: { limit: 300, period: 60 } }),
      },
    });
    return { url: website.url };
  }),
);
