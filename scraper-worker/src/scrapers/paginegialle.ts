// Scraper Pagine Gialle via cheerio (HTTP, niente browser → economicissimo).
// Nota: i selettori dei portali cambiano nel tempo; sono difensivi + fallback
// su JSON-LD. Vanno ritoccati se il sito cambia markup (vedi README).
import * as cheerio from "cheerio";
import { findEmail } from "../email.js";
import { nextDispatcher } from "../proxy.js";

export interface Business {
  business_name: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  source: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function getHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9" },
      // @ts-expect-error: undici dispatcher (proxy a rotazione) supportato a runtime da Node fetch
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

function fromJsonLd($: cheerio.CheerioAPI): Business[] {
  const out: Business[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const arr = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const node of arr) {
        const types = ([] as string[]).concat(node["@type"] || []);
        if (types.some((t) => /LocalBusiness|Organization|Store/i.test(t)) && node.name) {
          out.push({
            business_name: String(node.name).trim(),
            phone: node.telephone ? String(node.telephone) : null,
            website: node.url && !/paginegialle/i.test(node.url) ? String(node.url) : null,
            email: node.email ? String(node.email).toLowerCase() : null,
            address: node.address
              ? [node.address.streetAddress, node.address.postalCode, node.address.addressLocality].filter(Boolean).join(", ")
              : null,
            city: node.address?.addressLocality || null,
            region: node.address?.addressRegion || null,
            source: "internal_paginegialle",
          });
        }
      }
    } catch {
      /* ignore malformed ld+json */
    }
  });
  return out;
}

function fromDom($: cheerio.CheerioAPI): Business[] {
  const out: Business[] = [];
  // Selettori difensivi: prova diversi container noti di PagineGialle.
  const items = $('.search-itm, .vcard, [itemtype*="LocalBusiness"], div.list-element');
  items.each((_, el) => {
    const $el = $(el);
    const name = $el.find('.search-itm__rag-soc, .org, h2 a, .item-title, [itemprop="name"]').first().text().trim();
    if (!name) return;
    const phone = $el.find('.search-itm__phone, .tel, [itemprop="telephone"], a[href^="tel:"]').first().text().trim()
      || $el.find('a[href^="tel:"]').first().attr("href")?.replace("tel:", "") || null;
    let website = $el.find('a.search-itm__ctaWeb, a.url, a[href^="http"]:contains("sito"), [itemprop="url"]').first().attr("href") || null;
    if (website && /paginegialle/i.test(website)) website = null;
    const address = $el.find('.search-itm__adr, .adr, [itemprop="address"]').first().text().replace(/\s+/g, " ").trim() || null;
    out.push({
      business_name: name,
      phone: phone || null,
      website,
      email: null,
      address,
      city: null,
      region: null,
      source: "internal_paginegialle",
    });
  });
  return out;
}

export async function scrapePagineGialle(opts: {
  keyword: string; city: string; max: number; withEmails: boolean;
  onProgress?: (n: number) => void | Promise<void>;
}): Promise<Business[]> {
  const { keyword, city, max, withEmails, onProgress } = opts;
  const slug = (s: string) => encodeURIComponent(s.trim().toLowerCase().replace(/\s+/g, "-"));
  const seen = new Set<string>();
  const results: Business[] = [];
  // scala le pagine col target (≈15 risultati/pagina) → migliaia possibili
  const maxPages = Math.min(80, Math.ceil(max / 15) + 1);

  for (let page = 1; page <= maxPages && results.length < max; page++) {
    const url = `https://www.paginegialle.it/ricerca/${slug(keyword)}/${slug(city)}${page > 1 ? `/p-${page}` : ""}`;
    const html = await getHtml(url);
    if (!html) break;
    const $ = cheerio.load(html);
    let batch = fromJsonLd($);
    if (batch.length === 0) batch = fromDom($);
    if (batch.length === 0) break;
    for (const b of batch) {
      const key = (b.phone || b.business_name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (!b.city) b.city = city;
      results.push(b);
      if (results.length >= max) break;
    }
    if (onProgress) await onProgress(results.length);
    await new Promise((r) => setTimeout(r, 800)); // gentile
  }

  // arricchimento email dal sito (concorrenza limitata)
  if (withEmails) {
    const targets = results.filter((b) => b.website && !b.email);
    let i = 0;
    const workers = Array.from({ length: 5 }, async () => {
      while (i < targets.length) {
        const b = targets[i++];
        b.email = await findEmail(b.website);
      }
    });
    await Promise.all(workers);
  }
  return results.slice(0, max);
}
