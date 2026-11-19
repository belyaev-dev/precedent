"""Fetches one source page as plain text in a real browser (Camoufox), for a page fetch-source.mjs could not get:
a robots.txt refusal, an HTTP block, or a page that only renders its article with JavaScript.
One page, for a source a person has chosen to write a card from. Never used to crawl a site.
Usage: uvx --from camoufox python -I scripts/fetch-browser.py <url> <out.txt>   (out must be outside the repository)
"""
import pathlib, re, sys
from urllib.parse import urlparse
from camoufox.sync_api import Camoufox

if len(sys.argv) != 3:
    sys.exit("usage: uvx --from camoufox python -I scripts/fetch-browser.py <url> <out.txt>")
url, out = sys.argv[1], pathlib.Path(sys.argv[2]).resolve()
if pathlib.Path(__file__).resolve().parents[1] in out.parents:
    sys.exit("refusing to write source text inside the repository")
with Camoufox(headless=True, i_know_what_im_doing=True) as browser:
    page = browser.new_page()
    response = page.goto(url, timeout=60000, wait_until="domcontentloaded")
    if response is not None and response.status >= 400:
        sys.exit(f"HTTP {response.status} for {url}; nothing written")
    # A retired article often redirects to a home page; the article's own name must survive the redirect.
    segments = [part for part in urlparse(url).path.split("/") if part]
    slug = re.sub(r"\.html?$", "", segments[-1]).lower() if segments else ""
    if slug and slug not in urlparse(page.url).path.lower():
        sys.exit(f"{url} redirected to {page.url}, which is not the same article; nothing written")
    page.wait_for_timeout(4000)
    # Long posts load their later sections as the reader reaches them: walk to the bottom until the page stops growing.
    height = 0
    for _ in range(40):
        page.mouse.wheel(0, 2500)
        page.wait_for_timeout(350)
        grown = page.evaluate("() => document.documentElement.scrollHeight")
        at_bottom = page.evaluate("() => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5")
        if at_bottom and grown == height:
            break
        height = grown
    # Headings are marked as fetch-source.mjs marks them, so "Section:" locators work on either fetcher's output.
    # A table of contents repeats every heading; its links are dropped so each heading appears once.
    text = page.evaluate(
        r"""() => {
          const words = e => e.innerText.split(/\s+/).length;
          const body = document.body;
          const best = [...document.querySelectorAll('article, main, [role=main]')].sort((a, b) => words(b) - words(a))[0];
          const root = best && words(best) > 0.4 * words(body) ? best : body;
          const headings = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')];
          const titles = new Set(headings.map(h => h.innerText.trim()).filter(Boolean));
          for (const a of root.querySelectorAll('a[href^="#"]')) {
            if (titles.has(a.innerText.trim()) && !a.closest('h1, h2, h3, h4, h5, h6')) a.remove();
          }
          for (const h of headings) if (h.innerText.trim()) h.prepend(document.createTextNode('## '));
          return root.innerText;
        }"""
    )
    title = page.title()
word_count = len(text.split())
sentences = len(re.findall(r"[a-z,;)]{2}[.!?]\s", text))
if word_count < 300 or sentences * 150 < word_count:
    sys.exit(f"{word_count} words in {sentences} sentences extracted: a page shell or an error page, not the article; nothing written")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(f"{title}\n{url}\n\n{text}\n")
print(f"{len(text.split())} words -> {out}")
