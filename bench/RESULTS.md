# Benchmark results

Each run answers ten design tasks at two sizes with and without the skill (Sonnet), and has Opus judge each pair. Scores are 0 to 3. See [README.md](README.md) for the method and its limits; in particular the judge can usually tell which answer used the skill, and nothing checks that a cited record says what the answer claims.

| Run | Corpus | Runs per brief | Word cap | Skill preferred | Components, small (skill / base) | Components, large (skill / base) | Fit | Requirements | Failures | Justification | Usable |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 13 cards | 1 | 800 | 10 of 20 | 3.1 / 5.7 | 5.6 / 9.9 | 2.95 / 2.40 | 2.65 / 2.95 | 2.95 / 2.10 | 2.85 / 2.00 | 2.05 / 3.00 |
| 2 | 13 cards | 1 | 800 | 11 of 20 | 3.8 / 5.8 | 6.0 / 10.6 | 3.00 / 2.45 | 2.80 / 2.95 | 2.80 / 2.50 | 2.95 / 1.95 | 2.15 / 3.00 |
| 3 | 28 cards | 3 | 1500 | 42 of 60 | 4.3 / 6.4 | 6.7 / 11.7 | 2.90 / 2.33 | 2.92 / 2.88 | 2.98 / 2.47 | 3.00 / 1.97 | 2.15 / 2.93 |

Criterion columns are skill / base. Run 2 followed a change to the skill that requires a mechanism for every stated requirement. Run 3 changed the corpus size and the word cap together, so it does not show which of the two moved the preference.

## What holds across all three runs

- With the skill, designs have about a third to two fifths fewer components at both sizes, and score higher on fit to scale, failures and justification.
- Without the skill, answers score close to the maximum on "usable to build from"; with it, about 2.1. Raising the word cap did not close this gap.
- No answer cited a record id that is not in the corpus.

## Open questions

- In run 3 the skill was preferred in 9 of 18 pairs on the three tasks whose workloads the corpus was first built around (webhook delivery, background jobs, multi-tenant data) and in 33 of 42 on the rest. The same pattern appeared in run 1 and not in run 2. It is not explained.
- Both arms exceeded the word cap in run 3 (about 1,950 and 1,690 words on average).
