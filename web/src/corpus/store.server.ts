// The corpus as the server holds it. Only server functions read this, so the cards never ship to the browser.
// In production the cards come from the precedent-corpus R2 bucket; the sample cards bundled at build time
// are the fallback, and are what a checkout without the bucket serves.
import { env } from "../server/env";
import samples from "./corpus.gen.json";
import type { Card, CardRecord, RecordRow } from "./types";

export interface Query {
  q: string;
  workload: string[];
  kind: string[];
  setup: string[];
}

// A model-drafted card carries "PENDING human review" until a person signs it (CONTRIBUTING.md, Review).
export const isReviewed = (card: Card) => !/^pending/i.test(card.review.reviewed_by);

/** The cards published in the public repository. Anyone may read these in full. */
export const sampleIds = new Set((samples.cards as unknown as Card[]).map((card) => card.id));

const STOPWORDS = new Set("a an and are as at be by for from how in is it its of on or our that the to under we with what when which".split(" "));
const tokens = (text: string) => [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t)))];
const overlaps = (wanted: string[], have: string[]) => !wanted.length || wanted.some((w) => have.includes(w));

function makeCorpus(version: string, cards: Card[]) {
  const entries = cards.flatMap((card) => card.records.map((record) => ({ card, record })));
  const newestFirst = [...cards].sort(
    (a, b) => (b.as_of ?? "").localeCompare(a.as_of ?? "") || b.source.published.localeCompare(a.source.published),
  );

  const row = (card: Card, record: CardRecord): RecordRow => ({
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

  // How well a record answers a described system: words found in its title and search aliases count most.
  const relevance = (words: string[], card: Card, record: CardRecord) => {
    const strong = [record.title, ...record.aliases].join(" ").toLowerCase();
    const medium = [card.org, ...card.workloads, ...record.topics, ...record.tech].join(" ").toLowerCase();
    const weak = [card.title, card.system, card.architecture.text].join(" ").toLowerCase();
    return words.reduce((score, word) => score + (strong.includes(word) ? 3 : medium.includes(word) ? 2 : weak.includes(word) ? 1 : 0), 0);
  };

  return {
    version,
    cards,
    entries,
    row,

    /** The record a citation names, or undefined when the corpus being served does not hold it. */
    findRecord(cite: string) {
      return entries.find(({ card, record }) => `${card.id}#${record.id}` === cite);
    },

    // Each card's records sit under the least common of its workloads, so every workload in the corpus gets a group.
    workloadGroups() {
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
    },

    // Matching records for the catalogue, best match first; newest first when no words are given or scores tie.
    search({ q, workload, kind, setup }: Query) {
      const words = tokens(q);
      const found = newestFirst.flatMap((card) => {
        if (!overlaps(workload, card.workloads)) return [];
        if (setup.length && !setup.includes(card.footprint?.shape ?? "")) return [];
        return card.records.flatMap((record) => {
          if (kind.length && !kind.includes(record.kind)) return [];
          const score = relevance(words, card, record);
          return words.length && score === 0 ? [] : [{ row: row(card, record), score }];
        });
      });
      return found.sort((a, b) => b.score - a.score).map((hit) => hit.row);
    },
  };
}

export type Corpus = ReturnType<typeof makeCorpus>;

const OBJECT = "cards.json";
const RECHECK_MS = 60_000;
const bundled = makeCorpus(samples.version, samples.cards as unknown as Card[]);
let loaded: { corpus: Corpus; etag: string } | undefined;
let checkedAt = 0;
let reading: Promise<Corpus> | undefined;

async function read(bucket: R2Bucket): Promise<Corpus> {
  try {
    const object = await bucket.get(OBJECT, loaded ? { onlyIf: { etagDoesNotMatch: loaded.etag } } : undefined);
    // An unchanged file comes back without a body.
    if (object && "body" in object) {
      const file = (await object.json()) as { version: string; cards: Card[] };
      loaded = { corpus: makeCorpus(file.version, file.cards), etag: object.etag };
    }
  } catch (error) {
    // Keep serving what was loaded last; a failed refresh must not take the site down.
    console.error(JSON.stringify({ event: "error", name: "corpus_source", message: String(error) }));
  }
  return loaded?.corpus ?? bundled;
}

/** The corpus to serve this request from. Looks at the bucket at most once a minute, and only downloads a changed file. */
export function corpus(): Promise<Corpus> {
  const bucket = env.CORPUS;
  if (!bucket) return Promise.resolve(bundled);
  if (reading) return reading;
  if (loaded && Date.now() - checkedAt < RECHECK_MS) return Promise.resolve(loaded.corpus);
  checkedAt = Date.now();
  // Requests that arrive during a read share it, so none of them is answered from the samples meanwhile.
  reading = read(bucket).finally(() => (reading = undefined));
  return reading;
}
