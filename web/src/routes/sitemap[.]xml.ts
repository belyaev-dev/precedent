import { createFileRoute } from "@tanstack/react-router";
import { corpus } from "../corpus/store.server";
import { SITE_URL } from "../site";

// Every public page: the fixed ones and one per card. Card ids are lower-case letters, digits and hyphens, so need no escaping.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { cards } = await corpus();
        const pages = ["/", "/cards", "/mcp", "/pricing", "/privacy", "/terms", ...cards.map((card) => `/cards/${card.id}`)];
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
          .map((page) => `  <url><loc>${SITE_URL}${page === "/" ? "" : page}</loc></url>`)
          .join("\n")}\n</urlset>\n`;
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
