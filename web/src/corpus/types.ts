// The shape of a card file, as defined by schema/card.schema.json.
export interface Fact {
  text: string;
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

export interface Decision extends RecordBase {
  kind: "decision";
  chosen: Fact;
  rejected: { option: string; reason: string; locator?: string }[];
  forcing_condition: Fact | null;
  rationale: Fact | null;
  worked_before: Fact | null;
  cost_paid: Fact | null;
  outcome: Fact | null;
  applies_from: AppliesFrom | null;
  reversed_by?: string;
}

export interface Failure extends RecordBase {
  kind: "failure";
  trigger: Fact | null;
  mechanism: Fact;
  why_defences_failed: Fact | null;
  impact: Fact | null;
  fix: Fact | null;
}

export type CardRecord = Decision | Failure;
export type Shape = "single-node" | "single-database" | "partitioned" | "multi-region";

export interface Card {
  id: string;
  title: string;
  org: string;
  system: string;
  architecture: Fact;
  components?: { name: string; role: string; locator: string }[];
  as_of: string | null;
  evidence: "production" | "incident" | "experiment";
  workloads: string[];
  footprint: { shape: Shape; locator: string } | null;
  scale: {
    traffic: { tier: number } | null;
    metrics: { name: string; value: number | string; unit: string; qualifier?: string; locator: string }[];
  };
  source: { url: string; title: string; publisher: string; published: string };
  review: { extracted_by: string; reviewed_by: string; reviewed_at: string };
  status: "current" | "disputed";
  status_note?: string;
  records: CardRecord[];
}

// One line of a record list: enough to show and link a record without its card.
export interface RecordRow {
  cite: string;
  cardId: string;
  recordId: string;
  kind: CardRecord["kind"];
  title: string;
  org: string;
  year: string;
  shape: Shape | null;
  trafficTier: number | null;
  // True once a person has read the card against its source.
  reviewed: boolean;
}
