#!/usr/bin/env node
// Fetches a source page as plain text for card writing. This is the first attempt: it identifies itself and
// stops at a robots.txt refusal, an HTTP error or a page with no article in it. Each of those exits non-zero
// and names the browser fallback, scripts/fetch-browser.py, which is run by hand for that one page.
// Exit codes: 3 robots.txt, 4 HTTP error, 5 no article text.
// Usage: node scripts/fetch-source.mjs <url> <out.txt>   (out must be outside the repository)
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const USER_AGENT = "precedent-ingest";
// Agents that fetch one page because a person asked for it. A site that disallows these (or us by name,
// or every crawler) has said it does not want this kind of fetch. Rules for training-data crawlers such as
// ClaudeBot and GPTBot are a different request, about bulk collection for model training, and are not ours to claim.
const AGENTS = ["precedent-ingest", "claude-user", "chatgpt-user", "perplexity-user"];

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/fetch-source.mjs <url> <out.txt>");
  process.exit(2);
}
const root = resolve(fileURLToPath(import.meta.url), "../..");
// Resolve links on the nearest existing ancestor, so a symlinked output directory cannot point back into the repo.
function realTarget(path) {
  let dir = resolve(path);
  const rest = [];
  for (;;) {
    try {
      return [realpathSync(dir), ...rest].join(sep);
    } catch {
      rest.unshift(dir.slice(dir.lastIndexOf(sep) + 1));
      dir = dirname(dir);
    }
  }
}
if (`${realTarget(out)}${sep}`.startsWith(realpathSync(root) + sep)) {
  console.error("refusing to write source text inside the repository");
  process.exit(2);
}

// Returns the agent whose rules block the path, or null. Longest matching rule wins, as in RFC 9309.
export function blockedBy(robots, path) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (current && (field === "allow" || field === "disallow")) {
      if (value) current.rules.push({ allow: field === "allow", pattern: value });
      lastWasAgent = false;
    }
    // Any other field (Sitemap, Crawl-delay) is ignored and does not end a run of user-agent lines.
  }
  const decode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  path = decode(path);
  const matches = (pattern) => {
    pattern = decode(pattern);
    const source = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    return new RegExp(`^${source}`).test(path);
  };
  const verdict = (agent) => {
    const rules = groups.filter((g) => g.agents.includes(agent)).flatMap((g) => g.rules).filter((r) => matches(r.pattern));
    if (!rules.length) return null;
    rules.sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow));
    return rules[0].allow;
  };
  for (const agent of AGENTS) if (verdict(agent) === false) return agent;
  const named = groups.some((g) => g.agents.includes(USER_AGENT));
  return !named && verdict("*") === false ? "*" : null;
}

function toText(html) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h[1-6][^>]*>/gi, "\n\n## ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote|pre)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => entities[name.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

const FALLBACK = `If this source is still wanted, fetch that one page in a browser:\n  uvx --from camoufox python -I scripts/fetch-browser.py ${url} ${out}`;
const target = new URL(url);
const headers = { "user-agent": USER_AGENT };
const robots = await fetch(new URL("/robots.txt", target), { headers });
if (robots.ok) {
  const agent = blockedBy(await robots.text(), target.pathname + target.search);
  if (agent) {
    console.error(`${target.host} disallows this path for "${agent}" in robots.txt. Not fetched.\n${FALLBACK}`);
    process.exit(3);
  }
} else if (robots.status !== 404) {
  console.error(`could not read robots.txt (HTTP ${robots.status}). Not fetched.\n${FALLBACK}`);
  process.exit(3);
}

const page = await fetch(target, { headers });
if (!page.ok) {
  console.error(`HTTP ${page.status} for ${url}.\n${FALLBACK}`);
  process.exit(4);
}
const text = toText(await page.text());
// A page that builds its article in JavaScript answers 200 with only navigation and a footer:
// few words, or plenty of words and almost no sentences.
const wordCount = text.split(/\s+/).filter(Boolean).length;
const sentences = (text.match(/[a-z,;)]{2}[.!?]\s/g) ?? []).length;
if (wordCount < 300 || sentences * 150 < wordCount) {
  console.error(`${url} returned ${wordCount} words in ${sentences} sentences: a page shell, not the article. Nothing written.\n${FALLBACK}`);
  process.exit(5);
}
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, `${text}\n`);
console.log(`${text.length} characters written to ${out}`);
