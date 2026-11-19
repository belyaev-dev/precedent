import { getRequest } from "@tanstack/react-start/server";
import { getAuth } from "./auth";

// The signed-in user making this request, or null.
export async function currentUser() {
  const session = await getAuth().api.getSession({ headers: getRequest().headers });
  return session?.user ?? null;
}
