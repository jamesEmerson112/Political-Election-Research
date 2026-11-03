/**
 * Vercel Web Analytics (`@vercel/analytics`, started in main.ts): page views on the public site
 * only, each reported as the page's address without its query string or "#" part. Routes, the
 * districts My ballot puts in the hash, votes and location stay in the browser.
 */
import type { BeforeSendEvent } from "@vercel/analytics";

/** The public site. Page views are counted only here: not on preview deployments, `npm run web`, the browser checks' server (127.0.0.1) or the claude.ai preview. */
export const ANALYTICS_HOST = "political-election-research.vercel.app";

export function analyticsOn(hostname: string): boolean {
  return hostname === ANALYTICS_HOST;
}

/** The address up to its first "?" or "#": "https://host/?a=1#overview?cd=11" -> "https://host/". */
export function pageAddress(url: string): string {
  return url.replace(/[?#].*$/s, "");
}

/** inject()'s `beforeSend`: Vercel's script hands it the full address (location.href, hash included); every event keeps the page's address only. */
export function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: pageAddress(event.url) };
}
