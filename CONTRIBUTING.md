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

That is the first attempt. The script identifies itself honestly and stops, writing nothing, in three cases: `robots.txt` disallows the path (exit 3), the site answers with an HTTP error (exit 4), or the page comes back as navigation with no article in it (exit 5). Each time it prints the fallback, which fetches that one page in a real browser:

```bash
uvx --from camoufox python -I scripts/fetch-browser.py <url> /tmp/precedent-sources/<card-id>.txt
```

The fallback is for one page that a person has chosen to write a card from. It is never used to crawl a site, and never for a source whose publisher has reserved rights against summarising, reuse or AI use in the page or its terms, or publishes under a no-derivatives licence: drop those, however they were reachable. Say in the pull request which sources came through the browser and why. Source text never goes in the repository.

Open the saved file and make sure it is the whole article: it ends where the article ends, not at a sign-in prompt. `check-source.mjs` rejects a saved page that is only a shell.

Read the whole saved file before writing anything. Every fact in a card comes from that text, never from memory or a search snippet.

## Writing

- **`components`** lists the main parts of the system and what each is for, as the source describes them: at most ten, each with its own locator. List what the source presents as the system's parts, not every technology it mentions.
- **Our own words.** No copied sentences, and no quotation beyond a few words.
- **Numbers exactly as stated.** Never computed, converted or rounded. "Millions of jobs" with no figure is not a metric. A range ("between 10 minutes and 2 hours") is not its upper end: name the metric as the maximum, or leave it in the fact. Write IP addresses, CIDR ranges and version numbers as the source does; the checker reads them as names.
- **Hedges stay.** "We believe", "likely", "may have", "our hypothesis" and "approximately" are part of the fact. A cause the authors guess at is written as their guess, and a risk they anticipated is not something that happened to them.
- **`null` when the source is silent.** An empty `rejected` list and null `forcing_condition`, `worked_before`, `cost_paid` and `outcome` are normal. Do not fill them from general knowledge.
- **`forcing_condition` or `rationale`.** A measured pain, a hard requirement, or a gap customers could see is a forcing condition. A design goal, a preference, a wish to save money, a risk the team reasoned about, or a property of the design is a rationale. Most mistakes in drafts are goals filed as forcing conditions; when in doubt it is a rationale and `forcing_condition` is null.
- **`rejected` is what the source says was weighed.** The setup being replaced goes in `worked_before`, not in `rejected`. An alternative you can infer from the reasons given, or one the source raises only as a question a reader might ask, was not considered.
- **`worked_before` says how far the simpler setup held.** A bare description of the earlier setup is fine; "it worked well" is not, unless the source says so. If the earlier setup served something different (a personal tool, an experiment), say that.
- **`cost_paid` is a price the team reports paying for this choice.** Steps of the implementation, skills learned beforehand, and advice to readers are not costs.
- **Outcomes are things that happened.** A plan, a hope, or the authors' verdict on their own work is not an outcome. Attribute a self-assessment as the authors' own, or leave it out. An outcome belongs to the decision it followed from; a result of the whole system goes on the record for the whole system.
- **A failure's `fix` separates done from intended.** Completed changes first, then work under way after "In progress:", then intentions after "Planned:".
- **A failure record is an incident that happened.** A class of recurring incidents with no dates is still a failure record, worded as recurring. A risk is not.
- **A later update is not hidden.** When the page carries a note that the system was since replaced, sold or shut down, put it in `later_update` and write the card in the past tense. When the page shows only a last-updated date, give it as `published` and say so in `source.published_note`. When it prints no date at all, give the year of the earliest dated thing on the page (a reader's comment, a dated chart) and say in the note that the date is inferred and from what.
- **`curator_notes` hold the reviewer's reading only.** A fact from the source goes in a fact field with a locator, never in a note.
- **`tech` names what a component is built on.** An in-house service that talks to Redis is not `redis`; leave `tech` out.
- **General lessons are not this organisation's experience.** If a post says "watch out for account limits" without saying the team hit them, it is not a cost they paid.
- **Test-bench numbers are not production numbers.** Say which in the metric's `qualifier` and in the fact.
- **`org` as the source names it.** If the source never names the organisation, say so; do not infer it from the author's biography.
- **Locators that can be checked:** `Section: <heading exactly as written>`, or `Near: <up to eight consecutive words from the passage>`. If a heading appears twice, use `Near:`.
- **A locator covers the whole fact.** When a fact draws on more than one passage, name each, up to three, joined by ` | `: `Section: Background | Near: twelve nodes with a replica factor`. Do not cut a true detail to fit one locator, and do not leave part of a fact resting on a passage the locator does not name. A fact that needs more than three passages is two facts.
- **One post, several incidents.** A monthly availability report or a multi-incident review becomes one card per incident that the post describes in enough detail, sharing the source URL, each with `Near:` locators into its own section.

### Scale

- Set a tier only when a stated number supports that exact axis: peak per-second traffic on this system, its total stored state, the engineers who build and operate it.
- A daily count may support an `estimated` traffic tier, with a `note`, only when the arithmetic lands clearly inside one tier.
- A bound that could sit in more than one tier supports none: one table's size, one migration's volume below the top tier, a company-wide headcount above five.
- A bound that lies wholly inside an end tier pins it, as `estimated` with a `note`: a lower bound above the top tier's floor (1.5 PB moved in one migration is data tier 5; "hundreds of billions of events a day" is traffic tier 5), or an upper bound within tier 0 (a company with four backend engineers is team tier 0).
- Traffic is load on the operator's own system in normal service. Requests a third-party CDN absorbed, and a one-off abuse spike, are context: record them as metrics tagged `other`, with the boundary in the `qualifier`.
- Data counts each stored item once. When the source gives only on-disk volume across replicas, set a tier only if the replicated and the unreplicated reading land in the same tier.
- A total across a fleet (twelve clusters, every instance) is the system's figure only when the card's system is that fleet; say "total across ..." in the `qualifier`.
- The tier is for the card's own system. A monitoring service's card does not take the traffic of the system it watches; that figure is context, tagged `other`.
- A metric tagged with an axis supports that axis's tier. A number about traffic, data or people that supports no tier is tagged `other`.
- Fill `footprint` whenever the source states the deployed shape. For a small system it is often the only size signal. The shape has to be stated, not inferred from where the system is hosted. `single-site` covers several machines in one place that split no dataset; several clusters are `partitioned` only when the source says one dataset is divided among them.
- `applies_from` is null unless the source states a threshold, or there is a reason beyond "it ran at this scale".

## Checking

Cards are kept in the private corpus repository, cloned beside this one. Check a card with this repository's scripts:

```bash
node scripts/validate.mjs ../precedent-cards/cards
node scripts/check-source.mjs ../precedent-cards/cards/<card-id>.yaml /tmp/precedent-sources/<card-id>.txt
```

A few cards are also published here in `cards/` as samples. After changing one, run `npm run bundle` to refresh the copy inside the skill, then `npm run check`.

`check-source.mjs` fails a card when a number, an address or a locator is not in the saved source, when the saved source is a page shell, and when a fact carries twelve or more consecutive words of the source. Never weaken a true fact or edit the saved source to get a pass. If the source does not support a fact, remove the fact. If the checker is wrong about a true fact, fix the checker and say so in the pull request; do not reword the fact around it.

### The second read

The scripts cannot tell whether a fact is filed in the right field or says more than the source does. So every card is then read against its source by someone who did not write it, or by a model from a different family than the one that drafted it, before the pull request is opened. The reader goes field by field and asks of each fact: does the source say this, about this system, in this period? They report each problem as wrong (the source contradicts it), unsupported (the source does not say it) or questionable, and the fixes are applied and the scripts rerun. What the second read most often finds:

- a goal, a risk or a property of the design filed as a `forcing_condition`;
- a guess or a hedge in the source written as plain fact;
- the status quo listed as a `rejected` alternative;
- a number attached to the wrong thing (a whole-incident duration given as the length of one phase);
- an outcome that is the authors' verdict, or that belongs to a different record;
- a locator that supports only part of its fact;
- a vocabulary term chosen for the company, not for what the record is about.

## Feeding in batches

A feed is a list of leads worked through to cards. Leads come from link lists, newsletters and channels, which are used to find sources and never as sources.

- **Every lead ends in the ledger.** The corpus repository keeps `leads.tsv`: one row per URL with its outcome (`carded`, `deferred`, `dropped`), the card id or the reason, and the date. Check it before fetching, so nothing is fetched twice, and add a row for every lead you fetch.
- **There is no batch size.** A lead that qualifies gets a card. "The batch was full" and "five stronger leads were in hand" are not reasons: a qualifying lead you cannot finish now is `deferred` with what it would add, and the next feed starts from the deferred rows.
- **`dropped` needs a reason that is about the source:** not a primary account, too thin to support one record, the same system and period as an existing card, rights reserved, unreachable by either fetcher. A missing scale figure is not a reason; most post-mortems have none and are still wanted.
- **A pull request holds what one person can review:** up to about five cards. A feed with more qualifying leads opens more than one pull request; it does not write fewer cards.
- **Each pull request says** which facts the writer is least sure of, which sources came through the browser, what the second read found and what was changed for it, and where the format did not fit the source. A format that does not fit is fixed in the schema or the scripts, in this repository, before the next feed.

## Review

A card drafted by a model carries `reviewed_by: PENDING human review` until a person has read it against the source and put their name there. Open a pull request per batch in the corpus repository and say in it which facts you are least sure of. Merging it publishes the cards: a workflow there compiles them and uploads the result for the server and the website to read.
