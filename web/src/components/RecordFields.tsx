import type { ReactNode } from "react";
import type { AppliesFrom, CardRecord, Fact } from "../corpus/types";
import { Cite } from "./Cite";

// Lower bound of each tier, in the README's units.
const FLOOR = {
  traffic_tier: ["", "10", "100", "1,000", "10,000", "100,000"].map((n) => `${n} requests/s at peak`),
  data_tier: ["", "10 GB", "100 GB", "1 TB", "10 TB", "100 TB"].map((n) => `${n} stored`),
  team_tier: ["", "5", "15", "50", "150"].map((n) => `${n} engineers`),
};

// One fact with the place in the source where it is stated.
export function FactLine({ text, locator, lead }: { text: ReactNode; locator?: string; lead?: string }) {
  return (
    <div>
      <p>
        {lead && <span className="strong">{lead} </span>}
        {text}
      </p>
      {locator && <p className="locator">{locator}</p>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const single = (label: string, fact: Fact | null) =>
  fact && (
    <Field label={label}>
      <FactLine text={fact.text} locator={fact.locator} />
    </Field>
  );

function Floor({ from }: { from: AppliesFrom }) {
  const axes = Object.keys(FLOOR) as (keyof typeof FLOOR)[];
  const levels = axes.filter((axis) => (from[axis] ?? 0) > 0).map((axis) => FLOOR[axis][from[axis]!]);
  return (
    <Field label="Applies from">
      <FactLine
        lead={levels.length ? `From ${levels.join(", ")}.` : undefined}
        text={from.threshold ?? from.rationale ?? ""}
        locator={from.basis === "source_stated" ? from.locator : "The reviewer's judgment, not the source's claim"}
      />
    </Field>
  );
}

// `brief` leaves out the reviewer's additions, for the landing page's example.
export function RecordFields({ record, brief = false, children }: { record: CardRecord; brief?: boolean; children?: ReactNode }) {
  return (
    <dl className="fields">
      {record.kind === "decision" ? (
        <>
          {single("Chosen", record.chosen)}
          {record.rejected.length > 0 && (
            <Field label="Rejected">
              {record.rejected.map((r) => (
                <FactLine key={r.option} lead={`${r.option}.`} text={r.reason} locator={r.locator} />
              ))}
            </Field>
          )}
          {single("What forced it", record.forcing_condition)}
          {!brief && single("Reasoning", record.rationale)}
          {single("What worked before", record.worked_before)}
          {single("Cost", record.cost_paid)}
          {single("Outcome", record.outcome)}
          {!brief && record.applies_from && <Floor from={record.applies_from} />}
          {record.reversed_by && (
            <Field label="Reversed by">
              <FactLine text={<Cite cite={record.reversed_by} />} />
            </Field>
          )}
        </>
      ) : (
        <>
          {single("Trigger", record.trigger)}
          {single("How it failed", record.mechanism)}
          {single("Why defences did not hold", record.why_defences_failed)}
          {single("Impact", record.impact)}
          {single("Fix", record.fix)}
        </>
      )}
      {!brief && (record.curator_notes?.length ?? 0) > 0 && (
        <Field label="Reviewer's notes">
          {record.curator_notes!.map((note) => (
            <FactLine key={note} text={note} locator="The reviewer's reading, not the source's claim" />
          ))}
        </Field>
      )}
      {children}
    </dl>
  );
}
