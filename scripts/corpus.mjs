// The card files and the corpus version derived from them. Shared by the skill bundle and the
// MCP server build so that both report the same version for the same cards. Node built-ins only.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** File name -> YAML text for every card in the directory, in file-name order. */
export function readCardSources(cardsDir) {
  const files = readdirSync(cardsDir).filter((f) => f.endsWith(".yaml")).sort();
  return new Map(files.map((f) => [f, readFileSync(join(cardsDir, f), "utf8")]));
}

/** Twelve hex characters that change whenever any card file is added, removed, renamed or edited. */
export function corpusVersion(sources) {
  const hash = createHash("sha256");
  for (const [name, text] of sources) hash.update(name).update("\0").update(text).update("\0");
  return hash.digest("hex").slice(0, 12);
}
