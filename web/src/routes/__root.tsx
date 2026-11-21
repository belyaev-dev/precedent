/// <reference types="vite/client" />
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { getSiteInfo } from "../corpus/api";
import { DESCRIPTION, REPO, SITE_URL, pageHead } from "../site";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  loader: () => getSiteInfo(),
  // The star count changes slowly, so moving between pages does not ask for it again.
  staleTime: 10 * 60 * 1000,
  // A page's own head replaces the title and description here; the rest holds for every page.
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      ...pageHead("Precedent: evidence for system design", DESCRIPTION).meta,
      { property: "og:site_name", content: "Precedent" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL + matches[matches.length - 1].pathname.replace(/(.)\/$/, "$1") },
      { property: "og:image", content: `${SITE_URL}/og.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Precedent: your agent designs from memory. Give it evidence." },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: SITE_URL + matches[matches.length - 1].pathname.replace(/(.)\/$/, "$1") },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500&family=Geist+Mono:wght@400;500&display=swap" },
      { rel: "stylesheet", href: styles },
    ],
  }),
  component: Root,
  notFoundComponent: NotFound,
});

function Stars({ count }: { count: number }) {
  return (
    <span className="stars">
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16">
        <path d="M8 .9l2.2 4.5 5 .7-3.6 3.5.9 4.9L8 12.2l-4.5 2.3.9-4.9L.8 6.1l5-.7z" />
      </svg>
      <span aria-label={`${count} stars`}>{count.toLocaleString("en-GB")}</span>
    </span>
  );
}

function SiteLinks({ mark, stars = null }: { mark: boolean; stars?: number | null }) {
  // The catalogue link stays marked on a card page, which sits under it.
  const current = mark ? { "aria-current": "page" as const } : {};
  return (
    <>
      <Link to="/cards" activeProps={current}>Catalogue</Link>
      <Link to="/mcp" activeProps={current}>MCP</Link>
      <Link to="/pricing" activeProps={current}>Pricing</Link>
      <a href={REPO}>
        GitHub
        {stars !== null && <Stars count={stars} />}
      </a>
    </>
  );
}

function Document({ children }: { children: ReactNode }) {
  const { version, stars } = Route.useLoaderData();
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header className="site-header">
          <div className="bar">
            <Link className="wordmark" to="/" aria-label="precedent, home">
              precedent<span>#</span>
            </Link>
            <nav className="primary-nav" aria-label="Primary">
              <SiteLinks mark stars={stars} />
            </nav>
            <Link className="key-pill" to="/account">Get a key</Link>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="bar">
            <span>Precedent, corpus version {version}.</span>
            <nav aria-label="Footer">
              <SiteLinks mark={false} />
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
            </nav>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}

function Root() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

function NotFound() {
  return (
    <main className="page">
      <h1 className="page-title" style={{ paddingTop: 56 }}>Nothing at this address</h1>
      <p className="lede" style={{ marginTop: 20 }}>
        The <Link to="/cards">catalogue</Link> lists every record in the corpus.
      </p>
    </main>
  );
}
