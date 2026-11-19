# Benchmark

Does the skill produce better system designs than the same model without it? This asks ten ordinary design tasks, each at a small and a large size, with and without the skill, and has a second model judge each pair.

The with-skill arm reads the skill and searches the corpus through the MCP endpoint, as an installed agent would. It needs a key from [precedents.dev/account](https://precedents.dev/account) and spends that key's calls: about seven per answer.

```bash
export PRECEDENT_KEY=prc_...
node bench/run.mjs                      # all tasks, both sizes, one run each
node bench/run.mjs --runs 3             # three runs per brief and arm
node bench/run.mjs --tasks chat,rate-limiter --sizes small
node bench/run.mjs --runner bb          # run each call as a bb thread instead of the claude CLI
```

Tasks are in [`tasks.yaml`](tasks.yaml). Results are written to `bench/results/<timestamp>/`: every answer, `answers.json`, `verdicts.json`, and `summary.md`.

## What is measured

- **Judge scores**, 0 to 3, on five criteria: fit to the stated scale, requirements met, failures handled, justification, and usability. The judge sees the two answers in random order and names the one it prefers.
- **Component count** per answer, from a `COMPONENTS:` line each answer must end with. This is the direct check on over-building: compare the count at the small size across arms.
- **Citations**: how many records an answer cites, how many ids it shortened, and how many match nothing in the corpus. Ids are checked against the cards in `--cards <dir>`; without it only the sample cards in this repository are known, so ids from the rest of the corpus are reported as unmatched.
- Results are split by size and by whether the corpus has cards for the task's workload, so "the skill helps" can be told apart from "the skill helps where it has evidence".

## Limits

- The judge is a model, and it is not fully blind: answers written with the skill usually cite record ids.
- Nothing checks that a cited record says what the answer claims. Read a sample by hand.
- One run per brief is noisy. Use `--runs 3` or more before drawing conclusions.
- The tasks are our own wording of common design exercises. They test design judgment, not the corpus's coverage of any real system.
