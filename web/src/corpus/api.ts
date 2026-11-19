// What the pages ask the server for. Each function returns only what its page shows.
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { FREE_RESULTS } from "../site";
import { currentUser } from "../server/session";
import { repoStars } from "../server/stars";
import { cards, entries, findRecord, isReviewed, row, search, version, workloadGroups, type Query } from "./store.server";

export const getCorpusVersion = createServerFn({ method: "GET" }).handler(() => version);

// What the header and footer of every page show.
export const getSiteInfo = createServerFn({ method: "GET" }).handler(async () => ({ version, stars: await repoStars() }));

export const getLanding = createServerFn({ method: "GET" }).handler(() => {
  const featured = findRecord("notion-2021-postgres-sharding#d1");
  const orgs = [...new Set(cards.map((card) => card.org))]
    .filter((org) => !/^(Not named|Unnamed)/.test(org))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return {
    cards: cards.length,
    reviewedCards: cards.filter(isReviewed).length,
    records: entries.length,
    decisions: entries.filter(({ record }) => record.kind === "decision").length,
    groups: workloadGroups(),
    orgs,
    featured: { cite: `${featured.card.id}#${featured.record.id}`, record: featured.record, source: featured.card.source },
  };
});

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

export const searchRecords = createServerFn({ method: "GET" })
  .validator((input: Partial<Query>): Query => ({
    q: typeof input?.q === "string" ? input.q.slice(0, 200) : "",
    workload: strings(input?.workload),
    kind: strings(input?.kind),
    setup: strings(input?.setup),
  }))
  .handler(async ({ data }) => {
    const matched = search(data).map(({ card, record }) => row(card, record));
    const signedIn = (await currentUser()) !== null;
    return {
      rows: signedIn ? matched : matched.slice(0, FREE_RESULTS),
      matched: matched.length,
      cards: cards.length,
      records: entries.length,
      workloads: workloadGroups().map((group) => group.name),
    };
  });

export const getCard = createServerFn({ method: "GET" })
  .validator((id: string) => String(id))
  .handler(({ data: id }) => {
    const card = cards.find((c) => c.id === id);
    if (!card) throw notFound();
    return card;
  });

export const getMcpExample = createServerFn({ method: "GET" }).handler(() => ({
  workloads: workloadGroups().length,
  cited: ["tosbourn-2023-client-rails-jobs#d1", "37signals-2023-solid-queue#d1", "brandur-2015-postgres-job-queue#f1"].map((cite) => {
    const { card, record } = findRecord(cite);
    return row(card, record);
  }),
}));
