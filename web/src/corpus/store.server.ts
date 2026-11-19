// The corpus as the server holds it. Only server functions read this, so the cards never ship to the browser.
import corpus from "./corpus.gen.json";
import type { Card, CardRecord, RecordRow } from "./types";

export const version: string = corpus.version;
export const cards = corpus.cards as unknown as Card[];
export const entries = cards.flatMap((card) => card.records.map((record) => ({ card, record })));

// A model-drafted card carries "PENDING human review" until a person signs it (CONTRIBUTING.md, Review).
export const isReviewed = (card: Card) => !/^pending/i.test(card.review.reviewed_by);

export const row = (card: Card, record: CardRecord): RecordRow => ({
  cite: `${card.id}#${record.id}`,
  cardId: card.id,
  recordId: record.id,
  kind: record.kind,
  title: record.title,
  org: card.org,
  year: card.as_of?.slice(0, 4) ?? "",
  shape: card.footprint?.shape ?? null,
  trafficTier: card.scale.traffic?.tier ?? null,
  reviewed: isReviewed(card),
});

export function findRecord(cite: string) {
  const found = entries.find(({ card, record }) => `${card.id}#${record.id}` === cite);
  if (!found) throw new Error(`no record ${cite} in the corpus`);
  return found;
}

// Each card's records sit under the least common of its workloads, so every workload in the corpus gets a group.
export function workloadGroups() {
  const cardsPer = new Map<string, number>();
  for (const card of cards) for (const w of card.workloads) cardsPer.set(w, (cardsPer.get(w) ?? 0) + 1);
  const groups = new Map<string, { name: string; cards: number; rows: RecordRow[] }>();
  for (const card of cards) {
    const home = [...card.workloads].sort((a, b) => cardsPer.get(a)! - cardsPer.get(b)!)[0];
    const group = groups.get(home) ?? { name: home, cards: 0, rows: [] };
    groups.set(home, group);
    group.cards += 1;
    group.rows.push(...card.records.map((record) => row(card, record)));
  }
  return [...groups.values()].sort((a, b) => b.cards - a.cards || b.rows.length - a.rows.length);
}

const newestFirst = [...cards].sort(
  (a, b) => (b.as_of ?? "").localeCompare(a.as_of ?? "") || b.source.published.localeCompare(a.source.published),
);

export interface Query {
  q: string;
  workload: string[];
  kind: string[];
  setup: string[];
  topic?: string[];
  tech?: string[];
  reviewedOnly?: boolean;
}

const STOPWORDS = new Set("a an and are as at be by for from how in is it its of on or our that the to under we with what when which".split(" "));
const tokens = (text: string) => [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t)))];

// How well a record answers a described system: words found in its title and search aliases count most.
function relevance(words: string[], card: Card, record: CardRecord) {
  const strong = [record.title, ...record.aliases].join(" ").toLowerCase();
  const medium = [card.org, ...card.workloads, ...record.topics, ...record.tech].join(" ").toLowerCase();
  const weak = [card.title, card.system, card.architecture.text].join(" ").toLowerCase();
  return words.reduce((score, word) => score + (strong.includes(word) ? 3 : medium.includes(word) ? 2 : weak.includes(word) ? 1 : 0), 0);
}

const overlaps = (wanted: string[] | undefined, have: string[]) => !wanted?.length || wanted.some((w) => have.includes(w));

// Matching records, best match first; newest first when no words are given or scores tie.
export function search({ q, workload, kind, setup, topic, tech, reviewedOnly }: Query) {
  const words = tokens(q);
  const found = newestFirst.flatMap((card) => {
    if (reviewedOnly && !isReviewed(card)) return [];
    if (!overlaps(workload, card.workloads)) return [];
    if (setup.length && !setup.includes(card.footprint?.shape ?? "")) return [];
    return card.records.flatMap((record) => {
      if (kind.length && !kind.includes(record.kind)) return [];
      if (!overlaps(topic, record.topics) || !overlaps(tech, record.tech)) return [];
      const score = relevance(words, card, record);
      return words.length && score === 0 ? [] : [{ card, record, score }];
    });
  });
  return found.sort((a, b) => b.score - a.score);
}

export function cardsPerWorkload() {
  const counts = new Map<string, number>();
  for (const card of cards) for (const w of card.workloads) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts].map(([workload, cardCount]) => ({ workload, cards: cardCount })).sort((a, b) => b.cards - a.cards);
}
