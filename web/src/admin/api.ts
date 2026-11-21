// What the admin page asks the server for.
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { describeSearch, isAdmin, usageReport } from "../server/admin";
import { currentUser } from "../server/session";

// Anyone else is told there is no such page.
export const getUsage = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.id))) throw notFound();
  const report = await usageReport();
  return {
    ...report,
    misses: report.misses.map(({ asked, ...miss }) => ({ ...miss, search: describeSearch(asked) })),
    offScale: report.offScale.map(({ asked, ...miss }) => ({ ...miss, search: describeSearch(asked) })),
  };
});
