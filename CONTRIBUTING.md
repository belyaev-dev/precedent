# Writing cards

A card makes claims about a named organisation's system, in public. The rules below exist so that every claim can be traced to the source and none goes beyond it. Read the field descriptions in [`schema/card.schema.json`](schema/card.schema.json) and the terms in [`schema/vocabulary.md`](schema/vocabulary.md) first; this page covers what they cannot.

## Choosing a source

- **Primary only.** A post by the people who built or operate the system, wherever it is published, or the operator's own post-mortem. Not a summary, an interview-preparation article, or product marketing.
- **Three kinds of source are all wanted:** a plain account of how a production system is built; a migration post ("why we moved from X to Y"), which reports what forced the change and what worked before; and a post-mortem. An architecture overview with no drama in it is a perfectly good card: fill `architecture` and `components`, and record each choice the post explains as a decision, with its reason in `rationale`.
- **Small systems matter most.** A two-person team on one database is the evidence the corpus is shortest on. A source that states a small number outright (jobs per day, requests per second, people on the team) is worth more than another account of a system at vast scale.
- **One card, one period.** If a post covers two eras at different scale, write a card for the one it is mainly about, or two cards sharing the source URL.

## Getting the text

```bash
node scripts/fetch-source.mjs <url> /tmp/precedent-sources/<card-id>.txt
```

The script identifies itself honestly and refuses when `robots.txt` disallows all crawlers, this tool by name, or the agents AI assistants use to fetch a page for a user. Rules aimed only at training-data crawlers are not a refusal. When it refuses, or the request fails, do not fetch the page any other way: no other user agent, no stealth browser, no cache or archive copy. A person may open the page in their own browser and save the text to that path by hand. Source text never goes in the repository.

Read the whole saved file before writing anything. Every fact in a card comes from that text, never from memory or a search snippet.

## Writing

- **`components`** lists the main parts of the system and what each is for, as the source describes them: at most ten, each with its own locator. List what the source presents as the system's parts, not every technology it mentions.
- **Our own words.** No copied sentences, and no quotation beyond a few words.
- **Numbers exactly as stated.** Never computed, converted or rounded. "Millions of jobs" with no figure is not a metric.
- **`null` when the source is silent.** An empty `rejected` list and null `forcing_condition`, `worked_before`, `cost_paid` and `outcome` are normal. Do not fill them from general knowledge.
- **`forcing_condition` or `rationale`.** A measured pain, a hard requirement, or a gap customers could see is a forcing condition. A design goal, a preference, or a wish to save money is a rationale. Most mistakes in drafts are goals filed as forcing conditions.
- **Outcomes are things that happened.** A plan, a hope, or the authors' verdict on their own work is not an outcome. Attribute a self-assessment as the authors' own, or leave it out. A failure's `fix` begins with "Planned:" when the source reports an intention.
- **General lessons are not this organisation's experience.** If a post says "watch out for account limits" without saying the team hit them, it is not a cost they paid.
- **Test-bench numbers are not production numbers.** Say which in the metric's `qualifier` and in the fact.
- **`org` as the source names it.** If the source never names the organisation, say so; do not infer it from the author's biography.
- **Locators that can be checked:** `Section: <heading exactly as written>`, or `Near: <up to eight consecutive words from the passage>`. Point at the passage that supports the fact. If a heading appears twice, use `Near:`.

### Scale

- Set a tier only when a stated number supports that exact axis: peak per-second traffic on this system, its total stored state, the engineers who build and operate it.
- A daily count may support an `estimated` traffic tier, with a `note`, only when the arithmetic lands clearly inside one tier.
- A company-wide headcount, one table's size, or a test harness's load supports no tier.
- Fill `footprint` whenever the source states the deployed shape. For a small system it is often the only size signal.
- `applies_from` is null unless the source states a threshold, or there is a reason beyond "it ran at this scale".

## Checking

Cards are kept in the private corpus repository, cloned beside this one. Check a card with this repository's scripts:

```bash
node scripts/validate.mjs ../precedent-cards/cards
node scripts/check-source.mjs ../precedent-cards/cards/<card-id>.yaml /tmp/precedent-sources/<card-id>.txt
```

A few cards are also published here in `cards/` as samples. After changing one, run `npm run bundle` to refresh the copy inside the skill, then `npm run check`.

Never weaken a true fact or edit the saved source to get a pass. If the source does not support a fact, remove the fact.

Then have someone who did not write the card, or a different model, read it against the source field by field and ask of each fact: does the source say this, about this system, in this period?

## Review

A card drafted by a model carries `reviewed_by: PENDING human review` until a person has read it against the source and put their name there. Open a pull request per batch in the corpus repository and say in it which facts you are least sure of. Merging it publishes the cards: a workflow there compiles them and uploads the result for the server and the website to read.
