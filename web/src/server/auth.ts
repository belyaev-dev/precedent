import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { EMAILS_PER_DAY } from "../site";
import { env } from "./env";

export const signInMethods = () => ({
  github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  email: Boolean(env.EMAIL),
});

async function sendMagicLink({ email, url }: { email: string; url: string }) {
  const day = new Date().toISOString().slice(0, 10);
  const counted = await env.DB.prepare(
    `insert into "emailDay" ("day", "sent") values (?, 1)
     on conflict ("day") do update set "sent" = "sent" + 1 where "sent" < ? returning "sent"`,
  )
    .bind(day, EMAILS_PER_DAY)
    .first();
  if (!counted) throw new Error("The daily limit for sign-in emails has been reached. Try again tomorrow, or sign in with GitHub.");
  await env.EMAIL!.send({
    from: { email: env.EMAIL_FROM, name: "Precedent" },
    to: email,
    subject: "Your Precedent sign-in link",
    text: `Open this link to sign in to Precedent. It works once and expires in five minutes.\n\n${url}\n\nIf you did not ask for it, ignore this email.`,
  });
}

function createAuth() {
  const methods = signInMethods();
  return betterAuth({
    baseURL: env.SITE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    socialProviders: methods.github ? { github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! } } : {},
    // tanstackStartCookies must stay last so the cookies it sets reach the response.
    plugins: [...(methods.email ? [magicLink({ sendMagicLink })] : []), tanstackStartCookies()],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
// Built on first use, because bindings are only readable while a request is being handled.
export const getAuth = () => (auth ??= createAuth());
