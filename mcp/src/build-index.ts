// Compiles parsed cards into the index the Worker serves. Runs at build time (scripts/build-corpus.mjs)
// and in tests; never at request time.
import { isPendingReview, prefixKey, tokenize } from "./text.ts";
import { AXES, type Axis, type Card, type CardRecord, type CorpusIndex, type Doc, type Facets, type Fact, type Term, type Tombstone } from "./types.ts";

// How much a term counts by where it appears. Titles, aliases and tags are written to be searched;
// the reviewer's notes count least, because they are not the source's claim.
const W = { title: 5, alias: 5, tag: 4, vocabulary: 3, keyFact: 2, fact: 1.5, context: 1.5, note: 1 };

type Weighted = [text: string | null | undefined, weight: number];

const fact = (f: Fact | null): string | null => f?.text ?? null;

function recordFields(card: Card, record: CardRecord): Weighted[] {
  const fields: Weighted[] = [
    [record.title, W.title],
    [record.aliases.join(" "), W.alias],
    [record.tech.join(" "), W.tag],
    [record.topics.join(" "), W.vocabulary],
    [card.workloads.join(" "), W.vocabulary],
    [`${card.org} ${card.system}`, W.context],
    [(record.curator_notes ?? []).join(" "), W.note],
  ];
  if (record.kind === "decision") {
    fields.push(
      [record.chosen.text, W.keyFact],
      [fact(record.forcing_condition), W.keyFact],
      [fact(record.rationale), W.fact],
      [fact(record.worked_before), W.fact],
      [fact(record.cost_paid), W.fact],
      [fact(record.outcome), W.fact],
      [record.rejected.map((r) => `${r.option} ${r.reason ?? ""}`).join(" "), W.fact],
    );
  } else {
    fields.push(
      [record.mechanism.text, W.keyFact],
      [fact(record.trigger), W.keyFact],
      [fact(record.why_defences_failed), W.fact],
      [fact(record.impact), W.fact],
      [fact(record.fix), W.fact],
    );
  }
  return fields;
}

function systemFields(card: Card): Weighted[] {
  const components = card.components ?? [];
  return [
    [card.title, W.title],
    [card.system, W.title],
    [card.org, W.tag],
    [components.map((c) => c.tech ?? "").join(" "), W.tag],
    [card.workloads.join(" "), W.vocabulary],
    [card.footprint?.shape, W.vocabulary],
    [card.architecture.text, W.keyFact],
    [components.map((c) => `${c.name} ${c.role}`).join(" "), W.fact],
  ];
}

// Counts and lookups are keyed by strings that come from cards (tags, ids, terms). They are built in Maps
// and turned into plain objects only at the end, as own properties, so a tag named "constructor" is a
// tag like any other.
type Counts = Map<string, number>;
const bump = (counts: Counts, key: string): void => void counts.set(key, (counts.get(key) ?? 0) + 1);
const plain = <V>(map: Map<string, V>): Record<string, V> => Object.fromEntries(map);

/** What survives of a withdrawn card: the notice, field by field, and nothing else the file may still hold. */
export function tombstoneOf(item: Tombstone): Tombstone {
  return {
    schema: 1,
    id: item.id,
    status: "retracted",
    status_note: item.status_note,
    retracted_at: item.retracted_at,
    withdrawn_records: item.withdrawn_records,
  };
}

/** The cards as they may be published in the static corpus: a withdrawn one is reduced to its tombstone. */
export function publishable(parsed: (Card | Tombstone)[]): (Card | Tombstone)[] {
  return parsed.map((item) => (item.status === "retracted" ? tombstoneOf(item) : item));
}

/** Throws if a card lacks what the server reads. Full validation is scripts/validate.mjs at the repository root. */
function assertServable(card: Card): void {
  const missing = ["id", "title", "org", "system", "architecture", "workloads", "scale", "source", "review", "records"].filter(
    (key) => (card as unknown as Record<string, unknown>)[key] == null,
  );
  if (missing.length) throw new Error(`card ${card.id ?? "(no id)"} lacks ${missing.join(", ")}; run npm run validate at the repository root`);
}

export function buildIndex(parsed: (Card | Tombstone)[], version: string, vocabulary: { workloads: Term[]; topics: Term[] }): CorpusIndex {
  const cards = new Map<string, Card>();
  const tombstones = new Map<string, Tombstone>();
  const docs: Doc[] = [];
  const postings = new Map<string, Map<number, number>>();
  const withdrawn: string[] = [];
  let [systems, decisions, failures, reviewPending] = [0, 0, 0, 0];
  const counts = { workloads: new Map(), topics: new Map(), tech: new Map(), footprints: new Map() } satisfies Record<string, Counts>;
  const tiers: Record<Axis, Counts> = { traffic: new Map(), data: new Map(), team: new Map() };

  const add = (doc: Doc, fields: Weighted[]): void => {
    const index = docs.push(doc) - 1;
    for (const [text, weight] of fields) {
      if (!text) continue;
      for (const term of tokenize(text)) {
        let entry = postings.get(term);
        if (!entry) postings.set(term, (entry = new Map()));
        entry.set(index, Math.max(entry.get(index) ?? 0, weight));
      }
    }
  };

  for (const item of [...parsed].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (item.status === "retracted") {
      // Only the notice survives. Nothing of a withdrawn card is indexed.
      tombstones.set(item.id, tombstoneOf(item));
      withdrawn.push(item.id);
      continue;
    }
    assertServable(item);
    cards.set(item.id, item);
    systems += 1;
    if (isPendingReview(item.review.reviewed_by)) reviewPending += 1;
    for (const workload of item.workloads) bump(counts.workloads, workload);
    if (item.footprint) bump(counts.footprints, item.footprint.shape);
    for (const axis of AXES) bump(tiers[axis], item.scale[axis] ? String(item.scale[axis].tier) : "unknown");
    const tech = new Set<string>((item.components ?? []).flatMap((c) => (c.tech ? [c.tech] : [])));

    add({ kind: "system", card: item.id, record: null }, systemFields(item));
    for (const record of item.records) {
      if (record.kind === "decision") decisions += 1;
      else failures += 1;
      for (const topic of record.topics) bump(counts.topics, topic);
      for (const tag of record.tech) tech.add(tag);
      add({ kind: record.kind, card: item.id, record: record.id }, recordFields(item, record));
    }
    for (const tag of tech) bump(counts.tech, tag);
  }

  const terms = [...postings.keys()].sort();
  const prefixes = new Map<string, string[]>();
  for (const term of terms) {
    const key = prefixKey(term);
    if (!key) continue;
    if (!prefixes.has(key)) prefixes.set(key, []);
    prefixes.get(key)!.push(term);
  }

  const facets: Facets = {
    systems,
    decisions,
    failures,
    withdrawn,
    review_pending: reviewPending,
    workloads: plain(counts.workloads),
    topics: plain(counts.topics),
    tech: plain(counts.tech),
    footprints: plain(counts.footprints),
    tiers: { traffic: plain(tiers.traffic), data: plain(tiers.data), team: plain(tiers.team) },
  };
  return {
    version,
    cards: plain(cards),
    tombstones: plain(tombstones),
    docs,
    postings: Object.fromEntries(terms.map((term) => [term, [...postings.get(term)!.entries()]])),
    prefixes: plain(prefixes),
    vocabulary,
    facets,
  };
}
