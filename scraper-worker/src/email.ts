// Estrazione email dal sito di un'azienda (best-effort, gratis).
import { nextDispatcher } from "./proxy.js";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const EMAIL_JUNK = /(sentry|wixpress|example\.com|\.png|\.jpe?g|\.gif|\.webp|godaddy|cloudflare|yourdomain|@2x|@sentry)/i;

async function fetchText(url: string, timeoutMs = 6000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EiC-LeadBot/1.0)" },
      // @ts-expect-error: undici dispatcher (proxy) supportato a runtime dal fetch globale Node
      dispatcher: nextDispatcher(),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function pick(html: string, domain: string): string | null {
  const found = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (e.includes("@") && !EMAIL_JUNK.test(e)) found.add(e);
  }
  for (const m of html.matchAll(EMAIL_RE)) {
    const e = m[0].trim().toLowerCase();
    if (!EMAIL_JUNK.test(e)) found.add(e);
  }
  if (!found.size) return null;
  const list = [...found];
  const same = list.find((e) => e.endsWith(`@${domain}`) || e.endsWith(`.${domain}`));
  if (same) return same;
  const prio = list.find((e) => /^(info|commerciale|amministrazione|preventivi|segreteria|contatti)@/.test(e));
  return prio || list[0];
}

export async function findEmail(website: string | null | undefined): Promise<string | null> {
  if (!website) return null;
  let base: URL;
  try {
    base = new URL(website.startsWith("http") ? website : `https://${website}`);
  } catch {
    return null;
  }
  const domain = base.hostname.replace(/^www\./, "");
  const pages = [base.href, `${base.origin}/contatti`, `${base.origin}/contatti/`, `${base.origin}/contact`];
  for (const url of pages) {
    const html = await fetchText(url);
    if (!html) continue;
    const email = pick(html, domain);
    if (email) return email;
  }
  return null;
}
