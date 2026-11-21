import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getRequest } from "@tanstack/react-start/server";
import { EMAILS_PER_ADDRESS_PER_DAY, EMAILS_PER_CLIENT_PER_DAY, EMAILS_PER_DAY } from "../site";
import { env } from "./env";

export const signInMethods = () => ({
  github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  email: Boolean(env.EMAIL),
});

const sha256 = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");

// A refusal the sign-in form can show: a plain Error would reach the browser as an empty 500.
const refused = (message: string) => new APIError("TOO_MANY_REQUESTS", { message });

// Counts one more email against a daily limit. Returns false, counting nothing, once the limit is reached.
async function underLimit(day: string, sender: string, limit: number) {
  const counted = await env.DB.prepare(
    `insert into "emailSender" ("day", "sender", "sent") values (?1, ?2, 1)
     on conflict ("day", "sender") do update set "sent" = "sent" + 1 where "sent" < ?3 returning "sent"`,
  )
    .bind(day, sender, limit)
    .first();
  return counted !== null;
}

async function sendMagicLink({ email, url }: { email: string; url: string }) {
  const day = new Date().toISOString().slice(0, 10);
  // One address and one client are limited first, so that neither can spend the total everyone shares.
  const client = getRequest().headers.get("cf-connecting-ip");
  if (!(await underLimit(day, `to:${await sha256(email.trim().toLowerCase())}`, EMAILS_PER_ADDRESS_PER_DAY)) || (client && !(await underLimit(day, `ip:${client}`, EMAILS_PER_CLIENT_PER_DAY)))) {
    throw refused("Too many sign-in links have been asked for today. Use the newest link in your inbox, or try again tomorrow.");
  }
  const counted = await env.DB.prepare(
    `insert into "emailDay" ("day", "sent") values (?, 1)
     on conflict ("day") do update set "sent" = "sent" + 1 where "sent" < ? returning "sent"`,
  )
    .bind(day, EMAILS_PER_DAY)
    .first();
  if (!counted) throw refused("The daily limit for sign-in emails has been reached. Try again tomorrow, or sign in with GitHub.");
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
    // A signed-in user may delete their account from the account page; their key and usage rows go with it.
    user: { deleteUser: { enabled: true } },
    socialProviders: methods.github ? { github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! } } : {},
    // tanstackStartCookies must stay last so the cookies it sets reach the response.
    plugins: [...(methods.email ? [magicLink({ sendMagicLink })] : []), tanstackStartCookies()],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
// Built on first use, because bindings are only readable while a request is being handled.
export const getAuth = () => (auth ??= createAuth());
