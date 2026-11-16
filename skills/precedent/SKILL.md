---
name: precedent
description: Design or review backend systems from evidence of how real systems were built and how they failed. Use when choosing or questioning architecture - datastores, queues, caches, sharding, service boundaries, multi-tenancy, delivery guarantees, scaling plans, ADRs, design docs. Not for UI design, code-level module design, or debugging.
---

# Precedent

Asked to design a backend, a model reaches for the interview answer: a gateway, several services, a message bus, a cache, a search cluster. That design is the union of every architecture it has read about, sized for a company the user is not. This skill replaces memory with evidence: records of what real teams chose at a stated scale, what forced the choice, what the simpler setup handled before, and how things broke.

The evidence ships with this skill in `corpus/`. Start with [corpus/INDEX.md](corpus/INDEX.md).

## The rules that matter

- **Numbers before design.** Establish the scale envelope first. A design without one cannot be checked against anything.
- **No unions.** Do not add up the components of several references. One reference at the user's scale is the baseline; everything else has to earn its place.
- **Every component is justified, including the obvious ones.** Each needs a requirement of this project and a record that supports it.
- **Cite records, not memory.** A claim about how real systems behave is either tied to a record id or labelled `uncited`. Do not present general knowledge as evidence.
- **Cite what the record says, not what you expect it to say.** Before relying on a record for a causal claim, re-read the field you are citing and state it the way the card does. A citation that reverses the card is worse than no citation.
- **The cards are drafts.** A card whose `review.reviewed_by` says review is pending was checked by machine only. Say so once in the coverage line.
- **Say when the corpus is silent.** It is small. "No record at this scale" is a finding to report, not a gap to paper over with a poorly matched card.

## Workflow

Scale the effort and the length to the task. A new system gets all five steps. A single question ("should this job go in a queue?") gets steps 1, 2 and a short ledger. Do not produce design documents nobody asked for.

### 1. Envelope

Write down, with the user's numbers where they exist:

- peak requests or events per second, and the read/write split if it matters
- stored data now and in about a year
- engineers who will build and operate it
- what must never happen (lost payment, duplicate charge, cross-tenant read) and what may (a late email)
- hard constraints: existing stack, hosting, budget, deadline

Map the first three to tiers:

| Tier | Traffic (peak per second) | Data (stored) | Team (engineers) |
|---|---|---|---|
| 0 | under 10 | under 10 GB | up to 5 |
| 1 | under 100 | under 100 GB | up to 15 |
| 2 | under 1,000 | under 1 TB | up to 50 |
| 3 | under 10,000 | under 10 TB | up to 150 |
| 4 | under 100,000 | under 100 TB | over 150 |
| 5 | 100,000 or more | 100 TB or more | |

If the user gives no numbers, ask once if they are available; otherwise assume tier 0 to 1 and say so. Never assume a large system. State the envelope back in one or two lines before going on.

### 2. Research

Read `corpus/INDEX.md` in full; it is one line per record. Pick the records whose workload and topics match the decisions in front of you, then open their card files in `corpus/cards/` and read the whole record before using it. The index line is for triage only.

Look for three things:

- **A baseline:** a system of the same workload at or near the envelope's tiers. Its `architecture` is the shape to start from. Small systems seldom publish numbers, so for a tier 0 to 2 envelope also treat records whose Shape is `single-node` or `single-database` as candidates, and say that the match is by footprint, not by measured scale.
- **Decisions:** records for each real choice the task involves.
- **Failures:** records for the components you are leaning towards.

How to read a record:

- `forcing_condition` is the measured pain, hard requirement or customer-visible gap that made the team act. It is the test for whether their decision transfers: does this project have that condition?
- `rationale` is any other reason the source gives: a goal, a preference, a cost. It explains the choice but does not show the choice was needed. A record with a rationale and no forcing condition cannot justify adding a component on its own.
- `worked_before` is the simpler setup and how far it held. It is evidence for staying simple, often at a scale above the user's.
- `applies_from` is an advisory floor. Below it, do not copy the decision.
- A scale axis of `null` means unknown, not small. Unless its footprint says otherwise, such a record never counts as "a system at my scale".
- `curator_notes`, a floor's `rationale` and a tier's `note` are the reviewer's reading, not the source's claim. Say so if you rely on one.
- `null` in a field means the source did not say. Do not fill it in.

A mechanism transfers by its conditions, not by the size of the company. A large system's topology does not transfer to a small product. Its idempotency-key scheme or its bounded retry policy may, because the condition (retried requests must not double-apply) holds at any size.

If the corpus has nothing relevant, say so plainly. You may then look for primary sources on the web (the operator's own engineering post or post-mortem, not a summary) and cite them by URL, marked as outside the corpus and unreviewed.

### 3. Design

Start from the baseline's shape, or, with no baseline, from the simplest thing that meets the envelope: one deployable, one transactional database, object storage if there are files.

For each component or mechanism, record why it is there:

- **Adding something** (a queue, a cache, a second datastore, a service boundary) needs a requirement from the envelope and a record whose `forcing_condition` that requirement actually meets.
- **Staying simple** is supported by a record whose `worked_before` shows the simple setup holding at or above this scale.
- **A correctness mechanism** (idempotency, transactional outbox, restore drills) is justified by the "must never happen" list, at any scale.

If neither a record nor a hard requirement supports a component, remove it. If you keep it on general knowledge alone, mark it `uncited` in the ledger so the user can see what rests on evidence and what does not.

Give each decision a revisit trigger: the measurable condition under which it should be reopened, taken from a record's forcing condition where one exists ("revisit the single database when the primary sustains write rates near what record X reports").

### 4. Failure replay

For each component in the design, find failure records involving it and walk the design through the mechanism: with this trigger, what happens here? Mark each mitigated, accepted, or not applicable, and change the design where the answer is "the same outage". Prefer a slow or partial failure to a clean crash when choosing what to trace; that is where designs break.

Then the subtraction test: for every component the baseline did not have at this scale, confirm it still has its justification. Delete what does not.

### 5. Ledger

End with the decision ledger. This table is the deliverable that makes the design checkable; keep it even when the rest of the answer is short.

| Decision | Requirement it serves | Evidence | Where the evidence does not transfer | Simpler alternative | Revisit when |
|---|---|---|---|---|---|

- **Evidence** is record ids (`card-id#d1`), or `uncited`, or a URL marked `outside corpus`.
- **Where the evidence does not transfer** names the differences that matter: scale, workload, guarantees, team.
- Close with the corpus version from the index and one line on coverage: which decisions had evidence at the user's scale, which had only larger-scale or unknown-scale evidence, and which had none.

Write decisions up as ADR files only when designing inside a repository that keeps them, or when asked.

## Reviewing an existing design

Same steps, in a different order: get the envelope, list the components, and ask of each what requirement and what record justifies it. Report components with no forcing condition at this scale as candidates for removal, and failure records the design does not survive.
