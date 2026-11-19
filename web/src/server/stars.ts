import { REPO } from "../site";

const HOUR = 60 * 60 * 1000;
let known: { stars: number | null; at: number } | undefined;

// The repository's star count, asked of GitHub at most once an hour per Worker instance.
// GitHub allows few unauthenticated requests, so a failed lookup keeps the last count, or shows none.
export async function repoStars() {
  if (known && Date.now() - known.at < HOUR) return known.stars;
  let stars = known?.stars ?? null;
  try {
    const response = await fetch(REPO.replace("https://github.com/", "https://api.github.com/repos/"), {
      headers: { accept: "application/vnd.github+json", "user-agent": "precedents.dev" },
    });
    if (response.ok) stars = ((await response.json()) as { stargazers_count: number }).stargazers_count;
  } catch {
    // Keep the last count.
  }
  known = { stars, at: Date.now() };
  return stars;
}
