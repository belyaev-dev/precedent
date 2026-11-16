// Cards as large as the format allows, for testing the size limits. Kept apart from helpers.ts so that
// a test can build an index from them without importing the real compiled corpus.
import type { Card } from "../src/types.ts";

export const LARGEST_VERSION = "largest00000";

/** Total characters of text in a card, counted the way scripts/validate.mjs counts them. */
export function textLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((n: number, v) => n + textLength(v), 0);
  if (value && typeof value === "object") return textLength(Object.values(value));
  return 0;
}

/**
 * Synthetic cards as large as the schema and the validator allow: close to 12,000 characters of text
 * each, ten components, five metrics, eight records, and three-byte characters in every free-text
 * field. They are what the size limits have to cope with, not what a real card looks like.
 */
export function largestCards(count: number): Card[] {
  const wide = (label: string, length: number): string => `${label} ${"\u3042".repeat(length)}`.slice(0, length);
  return Array.from({ length: count }, (_, n) => {
    const id = `huge-2024-system-${n + 1}`;
    const fact = (label: string, length: number) => ({ text: wide(label, length), locator: `Section: ${wide("part", 30)}` });
    const card: Card = {
      schema: 1,
      id,
      title: wide(`Largest card ${n + 1}`, 160),
      org: wide("Huge (fictional)", 60),
      system: wide("System", 60),
      architecture: fact("Architecture", 400),
      components: Array.from({ length: 10 }, (_, i) => ({ name: wide(`Component ${i}`, 40), role: wide("Role", 380), tech: `tech-${i}`, locator: `Section: ${wide("part", 30)}` })),
      as_of: "2024",
      evidence: "production",
      workloads: ["crud-app"],
      footprint: { shape: "single-database", locator: `Section: ${wide("shape", 30)}` },
      scale: {
        traffic: null,
        data: null,
        team: null,
        metrics: Array.from({ length: 5 }, (_, i) => ({ axis: "other" as const, name: wide(`Figure ${i}`, 60), value: 1000 + i, unit: wide("unit", 20), qualifier: wide("qualifier", 60), locator: `Section: ${wide("numbers", 30)}` })),
      },
      source: { url: `https://example.com/huge/${n + 1}`, archive_url: null, title: wide("Source", 100), publisher: wide("Publisher (fictional)", 60), published: "2024-05-01", party: "first", retrieved_at: "2026-11-16", reuse_basis: "factual_summary" },
      review: { extracted_by: "generated fixture", reviewed_by: "PENDING human review", reviewed_at: "2026-11-16" },
      status: "current",
      records: Array.from({ length: 8 }, (_, i) => ({
        id: `d${i + 1}`,
        kind: "decision" as const,
        topics: ["capacity-cost"],
        title: wide(`Decision ${i + 1}`, 100),
        chosen: fact("Chosen", 310),
        rejected: [],
        forcing_condition: fact("Forced", 120),
        rationale: null,
        worked_before: null,
        cost_paid: null,
        outcome: null,
        applies_from: null,
        aliases: ["largest card"],
        tech: ["postgres"],
      })),
    };
    return card;
  });
}
