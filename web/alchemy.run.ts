// Everything the website needs on Cloudflare: the Worker, its database, sign-in email and the precedents.dev domain.
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

    const website = yield* Cloudflare.Website.Vite("Website", {
      domain: live ? { name: DOMAIN } : undefined,
      dev: { port: DEV_PORT },
      env: {
        DB: Database,
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
