// Keyword search over the compiled index, and the scale grouping that decides how a hit may be used.
// Pure functions of (index, parameters): no I/O, no model, nothing parsed from the query but terms.
import { nearMiss, prefixKey, queryTerms } from "./text.ts";
import { AXES, type Axis, type Card, type CardRecord, type CorpusIndex, type Doc, type Kind } from "./types.ts";

export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 10;
/** A system and its own records match the same words, so by default only records are returned; a baseline is asked for by kind. */
export const DEFAULT_KINDS: readonly Kind[] = ["decision", "failure"];
/** A near miss ("idempotent" for "idempotency") counts for half an exact match. */
const NEAR_MISS_FACTOR = 0.5;

export type Envelope = Partial<Record<Axis, number>>;

export interface SearchParams extends Envelope {
  query?: string;
  kind?: Kind[];
  workload?: string[];
  topic?: string[];
  tech?: string[];
  footprint?: string[];
  limit?: number;
}

/**
 * How a hit relates to the caller's envelope.
 * - at_scale: the card has a tier on every axis the caller gave, and each equals the caller's.
 * - different_scale: a tier the card does have differs from the caller's.
 * - unknown_scale: nothing contradicts the caller's envelope, but the card has no tier on at least one
 *   axis the caller gave. Unknown is not small: this is never a match for the caller's tier.
 * - floor_unchecked: a decision whose applies_from floor names an axis the caller gave no tier for. The floor
 *   could not be checked, so the decision is kept out of every scale group, whatever its card's tiers.
 * - out_of_envelope: a decision whose applies_from floor is above the caller's envelope.
 * - no_envelope: the caller gave no tiers, so nothing was compared.
 */
export type Group = "at_scale" | "different_scale" | "unknown_scale" | "floor_unchecked" | "out_of_envelope" | "no_envelope";
export const GROUP_ORDER: readonly Group[] = ["at_scale", "different_scale", "unknown_scale", "floor_unchecked", "out_of_envelope", "no_envelope"];

export interface ScaleFit {
  group: Group;
  /** Axes the caller gave, by how the card compares on each. */
  equal: Axis[];
  differs: Axis[];
  unknown: Axis[];
  /** Floor axes above the caller's tier, and floor axes that could not be checked because the caller gave no tier. */
  floorAbove: Axis[];
  floorUnchecked: Axis[];
}

export interface Hit extends ScaleFit {
  doc: Doc;
  card: Card;
  record: CardRecord | null;
  score: number;
  /** Query words that matched this hit, as the caller wrote them. */
  matched: string[];
}

export interface SearchResult {
  version: string;
  /** Query words that were searched, words that occur nowhere in the corpus, and how many were dropped as over the limit. */
  words: string[];
  unknownWords: string[];
  droppedTerms: number;
  /** Words over the length limit, which were not searched. */
  tooLongWords: number;
  /** The caller sent a query with text in it. */
  queryGiven: boolean;
  /** A query was given and nothing in it could be searched. Such a search matches nothing, whatever the filters. */
  noUsableWords: boolean;
  /** Tech tags the caller filtered on that no card uses. */
  unknownTech: string[];
  envelope: Envelope;
  matched: number;
  counts: Record<Group, number>;
  /** Hits a footprint filter removed only because their source states no footprint. */
  excludedNoFootprint: number;
  hits: Hit[];
}

const tierOf = (floor: NonNullable<Extract<CardRecord, { kind: "decision" }>["applies_from"]>, axis: Axis): number | undefined => floor[`${axis}_tier`];

export function scaleFit(card: Card, record: CardRecord | null, envelope: Envelope): ScaleFit {
  const given = AXES.filter((axis) => envelope[axis] !== undefined);
  const fit: ScaleFit = { group: "no_envelope", equal: [], differs: [], unknown: [], floorAbove: [], floorUnchecked: [] };

  const floor = record?.kind === "decision" ? record.applies_from : null;
  if (floor) {
    for (const axis of AXES) {
      const floorTier = tierOf(floor, axis);
      if (floorTier === undefined) continue;
      if (envelope[axis] === undefined) fit.floorUnchecked.push(axis);
      else if (floorTier > envelope[axis]) fit.floorAbove.push(axis);
    }
  }

  for (const axis of given) {
    const known = card.scale[axis];
    if (!known) fit.unknown.push(axis);
    else if (known.tier === envelope[axis]) fit.equal.push(axis);
    else fit.differs.push(axis);
  }

  if (fit.floorAbove.length) fit.group = "out_of_envelope";
  else if (fit.floorUnchecked.length) fit.group = "floor_unchecked";
  else if (given.length === 0) fit.group = "no_envelope";
  else if (fit.differs.length) fit.group = "different_scale";
  else if (fit.unknown.length) fit.group = "unknown_scale";
  else fit.group = "at_scale";
  return fit;
}

const intersects = (wanted: string[] | undefined, have: readonly string[]): boolean => !wanted?.length || wanted.some((w) => have.includes(w));

