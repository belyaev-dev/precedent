// Facts about the product that several pages state.
export const REPO = "https://github.com/belyaev-dev/precedent";
export const SITE_URL = "https://precedents.dev";
export const MCP_URL = `${SITE_URL}/api/mcp`;
// Where to write about an account, a card or these terms.
export const CONTACT_URL = `${REPO}/issues/new`;
export const WAITLIST_URL = `${REPO}/issues/new?title=Private+precedent+waitlist`;
// How many records the catalogue lists to a visitor who is not signed in.
export const FREE_RESULTS = 20;

// Sized against Cloudflare's included usage: a call is two Worker requests, one D1 row read and one row written,
// so even several thousand free users at their limit stay inside the Workers Paid plan's monthly allowance.
export const PLANS = {
  free: { calls: 1_000 },
  pro: { calls: 10_000, price: "$10 a month" },
} as const;
export type PlanName = keyof typeof PLANS;
// Sign-in emails per day across all users, which caps what email can cost: Cloudflare includes 3,000 a month and
// bills beyond that. The two smaller limits keep one person from using up the day's total for everyone.
export const EMAILS_PER_DAY = 500;
export const EMAILS_PER_ADDRESS_PER_DAY = 5;
export const EMAILS_PER_CLIENT_PER_DAY = 20;
// How long the record of a tool call (its query included) is kept. The privacy page states this number.
export const CALL_LOG_DAYS = 90;
export const DESCRIPTION = "Records of how real production systems were built and how they failed, served to coding agents over MCP.";

// The head of a page: its title and description, for the browser tab, search results and link previews alike.
export const pageHead = (title: string, description = DESCRIPTION) => ({
  meta: [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ],
});

export const count = (n: number) => n.toLocaleString("en-GB");

export const KIND = { decision: "Decision", failure: "Failure" } as const;
export const SETUP = {
  "single-node": "one server",
  "single-database": "one database",
  "single-site": "one site",
  partitioned: "sharded",
  "multi-region": "multi-region",
} as const;

export const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
