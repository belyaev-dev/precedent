---
name: precedent
description: Design or review backend systems from evidence of how real systems were built and how they failed. Use when choosing or questioning architecture - datastores, queues, caches, sharding, service boundaries, multi-tenancy, delivery guarantees, scaling plans, ADRs, design docs. Not for UI design, code-level module design, or debugging.
---

# Precedent

Asked to design a backend, a model reaches for the interview answer: a gateway, several services, a message bus, a cache, a search cluster. That design is the union of every architecture it has read about, sized for a company the user is not. This skill replaces memory with evidence: records of what real teams chose at a stated scale, what forced the choice, what the simpler setup handled before, and how things broke.

The method is in this skill. The evidence is in the Precedent corpus, which you search through the `precedent` MCP server (tools `precedent_search`, `precedent_get` and `precedent_facets`).

## Connecting the corpus

If those tools are not available, say so before designing and give the user the setup. A key is free at https://precedents.dev/account:

```bash
claude mcp add --transport http precedent https://precedents.dev/api/mcp \
  --header "Authorization: Bearer $PRECEDENT_KEY"
```

Other clients are covered at https://precedents.dev/mcp.

Without the server you still have the method and a few sample cards in [corpus/](corpus/INDEX.md). They show what a record holds and cover a handful of systems; they are not the corpus. Work through the steps below with them, look for primary sources on the web for the rest, and say in the coverage line that the corpus was not connected. Do not present a design made that way as checked against the corpus.

## The rules that matter

- **Evidence checks the engineering; it does not replace it.** Design with everything you know. The records are there to cut components the scale does not call for, to test the design against real failures, and to show which claims rest on evidence. Ordinary good practice that no record happens to cover (signing requests, validating input, timeouts, retry schedules, alerts, lease renewal for long work) still belongs in the design.
- **Fit, not minimalism.** The aim is a design that meets every stated requirement at the stated scale with nothing extra. Dropping a requirement, or making the design work by assuming the user's numbers down, is a worse failure than an extra component.
- **Numbers before design.** Establish the scale envelope first. A design without one cannot be checked against anything.
- **No unions.** Do not add up the components of several references. One reference at the user's scale is the baseline; everything else has to earn its place.
- **Every component is justified, including the obvious ones.** Each needs a requirement of this project and a record that supports it.
- **Cite records, not memory.** A claim about how real systems behave is either tied to a record id or labelled `uncited`. Do not present general knowledge as evidence.
- **Cite what the record says, not what you expect it to say.** Fetch the record in full before citing it; a search hit is never enough. Re-read the field you rely on and state it the way the card does, keeping every reason it gives and every limit it states. A citation that reverses or trims the card is worse than no citation.
- **The cards are drafts.** A record whose review line says review is pending was checked by machine only. Say so once in the coverage line.
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

Use the user's numbers exactly as given; never reduce a stated figure to make a simpler design fit, and when you must derive a number the user did not give (how many requests create a job, how many endpoints an event fans out to), choose the demanding end of the plausible range and say so. If the user gives no numbers, ask once if they are available; otherwise assume tier 0 to 1 and say so. Never assume a large system. State the envelope back in one or two lines before going on.

### 2. Research

Search with the envelope, then read before you rely on anything.

1. Call `precedent_facets` once if you do not know what the corpus covers: it lists the workloads, topics and technology tags in use, and how much of the corpus has a known scale.
2. Call `precedent_search` with the envelope's tiers (`traffic`, `data`, `team`) on every search. Search once with `kind: ["system"]` and the workload to find a baseline, then once for each real decision in front of you, by `topic` or `tech` and a few plain words. Look for failures the same way, for each component you are leaning towards.
3. Call `precedent_get` with the ids of every record you intend to use, several per call. A search hit is for triage only.

The server groups hits by how their scale relates to yours: at your scale, at a different scale, of unknown scale, floor not checked, out of envelope. Respect the groups. Only the first is evidence of what works at your size, and the response says so when that group is empty.

With only the bundled samples, read `corpus/INDEX.md` and open the card files it lists in `corpus/cards/` instead.

Look for three things:

- **A baseline:** a system of the same workload at or near the envelope's tiers. Its architecture, and its components where the record lists them, are the shape to start from. Small systems seldom publish numbers, so for a tier 0 to 2 envelope also search with `footprint: ["single-node", "single-database", "single-site"]` and treat those systems as candidates, and say that the match is by footprint, not by measured scale.
- **Decisions:** records for each real choice the task involves.
- **Failures:** records for the components you are leaning towards.

How to read a record. The field names are the ones the cards use; the server prints the same facts under the same names:

- `forcing_condition` is the measured pain, hard requirement or customer-visible gap that made the team act. It is the test for whether their decision transfers: does this project have that condition?
- `rationale` is any other reason the source gives: a goal, a preference, a cost. It explains the choice but does not show the choice was needed. A record with a rationale and no forcing condition cannot justify adding a component on its own.
- `worked_before` is the simpler setup and how far it held. It is evidence for staying simple, often at a scale above the user's.
- `applies_from` is an advisory floor. Below it, do not copy the decision.
- A scale axis of `null` means unknown, not small. Unless its footprint says otherwise, such a record never counts as "a system at my scale".
- `curator_notes`, a floor's `rationale` and a tier's `note` are the reviewer's reading, not the source's claim. Say so if you rely on one.
- `null` in a field means the source did not say. Do not fill it in.
- `aliases` and `tech` are search terms. They are not statements about the system and cannot be cited.
- In a card about a change, `worked_before` and `forcing_condition` describe the old design, and `chosen` and `outcome` the new one. Say which you mean; do not describe the old design as what the organisation runs.
- A record whose approach was tried and then removed is evidence against that approach, not a model for it. Read `outcome` and `cost_paid` before borrowing anything.
- Metrics carry a `qualifier`. A request spike is not a sustained write rate, and a test-bench figure is not a production one. Team tier 0 means up to five people, not none.

A mechanism transfers by its conditions, not by the size of the company. A large system's topology does not transfer to a small product. Its idempotency-key scheme or its bounded retry policy may, because the condition (retried requests must not double-apply) holds at any size.

If the corpus has nothing relevant, say so plainly. You may then look for primary sources on the web (the operator's own engineering post or post-mortem, not a summary) and cite them by URL, marked as outside the corpus and unreviewed.

### 3. Design

Start from the baseline's shape, or, with no baseline, from the simplest thing that meets the envelope: one deployable, one transactional database, object storage if there are files.

For each component or mechanism, record why it is there:

- **Adding something** (a queue, a cache, a second datastore, a service boundary) needs a requirement from the envelope and a record whose `forcing_condition` that requirement actually meets.
- **Staying simple** is supported by a record whose `worked_before` shows the simple setup holding at or above this scale.
- **A correctness mechanism** (idempotency, transactional outbox, restore drills) is justified by the "must never happen" list, at any scale.

If neither a record nor a hard requirement supports a component, remove it. If you keep it on general knowledge alone, mark it `uncited` in the ledger so the user can see what rests on evidence and what does not.

**Requirements pass.** Before going further, list every stated "must" and "must not", including availability requirements such as surviving the loss of a machine or zone, and name the concrete mechanism that enforces each: the constraint, the transaction boundary, the retry and recovery path, the replica arrangement. Trace what happens when a worker dies halfway through a unit of work. A requirement with no mechanism is a hole in the design; fix it now, even if that adds a component.

Give each decision a revisit trigger: the measurable condition under which it should be reopened, taken from a record's forcing condition where one exists ("revisit the single database when the primary sustains write rates near what record X reports").

### 4. Failure replay

For each component in the design, find failure records involving it and walk the design through the mechanism: with this trigger, what happens here? Mark each mitigated, accepted, or not applicable, and change the design where the answer is "the same outage". Prefer a slow or partial failure to a clean crash when choosing what to trace; that is where designs break.

Then the subtraction test: for every component the baseline did not have at this scale, confirm it still has its justification. Delete what does not.

### 5. Ledger

Write the answer in this order and with these proportions.

1. **The design, as most of the answer.** Enough for an engineer to start: the tables or keys that matter and their constraints, the main flows step by step, the concrete parameters (timeouts, retry schedule, limits, batch sizes), and the operational basics (what is alerted on, how a stuck or half-done unit of work is found and recovered). Cite a record inline, by full id, only where it shaped a choice; do not narrate the research.
2. **Failure replay**, as a short table.
3. **The decision ledger**, compact: one row for each decision that adds a component, leaves out one a reader would expect, or picks between real alternatives. Usually five to eight rows. Routine mechanisms do not need a row.

If length is limited, the ledger and the replay shrink first, and the design last.

| Decision | Requirement | Evidence | Limits of the evidence | Revisit when |
|---|---|---|---|---|

- **Evidence** is record ids written in full (`tailscale-2021-control-plane-state#d1`, never a shortened form), or `uncited`, or a URL marked `outside corpus`.
- **Limits of the evidence** names what does not transfer, in a few words: scale, workload, guarantees, team.
- Close with the corpus version the server reported and one line on coverage: which decisions had evidence at the user's scale, which had only larger-scale or unknown-scale evidence, and which had none.

Write decisions up as ADR files only when designing inside a repository that keeps them, or when asked.

## Reviewing an existing design

Same steps, in a different order: get the envelope, list the components, and ask of each what requirement and what record justifies it. Report components with no forcing condition at this scale as candidates for removal, and failure records the design does not survive.