function techOf(card: Card, record: CardRecord | null): string[] {
  if (record) return record.tech;
  return [...(card.components ?? []).flatMap((c) => (c.tech ? [c.tech] : [])), ...card.records.flatMap((r) => r.tech)];
}

function distance(hit: ScaleFit, card: Card, envelope: Envelope): number {
  return hit.differs.reduce((sum, axis) => sum + Math.abs(card.scale[axis]!.tier - envelope[axis]!), 0);
}

export function search(index: CorpusIndex, params: SearchParams): SearchResult {
  const total = index.docs.length;
  const envelope: Envelope = {};
  for (const axis of AXES) if (params[axis] !== undefined) envelope[axis] = params[axis];
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(params.limit ?? DEFAULT_LIMIT)));
  const kinds = params.kind?.length ? params.kind : DEFAULT_KINDS;

  // An absent or blank query means "filters only". A query with text in it but nothing searchable
  // (punctuation, common words) must not fall through to that: it matches nothing.
  const queryGiven = (params.query ?? "").trim().length > 0;
  const { terms, dropped, tooLong } = queryTerms(params.query ?? "");
  const noUsableWords = queryGiven && terms.length === 0;
  const score = new Float64Array(total);
  const seen = new Uint16Array(total); // one bit per query term
  const unknownWords: string[] = [];
  let known = 0;

  terms.forEach(({ term, word }, bit) => {
    // Own-property checks only: the index is a plain object, and a query may say "constructor".
    const weights = new Map<number, number>();
    const take = (indexed: string, factor: number): void => {
      for (const [doc, weight] of index.postings[indexed]!) weights.set(doc, Math.max(weights.get(doc) ?? 0, weight * factor));
    };
    if (Object.hasOwn(index.postings, term)) take(term, 1);
    const key = prefixKey(term);
    if (key && Object.hasOwn(index.prefixes, key)) {
      for (const candidate of index.prefixes[key]!) if (candidate !== term && nearMiss(term, candidate)) take(candidate, NEAR_MISS_FACTOR);
    }
    if (weights.size === 0) {
      unknownWords.push(word);
      return;
    }
    known += 1;
    const idf = Math.log(1 + total / weights.size);
    for (const [doc, weight] of weights) {
      score[doc]! += idf * weight;
      seen[doc]! |= 1 << bit;
    }
  });

  // A hit must carry at least half of the query's terms that exist in the corpus. Without this, any
  // common word would make everything "match" and the coverage counts would mean nothing.
  const need = Math.max(1, Math.ceil(known / 2));
  const bits = (n: number): number => {
    let count = 0;
    for (let v = n; v; v &= v - 1) count += 1;
    return count;
  };

  const unknownTech = (params.tech ?? []).filter((tag) => !Object.hasOwn(index.facets.tech, tag));
  const counts: Record<Group, number> = { at_scale: 0, different_scale: 0, unknown_scale: 0, floor_unchecked: 0, out_of_envelope: 0, no_envelope: 0 };
  let excludedNoFootprint = 0;
  const hits: Hit[] = [];

  for (let i = 0; i < total && !noUsableWords; i++) {
    if (terms.length > 0 && bits(seen[i]!) < need) continue;
    const doc = index.docs[i]!;
    if (!kinds.includes(doc.kind)) continue;
    const card = index.cards[doc.card]!;
    const record = doc.record ? (card.records.find((r) => r.id === doc.record) ?? null) : null;
    if (!intersects(params.workload, card.workloads)) continue;
    // Topics belong to records, so a topic filter leaves systems out.
    if (params.topic?.length && !(record && intersects(params.topic, record.topics))) continue;
    if (!intersects(params.tech, techOf(card, record))) continue;
    if (params.footprint?.length) {
      if (!card.footprint) {
        excludedNoFootprint += 1;
        continue;
      }
      if (!params.footprint.includes(card.footprint.shape)) continue;
    }
    const fit = scaleFit(card, record, envelope);
    counts[fit.group] += 1;
    hits.push({ ...fit, doc, card, record, score: score[i]!, matched: terms.filter((_, bit) => seen[i]! & (1 << bit)).map((t) => t.word) });
  }

  // What the caller asked for comes first: hits at their scale. After that relevance decides. Equally
  // relevant hits go in group order, and within a different scale the nearer one first.
  const first = (hit: Hit): number => (hit.group === "at_scale" ? 0 : 1);
  const order = (hit: Hit): number => GROUP_ORDER.indexOf(hit.group);
  hits.sort((a, b) => first(a) - first(b) || b.score - a.score || order(a) - order(b) || distance(a, a.card, envelope) - distance(b, b.card, envelope));
  const shown = hits.slice(0, limit);
  shown.sort((a, b) => order(a) - order(b));

  return {
    version: index.version,
    words: terms.map((t) => t.word),
    unknownWords,
    droppedTerms: dropped,
    tooLongWords: tooLong,
    queryGiven,
    noUsableWords,
    unknownTech,
    envelope,
    matched: hits.length,
    counts,
    excludedNoFootprint,
    hits: shown,
  };
}
