// Compiles parsed cards into the index the Worker serves. Runs at build time (scripts/build-corpus.mjs)
// and in tests; never at request time.
import { prefixKey, tokenize } from "./text.ts";
import { AXES, type Card, type CardRecord, type CorpusIndex, type Doc, type Facets, type Fact, type Term, type Tombstone } from "./types.ts";

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

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

/** Throws if a card lacks what the server reads. Full validation is scripts/validate.mjs at the repository root. */
function assertServable(card: Card): void {
  const missing = ["id", "title", "org", "system", "architecture", "workloads", "scale", "source", "review", "records"].filter(
    (key) => (card as unknown as Record<string, unknown>)[key] == null,
  );
  if (missing.length) throw new Error(`card ${card.id ?? "(no id)"} lacks ${missing.join(", ")}; run npm run validate at the repository root`);
}

export function buildIndex(parsed: (Card | Tombstone)[], version: string, vocabulary: { workloads: Term[]; topics: Term[] }): CorpusIndex {
  const cards: Record<string, Card> = {};
  const tombstones: Record<string, Tombstone> = {};
  const docs: Doc[] = [];
  const postings = new Map<string, Map<number, number>>();
  const facets: Facets = {
    systems: 0,
    decisions: 0,
    failures: 0,
    withdrawn: [],
    review_pending: 0,
    workloads: {},
    topics: {},
    tech: {},
    footprints: {},
    tiers: { traffic: {}, data: {}, team: {} },
  };

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
      tombstones[item.id] = {
        schema: 1,
        id: item.id,
        status: "retracted",
        status_note: item.status_note,
        retracted_at: item.retracted_at,
        withdrawn_records: item.withdrawn_records,
      };
      facets.withdrawn.push(item.id);
      continue;
    }
    assertServable(item);
    cards[item.id] = item;
    facets.systems += 1;
    if (/^pending\b/i.test(item.review.reviewed_by)) facets.review_pending += 1;
    for (const workload of item.workloads) bump(facets.workloads, workload);
    if (item.footprint) bump(facets.footprints, item.footprint.shape);
    for (const axis of AXES) bump(facets.tiers[axis], item.scale[axis] ? String(item.scale[axis].tier) : "unknown");
    const tech = new Set<string>((item.components ?? []).flatMap((c) => (c.tech ? [c.tech] : [])));

    add({ kind: "system", card: item.id, record: null }, systemFields(item));
    for (const record of item.records) {
      facets[record.kind === "decision" ? "decisions" : "failures"] += 1;
      for (const topic of record.topics) bump(facets.topics, topic);
      for (const tag of record.tech) tech.add(tag);
      add({ kind: record.kind, card: item.id, record: record.id }, recordFields(item, record));
    }
    for (const tag of tech) bump(facets.tech, tag);
  }

  const terms = [...postings.keys()].sort();
  const prefixes: Record<string, string[]> = {};
  for (const term of terms) {
    const key = prefixKey(term);
    if (key) (prefixes[key] ??= []).push(term);
  }

  return {
    version,
    cards,
    tombstones,
    docs,
    postings: Object.fromEntries(terms.map((term) => [term, [...postings.get(term)!.entries()]])),
    prefixes,
    vocabulary,
    facets,
  };
}
