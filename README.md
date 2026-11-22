# precedent

Evidence for system design. Precedent is a corpus of short, source-checked records of how real systems were built and how they failed, an MCP server that lets a coding agent search it, and a skill that makes the agent consult that evidence before it designs a backend. The website is [precedents.dev](https://precedents.dev).

It exists because agents design from memory, and memory produces the interview answer: a gateway, five services, a message bus, a cache and a search cluster, whatever the product's actual load. Precedent aims to give the agent something better to reason from: what a team at a comparable scale chose, what forced the choice, what the simpler setup handled before that, and what broke.

> **Status: pilot.** The corpus holds a first batch of draft cards. Each was extracted by a model from its source and checked against that source by a second model and by script, but **none has yet been reviewed by a person**; every card says so in its `review` block. Treat them as leads to verify, not as settled fact. The skill, the server and the website are first versions. See [Roadmap](#roadmap).

## Using it

Get a free API key at [precedents.dev/account](https://precedents.dev/account) and connect the MCP server:

```bash
claude mcp add --transport http precedent https://precedents.dev/api/mcp \
  --header "Authorization: Bearer $PRECEDENT_KEY"
```

Then install the skill, which holds the method the agent follows:

```bash
npx skills add belyaev-dev/precedent
```

Other clients, the tools and the limits are described at [precedents.dev/mcp](https://precedents.dev/mcp). The corpus can also be read on the website, in the [catalogue](https://precedents.dev/cards).

## Where the corpus is

This repository holds the tools, the schema, the server, the website and a few sample cards in [`cards/`](cards/). The corpus itself is kept in a private repository and is reached through the server and the website, not from here. When cards change there, a workflow validates them with the scripts in this repository, compiles them and uploads the result to a private bucket that the server and the website read. Nothing needs to be redeployed.

## How it is organised

A **card** is one YAML file; the samples in [`cards/`](cards/) are real ones. It describes one system at one point in time, as reported by one public source: its overall architecture, and optionally its main components and what each is for. A source that covers several periods or scales becomes one card per period. Each card holds up to eight **records**, and the record is what an agent retrieves and cites:

- A **decision** record: what was chosen, what was rejected, the measured pain that forced the choice, any other reason the source gives, the simpler setup that worked before, the cost paid, and the outcome.
- A **failure** record: the trigger, the mechanism that turned it into an outage, why the defences did not hold, the impact, and the fix.

Records are cited as `<card id>#<record id>`, for example `acme-2023-orders#d1`. Ids are permanent. Because a card can be corrected, every export and search result will carry the corpus version (the git commit), and a citation that has to stay checkable should include it.

There is no "patterns" collection. A model already knows what CQRS is; what it lacks is evidence of when a team needed it. Pattern names appear only as search tags on records.

The format is defined in [`schema/card.schema.json`](schema/card.schema.json), the controlled terms in [`schema/vocabulary.md`](schema/vocabulary.md), and there is a synthetic example in [`schema/examples/`](schema/examples/acme-2023-orders.yaml).

### Scale

Sources report scale in numbers that cannot be compared directly (monthly users, requests per second, terabytes), so each card carries three ordinal tiers assigned at review, alongside the raw numbers exactly as the source gives them. Each tier says whether it follows from a stated number or is the reviewer's estimate, and is left empty when the source supports neither. Team means the engineers who build and operate that system; a company-wide headcount gives a team tier only when the whole company fits in the lowest one. A lower bound such as one table's size gives no data tier, unless it already lies above the top tier's floor. Traffic is load on the operator's own system: what a third-party CDN absorbed is recorded as context, not as a tier.

| Tier | Traffic (peak per second) | Data (stored state) | Team (engineers) |
|---|---|---|---|
| 0 | under 10 | under 10 GB | up to 5 |
| 1 | under 100 | under 100 GB | up to 15 |
| 2 | under 1,000 | under 1 TB | up to 50 |
| 3 | under 10,000 | under 10 TB | up to 150 |
| 4 | under 100,000 | under 100 TB | over 150 |
| 5 | 100,000 or more | 100 TB or more | |

A decision record may also carry `applies_from`, an advisory floor below which the decision should not be copied. A floor is either stated by the source, in which case the card keeps the exact threshold and where it is stated, or it is the reviewer's judgment with a written rationale. The scale a system happened to run at is never treated as a floor on its own, and some records (idempotent delivery, restore testing) have no floor at all.

Small systems rarely publish numbers at all; what their authors do say is "one VM" or "a single database". So a card also records the **footprint** the source states: single node, single database, single site, partitioned, or multi-region. For a small system that is often the only size signal there is, and it is what makes boring setups findable.

Many post-mortems give no scale figures. Their records are still searchable; they are returned in a separate group labelled as unknown scale, never as a match for the caller's tier.

### What a card may contain

- Our own wording of the facts a source reports. Every fact field carries its own locator (section heading, page, or timestamp) so it can be checked.
- Numbers exactly as the source states them. Nothing back-calculated.
- The reviewer's own reading only in fields labelled as the reviewer's: `curator_notes`, the rationale of a judgment floor, and the note on an estimated tier.
- `null` where the source is silent. Gaps are never filled from general knowledge.

A card never contains the source's prose, diagrams, code, or quotes beyond a few words, and it is kept short enough that it points to the source instead of replacing it. Failure records about a production system are written only from the operator's own account. The one exception is a controlled experiment, such as a fault-injection test, where the tester's report is the primary source.

## The pieces

**Skill.** The method the agent follows:

1. Work out the scale envelope (peak traffic, data size, team size, required guarantees) before searching. With no numbers given, assume a small system.
2. Search for records at that envelope. One reference at the caller's tier is the baseline to compare against.
3. Every component in the design must be justified, including those the baseline has, by a requirement of this project (a number, a guarantee, an operating constraint) and a record. Adding a component needs a record whose forcing condition that requirement meets. Staying simple is justified by a record whose `worked_before` shows the simpler setup holding at this scale. References are not unioned.
4. A mechanism is accepted or rejected by whether its conditions transfer, not by the size of the company that reported it. A larger system's topology does not transfer to a small one; its idempotency scheme may.
5. Before presenting a design, search failures for each chosen component and walk the design through them.
6. Emit a decision ledger: choice, requirement, citations, where the evidence does not transfer, the simpler alternative, and the revisit trigger.

The skill carries the method and the sample cards. It reaches the corpus through the MCP server, and says so when the server is not connected.

**MCP server.** A read-only endpoint with a small tool surface: one search across records (query, kind, scale envelope, topic, workload, tech, footprint), one batched fetch of full records, and one description of what the corpus covers. Search separates results that fall outside the caller's envelope and reports honestly when the corpus has nothing at that scale. No model runs at request time.

**Website.** The catalogue, a page per card, accounts and API keys.

## How it runs

Two Cloudflare Workers, declared together in [`web/alchemy.run.ts`](web/alchemy.run.ts):

- **The website**, in [`web/`](web/): a [TanStack Start](https://tanstack.com/start) app at precedents.dev. It holds accounts ([Better Auth](https://better-auth.com) on D1, with GitHub and magic-link sign-in), one API key per user and a monthly count of tool calls. Its `/api/mcp` route is the public MCP address: it checks the key, counts the call, passes the request on and records the call.
- **The MCP engine**, in [`mcp/`](mcp/): the search and the three tools. It has no public address and is reachable only from the website's Worker.

Both read the compiled corpus from the private `precedent-corpus` R2 bucket about once a minute, and fall back to the sample cards bundled at build time. Card text reaches a browser only through the website's server, never in its JavaScript. The sample cards are readable by anyone; every other card is shown in full to a signed-in reader and as an outline to everyone else.

- Three read-only tools: `precedent_search`, `precedent_get` (up to eight records or systems per call) and `precedent_facets`.
- Search groups hits as at the caller's scale, at a different scale, of unknown scale, floor not checked, or out of envelope, and reports the count in each group. A card with no tier on an axis the caller gave is never a match for that tier.
- Every result carries a ready citation, each fact's locator, "not stated in the source" for gaps, the card's review status and the corpus version. Withdrawn ids resolve to a notice.

Tool parameters, example responses, limits and measurements are in [`mcp/README.md`](mcp/README.md). Plan limits are in [`web/src/site.ts`](web/src/site.ts).

### Who uses it

- **Visitors**: Cloudflare Web Analytics on the zone, declared in the stack. No cookies; pages, referrers and countries are in the Cloudflare dashboard.
- **Accounts and calls**: every tool call is recorded in D1 against the key's account, with the tool, the search's words and filters (or the ids fetched), how many records matched and the client's user agent. Rows are deleted after 90 days. [precedents.dev/privacy](https://precedents.dev/privacy) says so to users, and must be changed with the code.
- **The usage page**, `/admin`: accounts, keys in use, calls per day, the clients that call, the most searched queries, and the searches that found nothing or nothing at the caller's scale. It is open to the GitHub accounts listed as `ADMIN_GITHUB_IDS` in [`web/alchemy.run.ts`](web/alchemy.run.ts), signed in with GitHub; to anyone else it is a 404.
- **A daily email** to those accounts at 06:00 UTC with the previous day's numbers, sent by the website Worker's cron trigger, which also deletes the rows past their keeping time.
- **Whether it is up**: the [`live`](.github/workflows/live.yml) workflow asks the site and the MCP address every half hour, and GitHub emails the repository's owner when a run fails. With a key in the repository's `PRECEDENT_KEY` secret it also checks a keyed request.
- **Errors**: both Workers write to Workers Logs.

## Corrections and removal

If a card misstates its source, is out of date, or you are the publisher and want it removed, open an issue. Removal requests from publishers are honoured without argument.

- **Corrections** keep the card and record ids.
- **Reversals**, where an organisation later reports undoing a decision, do not delete the old record. It stays as history with a pointer to the newer one.
- **Withdrawn cards** are reduced to a tombstone holding only the id, the date and the reason, so an old citation resolves to "withdrawn" instead of to nothing. The summary is removed from the corpus the server and the website serve. For a sample card, it is also removed from this repository and the skill bundle; copies already installed cannot be recalled.

## Roadmap

1. **Review.** Have a person read each card against its source, starting with one workload.
2. **Benchmark over the server.** The results in [`bench/`](bench/) measured the skill reading cards from disk. Run the same briefs with the skill searching through the MCP server.
3. **Corpus.** Grow by workload shape, deep before wide.
4. **Pro plan.** Higher limits, and private cards: a team's own decision records and post-mortems searched beside the corpus.

## Contributing

Cards are written under the rules in [CONTRIBUTING.md](CONTRIBUTING.md). The corpus is not open to pull requests; suggest a source or report a mistake in an issue.

## Development

```bash
npm install
npm run check      # validates the sample cards and the skill bundle

# Writing a card: fetch the source text to a file outside the repo, then check the card against it.
node scripts/fetch-source.mjs <url> /tmp/precedent-sources/<card-id>.txt
node scripts/check-source.mjs <path>/<card-id>.yaml /tmp/precedent-sources/<card-id>.txt
```

`check-source` confirms that every number in a card, and every `Section:` or `Near:` locator, appears in the source text. Page and timestamp locators are not checked. It catches invented figures and misplaced citations; it cannot tell whether a sentence means what the card says, which is what human review is for.

The engine has its own package and tests:

```bash
cd mcp && npm ci && npm test
```

The website runs locally with everything it needs, and no Cloudflare login. Run these inside `web/`; Alchemy is installed there and its CLI fails from the repository root.

```bash
cd web && npm install
npm run dev                # http://localhost:4173, serving the sample cards
npm run typecheck
npm run cloudflare-login   # once, before the first deploy; opens the browser
npm run deploy             # both Workers, the database, the bucket and the domain
```

In local development sign-in emails are not sent; each one is written to `web/.alchemy/local/email/`. The GitHub button appears when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set in `web/.env`.

To compile a directory of cards into the two files the Workers read, as the private repository's workflow does:

```bash
node scripts/compile-corpus.mjs --cards <dir> --out <dir>   # writes index.json and cards.json
```

## Licence

Code is under the [MIT licence](LICENSE). The sample cards in `cards/` and in the skill bundle are under [CC BY 4.0](LICENSE-cards); attribute them as "Precedent contributors" with a link to this repository. The rest of the corpus is not published here and is not under an open licence. Cards summarise third-party sources, which remain the property of their publishers; a licence covers our wording, not theirs.
