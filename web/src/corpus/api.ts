// What the pages ask the server for. Each function returns only what its page shows.
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { env } from "../server/env";
import { currentUser } from "../server/session";
import { repoStars } from "../server/stars";
import { FREE_RESULTS } from "../site";
import { corpus, isReviewed, sampleIds, type Query } from "./store.server";
import type { RecordRow } from "./types";

// What the header and footer of every page show.
export const getSiteInfo = createServerFn({ method: "GET" }).handler(async () => ({ version: (await corpus()).version, stars: await repoStars(), analyticsToken: env.ANALYTICS_TOKEN || null }));

export const getCorpusVersion = createServerFn({ method: "GET" }).handler(async () => (await corpus()).version);

export const getLanding = createServerFn({ method: "GET" }).handler(async () => {
  const { cards, entries, findRecord, workloadGroups } = await corpus();
  // Always a sample card, so it is present whichever corpus is being served.
  const featured = findRecord("notion-2021-postgres-sharding#d1")!;
  const orgs = [...new Set(cards.map((card) => card.org))]
    .filter((org) => !/^(Not named|Unnamed)/.test(org))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return {
    cards: cards.length,
    reviewedCards: cards.filter(isReviewed).length,
    records: entries.length,
    decisions: entries.filter(({ record }) => record.kind === "decision").length,
    // One square per record: only what a square shows and links to.
    groups: workloadGroups().map(({ name, cards, rows }) => ({ name, cards, rows: rows.map(({ cardId, recordId, kind, title }) => ({ cardId, recordId, kind, title })) })),
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
    const { cards, entries, search, workloadGroups } = await corpus();
    const matched = search(data);
    const signedIn = (await currentUser()) !== null;
    return {
      rows: signedIn ? matched : matched.slice(0, FREE_RESULTS),
      matched: matched.length,
      cards: cards.length,
      records: entries.length,
      workloads: workloadGroups().map((group) => group.name),
    };
  });

// A sample card is open to anyone. Any other card is shown in full to a signed-in reader, and as an
// outline (what the system is and which records it holds) to everyone else.
export const getCard = createServerFn({ method: "GET" })
  .validator((id: string) => String(id))
  .handler(async ({ data: id }) => {
    const { cards, row } = await corpus();
    const card = cards.find((c) => c.id === id);
    if (!card) throw notFound();
    if (sampleIds.has(card.id) || (await currentUser())) return { locked: false as const, card };
    const { id: cardId, title, org, system, as_of, evidence, source } = card;
    return { locked: true as const, outline: { id: cardId, title, org, system, as_of, evidence, source, records: card.records.map((record) => row(card, record)) } };
  });

export const getMcpExample = createServerFn({ method: "GET" }).handler(async () => {
  const { findRecord, row } = await corpus();
  const cited: RecordRow[] = [];
  for (const cite of ["tosbourn-2023-client-rails-jobs#d1", "37signals-2023-solid-queue#d1", "brandur-2015-postgres-job-queue#f1"]) {
    const found = findRecord(cite);
    if (found) cited.push(row(found.card, found.record));
  }
  return { cited };
});
