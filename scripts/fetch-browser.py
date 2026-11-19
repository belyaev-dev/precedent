"""Fetches one source page as plain text in a real browser (Camoufox), for a page fetch-source.mjs could not get:
a robots.txt refusal, an HTTP block, or a page that only renders its article with JavaScript.
One page, for a source a person has chosen to write a card from. Never used to crawl a site.
Usage: uvx --from camoufox python -I scripts/fetch-browser.py <url> <out.txt>   (out must be outside the repository)
"""
import sys, pathlib
from camoufox.sync_api import Camoufox

if len(sys.argv) != 3:
    sys.exit("usage: uvx --from camoufox python -I scripts/fetch-browser.py <url> <out.txt>")
url, out = sys.argv[1], pathlib.Path(sys.argv[2]).resolve()
if pathlib.Path(__file__).resolve().parents[1] in out.parents:
    sys.exit("refusing to write source text inside the repository")
with Camoufox(headless=True, i_know_what_im_doing=True) as browser:
    page = browser.new_page()
    page.goto(url, timeout=60000, wait_until="domcontentloaded")
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
    text = page.evaluate(
        """() => {
          const words = e => e.innerText.split(/\s+/).length;
          const body = document.body;
          const best = [...document.querySelectorAll('article, main, [role=main]')].sort((a, b) => words(b) - words(a))[0];
          return (best && words(best) > 0.4 * words(body) ? best : body).innerText;
        }"""
    )
    title = page.title()
if len(text.split()) < 300:
    sys.exit(f"only {len(text.split())} words extracted; page probably did not load")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(f"{title}\n{url}\n\n{text}\n")
print(f"{len(text.split())} words -> {out}")
