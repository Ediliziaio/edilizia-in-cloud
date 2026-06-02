// Rotazione proxy per scrapare a volume senza farsi bannare.
// Imposta SCRAPER_PROXIES con una lista CSV di URL proxy, es:
//   SCRAPER_PROXIES="http://user:pass@ip1:port,http://user:pass@ip2:port"
// Se vuoto → niente proxy (va bene per volumi bassi).
import { ProxyAgent } from "undici";

const PROXIES = (process.env.SCRAPER_PROXIES || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

let cursor = 0;
const agents = new Map<string, ProxyAgent>();

/** Prossimo URL proxy (round-robin) o null se non configurato. */
export function nextProxyUrl(): string | null {
  if (PROXIES.length === 0) return null;
  const url = PROXIES[cursor % PROXIES.length];
  cursor++;
  return url;
}

/** Dispatcher undici per il prossimo proxy (cache per riuso del pool). */
export function nextDispatcher(): ProxyAgent | undefined {
  const url = nextProxyUrl();
  if (!url) return undefined;
  let a = agents.get(url);
  if (!a) { a = new ProxyAgent(url); agents.set(url, a); }
  return a;
}

/** Config proxy per Playwright (server + credenziali parse dall'URL). */
export function nextPlaywrightProxy(): { server: string; username?: string; password?: string } | undefined {
  const url = nextProxyUrl();
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const server = `${u.protocol}//${u.host}`;
    return u.username
      ? { server, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }
      : { server };
  } catch {
    return { server: url };
  }
}

export const hasProxies = PROXIES.length > 0;
