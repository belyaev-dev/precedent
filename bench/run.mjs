#!/usr/bin/env node
// Runs the benchmark: each design task, at each size, answered with and without the skill, then judged.
// Usage: node bench/run.mjs [--tasks id,id] [--sizes small,large] [--runs N] [--model M] [--judge M] [--parallel N] [--runner claude|bb] [--words N]
// --runner claude (default) needs a logged-in `claude` CLI. --runner bb runs each call as a throwaway bb thread,
// for machines where Claude is reached through bb. Results go to bench/results/<timestamp>/ (not committed).
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const skillDir = join(root, "skills/precedent");
const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const config = parse(readFileSync(join(root, "bench/tasks.yaml"), "utf8"));
const taskIds = flag("tasks", config.tasks.map((t) => t.id).join(",")).split(",");
const sizes = flag("sizes", "small,large").split(",");
const runs = Number(flag("runs", "1"));
const model = flag("model", "sonnet");
const judgeModel = flag("judge", "opus");
const parallel = Number(flag("parallel", "4"));
const runner = flag("runner", "claude");
const words = Number(flag("words", "800"));
const outDir = join(root, "bench/results", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(outDir, { recursive: true });

const ENDING = `Do not ask questions; where a number is missing, state your assumption. Keep the answer under ${words} words.
End with one final line that starts with "COMPONENTS:" and lists every infrastructure component in your design, separated by semicolons: each deployable service, datastore, queue, cache, and external service. List nothing you rejected.`;
const ARMS = {
  base: (brief) => `Answer from your own knowledge. Do not use tools, files, skills or the web.\n\n${brief}\n\n${ENDING}`,
  skill: (brief) => `Read the skill at ${skillDir}/SKILL.md and follow it for this request. Its corpus is in the corpus/ directory beside it. Read files only inside that skill directory; do not use the web or any other skill.\n\n${brief}\n\n${ENDING}`,
};

const run = promisify(execFile);
const BB_MODELS = { sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5", haiku: "claude-haiku-5-5", fable: "claude-fable-5-2" };

// One call as a throwaway bb thread in an empty directory. Tools cannot be switched off here, so the
// prompts carry the restriction. Cost is not reported.
async function viaBb(prompt, { useModel }) {
  const dir = mkdtempSync(join(tmpdir(), "precedent-bench-"));
  writeFileSync(join(dir, "prompt.txt"), prompt);
  let id;
  try {
    const spawned = await run("bb", ["thread", "spawn", "--project", process.env.BB_PROJECT_ID, "--environment", dir, "--provider", "claude-code", "--model", BB_MODELS[useModel] ?? useModel, "--permission-mode", "full", "--parent-notifications", "off", ...(process.env.BB_THREAD_ID ? ["--parent-self"] : []), "--title", "precedent bench", "--prompt-file", join(dir, "prompt.txt"), "--json"]);
    id = JSON.parse(spawned.stdout).id;
    await run("bb", ["thread", "wait", id, "--timeout", "20m"]);
    const { stdout } = await run("bb", ["thread", "output", id], { maxBuffer: 16 * 1024 * 1024 });
    return { text: stdout.trim(), cost: 0, error: stdout.trim() ? null : "empty output" };
  } catch (err) {
    return { text: "", cost: 0, error: String(err.stderr || err.message).slice(0, 400) };
  } finally {
    if (id) await run("bb", ["thread", "archive", id]).catch(() => {});
  }
}

// Runs in an empty directory with skills and MCP servers off, so both arms see the same bare assistant.
function claude(prompt, options) {
  if (runner === "bb") return viaBb(prompt, options);
  const { useModel, tools, addDir } = options;
  const args = ["-p", "--model", useModel, "--output-format", "json", "--no-session-persistence", "--disable-slash-commands", "--strict-mcp-config", "--tools", tools];
  if (tools) args.push("--allowedTools", tools);
  if (addDir) args.push("--add-dir", addDir);
  return new Promise((done) => {
    const child = spawn("claude", args, { cwd: mkdtempSync(join(tmpdir(), "precedent-bench-")), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(out);
        done({ text: parsed.result ?? "", cost: parsed.total_cost_usd ?? 0, error: parsed.is_error ? parsed.result : null });
      } catch {
        done({ text: "", cost: 0, error: (err || out).slice(0, 400) });
      }
    });
    child.stdin.end(prompt);
  });
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(parallel, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]);
      }
    }),
  );
  return results;
}

