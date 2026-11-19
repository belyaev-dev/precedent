// What the account page asks the server for.
import { createServerFn } from "@tanstack/react-start";
import { signInMethods } from "../server/auth";
import { accountOf, askForPro, issueKey } from "../server/keys";
import { currentUser } from "../server/session";

async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Sign in first.");
  return user;
}

export const getAccount = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser();
  if (!user) return { signedIn: false as const, methods: signInMethods() };
  return { signedIn: true as const, email: user.email, ...(await accountOf(user.id)) };
});

// Returns the new key in full. It cannot be read again, so the page shows it straight away.
export const createKey = createServerFn({ method: "POST" }).handler(async () => issueKey((await requireUser()).id));

export const requestPro = createServerFn({ method: "POST" }).handler(async () => askForPro((await requireUser()).id));
