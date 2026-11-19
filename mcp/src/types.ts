// The card format, as defined by schema/card.schema.json, and the index the build compiles from it.

export interface Fact {
  text: string;
  locator: string;
}

export interface ScaleAxis {
  tier: number;
  basis: "stated" | "estimated";
  note?: string;
}

export type Axis = "traffic" | "data" | "team";
export const AXES: readonly Axis[] = ["traffic", "data", "team"];

export interface Metric {
  axis: Axis | "other";
  name: string;
  value: number;
  unit: string;
  qualifier?: string;
  locator: string;
}

export interface AppliesFrom {
  traffic_tier?: number;
  data_tier?: number;
  team_tier?: number;
  basis: "source_stated" | "curator_judgment";
  threshold?: string;
  locator?: string;
  rationale?: string;
}

interface RecordBase {
  id: string;
  topics: string[];
  title: string;
  curator_notes?: string[];
  aliases: string[];
  tech: string[];
}

export interface DecisionRecord extends RecordBase {
  kind: "decision";
  chosen: Fact;
  rejected: { option: string; reason: string | null; locator: string }[];
  forcing_condition: Fact | null;
  rationale: Fact | null;
  worked_before: Fact | null;
  cost_paid: Fact | null;
  outcome: Fact | null;
  applies_from: AppliesFrom | null;
  reversed_by?: string;
}

export interface FailureRecord extends RecordBase {
  kind: "failure";
  trigger: Fact | null;
  mechanism: Fact;
  why_defences_failed: Fact | null;
  impact: Fact | null;
  fix: Fact | null;
}

export type CardRecord = DecisionRecord | FailureRecord;

export interface Card {
  schema: 1;
  id: string;
  title: string;
  org: string;
  system: string;
  architecture: Fact;
  components?: { name: string; role: string; tech?: string; locator: string }[];
  as_of: string | null;
  evidence: "production" | "incident" | "experiment";
  workloads: string[];
  footprint: { shape: string; locator: string } | null;
  scale: {
    traffic: ScaleAxis | null;
    data: ScaleAxis | null;
    team: ScaleAxis | null;
    metrics: Metric[];
  };
  source: {
    url: string;
    archive_url?: string | null;
    title: string;
    publisher: string;
    author?: string;
    published: string;
    published_note?: string;
    party: "first" | "third";
    retrieved_at: string;
    reuse_basis: string;
    license?: string;
  };
  review: { extracted_by: string; reviewed_by: string; reviewed_at: string };
  status: "current" | "disputed";
  status_note?: string;
  /** What the same source says changed after as_of. */
  later_update?: Fact;
  records: CardRecord[];
}

export interface Tombstone {
  schema: 1;
  id: string;
  status: "retracted";
  status_note: string;
  retracted_at: string;
  withdrawn_records: string[];
}

export type Kind = "system" | "decision" | "failure";
export const KINDS: readonly Kind[] = ["system", "decision", "failure"];
export const FOOTPRINTS = ["single-node", "single-database", "single-site", "partitioned", "multi-region"] as const;

/** One searchable unit: a card as a whole (kind system) or one of its records. */
export interface Doc {
  kind: Kind;
  card: string;
  /** Record id within the card; null for a system. */
  record: string | null;
}

export interface Term {
  value: string;
  meaning: string;
}

export interface Facets {
  systems: number;
  decisions: number;
  failures: number;
  withdrawn: string[];
  review_pending: number;
  workloads: Record<string, number>;
  topics: Record<string, number>;
  tech: Record<string, number>;
  footprints: Record<string, number>;
  /** Per axis, how many cards sit at each tier; "unknown" counts cards with no tier on that axis. */
  tiers: Record<Axis, Record<string, number>>;
}

/** Everything the Worker serves, compiled from cards/*.yaml at build time. Never edited by hand. */
export interface CorpusIndex {
  version: string;
  cards: Record<string, Card>;
  tombstones: Record<string, Tombstone>;
  docs: Doc[];
  /** Stemmed term -> [doc index, field weight] pairs. */
  postings: Record<string, [number, number][]>;
  /** First five characters -> terms starting with them, for near-miss matching. */
  prefixes: Record<string, string[]>;
  vocabulary: { workloads: Term[]; topics: Term[] };
  facets: Facets;
}