const briefs = [];
for (const task of config.tasks.filter((t) => taskIds.includes(t.id))) {
  for (const size of sizes) {
    const envelope = config.sizes[size].replace(/\{(\w+)\}/g, (_, key) => task[size][key]);
    briefs.push({ id: `${task.id}.${size}`, task: task.id, size, covered: task.covered, brief: `${task.ask}\n\n${envelope}` });
  }
}

// --- Subject runs ---
const jobs = briefs.flatMap((b) => Object.keys(ARMS).flatMap((arm) => Array.from({ length: runs }, (_, run) => ({ ...b, arm, run }))));
console.log(`${briefs.length} briefs x ${Object.keys(ARMS).length} arms x ${runs} run(s) = ${jobs.length} answers, model ${model}, runner ${runner}`);
const knownRecords = new Set();
for (const file of readdirSync(join(skillDir, "corpus/cards"))) {
  const card = parse(readFileSync(join(skillDir, "corpus/cards", file), "utf8"));
  for (const record of card.records ?? []) knownRecords.add(`${card.id}#${record.id}`);
}
const answers = await pool(jobs, async (job) => {
  const isSkill = job.arm === "skill";
  const res = await claude(ARMS[job.arm](job.brief), { useModel: model, tools: isSkill ? "Read,Glob,Grep" : "", addDir: isSkill ? skillDir : null });
  const componentsLine = res.text.split("\n").reverse().find((l) => /^\**COMPONENTS:/i.test(l.trim())) ?? "";
  const components = componentsLine.replace(/^\**COMPONENTS:\**/i, "").split(";").map((s) => s.trim()).filter(Boolean);
  const cited = [...new Set(res.text.match(/[a-z0-9]+(?:-[a-z0-9]+)*#[df][0-9]{1,2}/g) ?? [])];
  // An id shortened to a unique prefix ("workos#f1") still points at one record; anything else is unknown.
  const resolves = (c) => [...knownRecords].filter((k) => k.endsWith(c.slice(c.indexOf("#"))) && k.startsWith(c.slice(0, c.indexOf("#")))).length === 1;
  const notExact = cited.filter((c) => !knownRecords.has(c));
  const answer = { ...job, ...res, words: res.text.split(/\s+/).length, components, cited, citedShortened: notExact.filter(resolves), citedUnknown: notExact.filter((c) => !resolves(c)) };
  writeFileSync(join(outDir, `${job.id}.${job.arm}.${job.run}.md`), res.text || `ERROR: ${res.error}`);
  process.stdout.write(res.error ? "x" : ".");
  return answer;
});
console.log();

// --- Judging: each skill answer against the base answer of the same brief and run, order randomised ---
const RUBRIC = `Score each answer from 0 to 3 on each criterion:
- fit: the design is proportionate to the stated load, data size and team. Penalise components the stated numbers do not call for, and penalise a design too thin for them.
- requirements: every stated "must" and "must not" is met by a concrete mechanism.
- failures: specific ways the design breaks are named, with what happens and how it is handled.
- justification: each component is tied to a stated requirement or to specific evidence; claims the answer cannot support are marked as such, not asserted.
- usable: an engineer could start building from it; it is clear and not padded.
Judge the engineering, not the format. An answer is not better for citing sources unless the citations make its reasoning more checkable, and not worse for lacking them unless it asserts things it does not support.`;
const pairs = answers.filter((a) => a.arm === "skill" && !a.error).map((skill) => ({ skill, base: answers.find((b) => b.arm === "base" && b.id === skill.id && b.run === skill.run) })).filter((p) => p.base && !p.base.error);
const verdicts = await pool(pairs, async ({ skill, base }) => {
  const skillFirst = Math.random() < 0.5;
  const [x, y] = skillFirst ? [skill, base] : [base, skill];
  const prompt = `You are judging two answers to the same system design request.\n\n<request>\n${skill.brief}\n</request>\n\n<answer_X>\n${x.text}\n</answer_X>\n\n<answer_Y>\n${y.text}\n</answer_Y>\n\n${RUBRIC}\n\nReply with only a JSON object, no prose and no code fence:\n{"X": {"fit": n, "requirements": n, "failures": n, "justification": n, "usable": n}, "Y": {...same keys...}, "preferred": "X" or "Y" or "tie", "reason": "one sentence"}`;
  const res = await claude(prompt, { useModel: judgeModel, tools: "" });
  process.stdout.write(res.error ? "x" : ".");
  try {
    const v = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    const side = skillFirst ? { skill: "X", base: "Y" } : { skill: "Y", base: "X" };
    return { id: skill.id, run: skill.run, size: skill.size, covered: skill.covered, skill: v[side.skill], base: v[side.base], preferred: v.preferred === "tie" ? "tie" : v.preferred === side.skill ? "skill" : "base", reason: v.reason, cost: res.cost };
  } catch {
    return { id: skill.id, run: skill.run, error: res.error ?? "unparseable verdict" };
  }
});
console.log();

// --- Summary ---
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (n) => (Number.isNaN(n) ? "-" : n.toFixed(2));
const good = verdicts.filter((v) => !v.error);
const criteria = ["fit", "requirements", "failures", "justification", "usable"];
const lines = [`# Benchmark ${outDir.split("/").pop()}`, "", `Subject model ${model}, judge ${judgeModel}, ${runs} run(s) per brief and arm, answers capped at ${words} words, ${good.length} judged pairs.`, ""];
const slices = { all: () => true, "small briefs": (v) => v.size === "small", "large briefs": (v) => v.size === "large", "corpus covers the workload": (v) => v.covered, "corpus does not cover it": (v) => !v.covered };
lines.push("| Slice | Pairs | Skill preferred | Base preferred | Tie | " + criteria.map((c) => `${c} (skill / base)`).join(" | ") + " |", "|---|---|---|---|---|" + criteria.map(() => "---").join("|") + "|");
for (const [name, keep] of Object.entries(slices)) {
  const vs = good.filter(keep);
  if (!vs.length) continue;
  const count = (p) => vs.filter((v) => v.preferred === p).length;
  lines.push(`| ${name} | ${vs.length} | ${count("skill")} | ${count("base")} | ${count("tie")} | ` + criteria.map((c) => `${fmt(mean(vs.map((v) => v.skill[c])))} / ${fmt(mean(vs.map((v) => v.base[c])))}`).join(" | ") + " |");
}
lines.push("", "| Arm | Size | Answers | Mean components | Mean words | Records cited | Ids shortened | Ids not in corpus |", "|---|---|---|---|---|---|---|---|");
for (const arm of Object.keys(ARMS)) {
  for (const size of sizes) {
    const as = answers.filter((a) => a.arm === arm && a.size === size && !a.error);
    lines.push(`| ${arm} | ${size} | ${as.length} | ${fmt(mean(as.filter((a) => a.components.length).map((a) => a.components.length)))} | ${fmt(mean(as.map((a) => a.words)))} | ${fmt(mean(as.map((a) => a.cited.length)))} | ${as.reduce((n, a) => n + a.citedShortened.length, 0)} | ${as.reduce((n, a) => n + a.citedUnknown.length, 0)} |`);
  }
}
const failed = answers.filter((a) => a.error).length + verdicts.filter((v) => v.error).length;
const cost = answers.reduce((n, a) => n + a.cost, 0) + good.reduce((n, v) => n + (v.cost ?? 0), 0);
lines.push("", `Failed calls: ${failed}.${runner === "claude" ? ` Reported cost: $${cost.toFixed(2)}.` : ""}`, "", "The judge is not fully blind: answers written with the skill usually cite record ids, which identifies them.");
writeFileSync(join(outDir, "answers.json"), JSON.stringify(answers.map(({ text, ...rest }) => rest), null, 2));
writeFileSync(join(outDir, "verdicts.json"), JSON.stringify(verdicts, null, 2));
writeFileSync(join(outDir, "summary.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
console.log(`\nResults in ${outDir}`);
