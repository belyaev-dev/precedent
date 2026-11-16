# Benchmark results

Each run answers ten design tasks at two sizes with and without the skill (Sonnet), and has Opus judge each pair. Scores are 0 to 3. See [README.md](README.md) for the method and its limits; in particular the judge can usually tell which answer used the skill, and nothing checks that a cited record says what the answer claims.

| Run | Corpus | Runs per brief | Word cap | Skill preferred | Components, small (skill / base) | Components, large (skill / base) | Fit | Requirements | Failures | Justification | Usable |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 13 cards | 1 | 800 | 10 of 20 | 3.1 / 5.7 | 5.6 / 9.9 | 2.95 / 2.40 | 2.65 / 2.95 | 2.95 / 2.10 | 2.85 / 2.00 | 2.05 / 3.00 |
| 2 | 13 cards | 1 | 800 | 11 of 20 | 3.8 / 5.8 | 6.0 / 10.6 | 3.00 / 2.45 | 2.80 / 2.95 | 2.80 / 2.50 | 2.95 / 1.95 | 2.15 / 3.00 |
| 3 | 28 cards | 3 | 1500 | 42 of 60 | 4.3 / 6.4 | 6.7 / 11.7 | 2.90 / 2.33 | 2.92 / 2.88 | 2.98 / 2.47 | 3.00 / 1.97 | 2.15 / 2.93 |
| 4 | 28 cards | 3 | 800 | 37 of 60 | 4.0 / 5.5 | 6.2 / 10.2 | 2.87 / 2.45 | 2.90 / 2.90 | 2.83 / 2.37 | 2.97 / 1.92 | 2.15 / 2.97 |
| 5 | 28 cards | 3 | 800 | 53 of 60 | 3.7 / 5.3 | 6.7 / 10.4 | 2.87 / 2.38 | 2.92 / 2.87 | 2.98 / 2.02 | 2.90 / 1.90 | 2.32 / 2.93 |

Criterion columns are skill / base. Runs 1, 2 and 3 are not directly comparable with one another: run 2 followed a skill change, and run 3 changed the corpus and the word cap together. Runs 4 and 5 are a like-for-like pair: same corpus, same cap, same number of runs, and only the skill differs.

## What the runs show

- **A larger corpus helped.** At an 800-word cap, preference for the with-skill answer went from about half with 13 cards (runs 1 and 2) to 37 of 60 with 28 (run 4).
- **Telling the skill that evidence checks the engineering and does not replace it helped more.** Run 5 differs from run 4 only in the skill text: the design now leads the answer with concrete parameters and recovery paths, the ledger is shorter, and ordinary good practice is kept even where no card covers it. Preference rose from 37 to 53 of 60, including 15 of 18 on the three workloads the corpus was first built around, where it had been 9 of 18 in each earlier three-run benchmark.
- **With the skill, designs have about a third fewer components** at both sizes in every run, and score higher on fit to scale, failures and justification.
- **Without the skill, answers are still rated easier to build from**: close to 3.0 in every run, against 2.15 for the skill before run 5 and 2.32 in it. The gap narrowed and did not close.
- **No answer cited a record id that is not in the corpus** in any run. Shortened ids still appear occasionally on large briefs.

## Citation audit

Ten with-skill answers from run 3 were read citation by citation against the cards: of 275 citations, 250 were faithful, 19 stretched what the card says, 5 were wrong and 1 carried no claim. The wrong ones were mix-ups, not inventions: an organisation's old design described as its new one, a cost credited to the wrong record, two stated reasons cut to one. The skill's citation rules were tightened afterwards (run 5); the audit has not been repeated since.

## Caveats

- One judge model, not blind to which answer used the skill, and the same judge in every run. A different judge, or people, might weigh buildability against justification differently.
- The jump between runs 4 and 5 is large for a wording change. It should be reproduced before much is built on it.
