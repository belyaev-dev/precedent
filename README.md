# precedent

Evidence for system design. Precedent is a corpus of short, reviewed records of how real systems were built and how they failed, plus an agent skill that makes a coding agent consult that evidence before it designs a backend.

It exists because agents design from memory, and memory produces the interview answer: a gateway, five services, a message bus, a cache and a search cluster, whatever the product's actual load. Precedent aims to give the agent something better to reason from: what a team at a comparable scale chose, what forced the choice, what the simpler setup handled before that, and what broke.

> **Status: pilot.** The corpus holds a first batch of draft cards. Each was extracted by a model from its source and checked against that source by a second model and by script, but **none has yet been reviewed by a person**; every card says so in its `review` block. Treat them as leads to verify, not as settled fact. The skill is a first version, and no server is deployed. See [Roadmap](#roadmap).

## How it is organised

A **card** is one YAML file in [`cards/`](cards/). It describes one system at one point in time, as reported by one public source. A source that covers several periods or scales becomes one card per period. Each card holds up to eight **records**, and the record is what an agent retrieves and cites:

- A **decision** record: what was chosen, what was rejected, the measured pain that forced the choice, any other reason the source gives, the simpler setup that worked before, the cost paid, and the outcome.
- A **failure** record: the trigger, the mechanism that turned it into an outage, why the defences did not hold, the impact, and the fix.

Records are cited as `<card id>#<record id>`, for example `acme-2023-orders#d1`. Ids are permanent. Because a card can be corrected, every export and search result will carry the corpus version (the git commit), and a citation that has to stay checkable should include it.

There is no "patterns" collection. A model already knows what CQRS is; what it lacks is evidence of when a team needed it. Pattern names appear only as search tags on records.

The format is defined in [`schema/card.schema.json`](schema/card.schema.json), the controlled terms in [`schema/vocabulary.md`](schema/vocabulary.md), and there is a synthetic example in [`schema/examples/`](schema/examples/acme-2023-orders.yaml).

### Scale

Sources report scale in numbers that cannot be compared directly (monthly users, requests per second, terabytes), so each card carries three ordinal tiers assigned at review, alongside the raw numbers exactly as the source gives them. Each tier says whether it follows from a stated number or is the reviewer's estimate, and is left empty when the source supports neither. Team means the engineers who build and operate that system; a company-wide headcount does not give a team tier. Neither does a lower bound such as one table's size give a data tier.

| Tier | Traffic (peak per second) | Data (stored state) | Team (engineers) |
|---|---|---|---|
| 0 | under 10 | under 10 GB | up to 5 |
| 1 | under 100 | under 100 GB | up to 15 |
| 2 | under 1,000 | under 1 TB | up to 50 |
| 3 | under 10,000 | under 10 TB | up to 150 |
| 4 | under 100,000 | under 100 TB | over 150 |
| 5 | 100,000 or more | 100 TB or more | |

A decision record may also carry `applies_from`, an advisory floor below which the decision should not be copied. A floor is either stated by the source, in which case the card keeps the exact threshold and where it is stated, or it is the reviewer's judgment with a written rationale. The scale a system happened to run at is never treated as a floor on its own, and some records (idempotent delivery, restore testing) have no floor at all.

Small systems rarely publish numbers at all; what their authors do say is "one VM" or "a single database". So a card also records the **footprint** the source states: single node, single database, partitioned, or multi-region. For a small system that is often the only size signal there is, and it is what makes boring setups findable.

Many post-mortems give no scale figures. Their records are still searchable; they are returned in a separate group labelled as unknown scale, never as a match for the caller's tier.

### What a card may contain

- Our own wording of the facts a source reports. Every fact field carries its own locator (section heading, page, or timestamp) so it can be checked.
- Numbers exactly as the source states them. Nothing back-calculated.
- The reviewer's own reading only in fields labelled as the reviewer's: `curator_notes`, the rationale of a judgment floor, and the note on an estimated tier.
- `null` where the source is silent. Gaps are never filled from general knowledge.

A card never contains the source's prose, diagrams, code, or quotes beyond a few words, and it is kept short enough that it points to the source instead of replacing it. Failure records about a production system are written only from the operator's own account. The one exception is a controlled experiment, such as a fault-injection test, where the tester's report is the primary source.

## Planned pieces

**Skill.** The method the agent follows:

1. Work out the scale envelope (peak traffic, data size, team size, required guarantees) before searching. With no numbers given, assume a small system.
2. Search for records at that envelope. One reference at the caller's tier is the baseline to compare against.
3. Every component in the design must be justified, including those the baseline has, by a requirement of this project (a number, a guarantee, an operating constraint) and a record. Adding a component needs a record whose forcing condition that requirement meets. Staying simple is justified by a record whose `worked_before` shows the simpler setup holding at this scale. References are not unioned.
4. A mechanism is accepted or rejected by whether its conditions transfer, not by the size of the company that reported it. A larger system's topology does not transfer to a small one; its idempotency scheme may.
5. Before presenting a design, search failures for each chosen component and walk the design through them.
6. Emit a decision ledger: choice, requirement, citations, where the evidence does not transfer, the simpler alternative, and the revisit trigger.

The skill ships with a copy of the cards so it works with no server.

**MCP server.** A read-only, unauthenticated endpoint on Cloudflare Workers with a small tool surface: one search across records (query, kind, scale envelope, topic, workload, tech) and one batched fetch of full records. Search separates results that fall outside the caller's envelope and reports honestly when the corpus has nothing at that scale. No model runs at request time.

**Static corpus.** The full corpus is also published as a single file, so nobody needs to scrape the endpoint and the skill has a fallback when the endpoint's daily quota runs out.

## Sources

Primary sources only: engineering posts by the organisation that runs the system, operators' own post-mortems, peer-reviewed systems papers, and independent test reports. Link lists such as `danluu/post-mortems` and `awesome-scalability` are used to find sources, not as sources. Interview-preparation material, secondary summaries, and vendor reference architectures are out of scope for now.

A card restates facts in our own words and stores none of the source's expression. A source is not used at all when its publisher has said it does not want that: a no-derivatives licence, terms that forbid summarising or reuse, an explicit reservation of rights against AI use of the content, or a direct request. Where a card does lean on a source's licence, that licence must allow republishing an adaptation under CC BY 4.0, which share-alike and non-commercial licences do not.

A site whose `robots.txt` blocks AI crawlers is never fetched by this project's tooling. A person may still read such a post in their own browser and write a card from it by hand, like any other reader. [`scripts/fetch-source.mjs`](scripts/fetch-source.mjs) enforces the first half: it identifies itself honestly and refuses when `robots.txt` disallows it or the common AI crawlers. Fetched text is kept outside the repository and is never committed.

Each card records when its facts were true, when the source was published, when it was retrieved, and who reviewed it, or that review is still pending.

## Corrections and removal

If a card misstates its source, is out of date, or you are the publisher and want it removed, open an issue. Removal requests from publishers are honoured without argument.

- **Corrections** keep the card and record ids.
- **Reversals**, where an organisation later reports undoing a decision, do not delete the old record. It stays as history with a pointer to the newer one.
- **Withdrawn cards** are reduced to a tombstone holding only the id, the date and the reason, so an old citation resolves to "withdrawn" instead of to nothing. The summary is removed from the current corpus and from every later export and skill bundle; copies already installed cannot be recalled. It remains in git history unless the publisher asks for that to be rewritten too.

## Roadmap

1. **Pilot.** About twenty records for three workload shapes, at least a third of them from small systems. Run fixed design briefs with and without the skill and with plain web research, and compare component count, uncited decisions, and whether each citation says what the design claims. If the cards do not change the designs, fix the format before writing more.
2. **Server.** Put the same cards behind the Worker; measure CPU per request and database rows read to choose between a bundled index and D1.
3. **Corpus.** Grow by workload shape, deep before wide.

## Contributing

Cards are written under the rules in [CONTRIBUTING.md](CONTRIBUTING.md). Source suggestions are welcome as issues.

## Development

```bash
npm install
npm run validate   # checks every card in cards/ and schema/examples/

# Writing a card: fetch the source text to a file outside the repo, then check the card against it.
node scripts/fetch-source.mjs <url> /tmp/precedent-sources/<card-id>.txt
node scripts/check-source.mjs cards/<card-id>.yaml /tmp/precedent-sources/<card-id>.txt
```

`check-source` confirms that every number in a card, and every `Section:` or `Near:` locator, appears in the source text. Page and timestamp locators are not checked. It catches invented figures and misplaced citations; it cannot tell whether a sentence means what the card says, which is what human review is for.

## Licence

Code is under the [MIT licence](LICENSE). Cards are under [CC BY 4.0](LICENSE-cards); attribute them as "Precedent contributors" with a link to this repository. Cards summarise third-party sources, which remain the property of their publishers; the licence covers our wording, not theirs.
