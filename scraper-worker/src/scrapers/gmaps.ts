// Scraper Google Maps via Playwright (browser headless) — è ciò che fa Apify.
// ⚠️ Scrapare Maps "grezzo" viola i ToS di Google; usalo a tuo rischio e con
// volumi bassi. I selettori di Google cambiano spesso → ritoccare se rompe.
import { chromium, type Browser } from "playwright";
import { findEmail } from "../email.js";
import { nextPlaywrightProxy } from "../proxy.js";
import type { Business } from "./paginegialle.js";

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

export interface GBusiness extends Business {
  place_id: string | null;
  rating: number | null;
  reviews_count: number | null;
  lat: number | null;
  lng: number | null;
}

export async function scrapeGmaps(opts: {
  keyword: string; city: string; max: number; withEmails: boolean;
}): Promise<GBusiness[]> {
  const { keyword, city, max, withEmails } = opts;
  const browser = await getBrowser();
  const proxy = nextPlaywrightProxy(); // rotazione proxy (undefined se non configurato)
  const ctx = await browser.newContext({
    locale: "it-IT",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    ...(proxy ? { proxy } : {}),
  });
  const page = await ctx.newPage();
  const results: GBusiness[] = [];
  try {
    const q = encodeURIComponent(`${keyword} ${city}`.trim());
    await page.goto(`https://www.google.com/maps/search/${q}?hl=it`, { waitUntil: "domcontentloaded", timeout: 30000 });

    // consenso cookie (vari layout)
    for (const sel of ['button[aria-label*="Accetta"]', 'button:has-text("Accetta tutto")', 'form[action*="consent"] button']) {
      const btn = page.locator(sel).first();
      if (await btn.count().catch(() => 0)) { await btn.click().catch(() => {}); break; }
    }

    const feed = page.locator('div[role="feed"]');
    await feed.waitFor({ timeout: 15000 }).catch(() => {});

    // scroll per caricare più risultati
    let prev = 0;
    for (let s = 0; s < 18; s++) {
      const links = page.locator('a.hfpxzc');
      const n = await links.count().catch(() => 0);
      if (n >= max || n === prev) { if (n === prev && s > 2) break; }
      prev = n;
      await feed.evaluate((el) => el.scrollBy(0, 1200)).catch(() => {});
      await page.waitForTimeout(900);
      if (n >= max + 5) break;
    }

    const hrefs = await page.locator('a.hfpxzc').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).href).filter(Boolean),
    );
    const unique = [...new Set(hrefs)].slice(0, max);

    for (const href of unique) {
      try {
        await page.goto(href, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(700);
        const name = (await page.locator("h1").first().textContent().catch(() => null))?.trim() || null;
        if (!name) continue;
        const phone = (await page.locator('button[data-item-id^="phone:tel:"]').first().getAttribute("data-item-id").catch(() => null))
          ?.replace("phone:tel:", "") || null;
        const website = (await page.locator('a[data-item-id="authority"]').first().getAttribute("href").catch(() => null)) || null;
        const address = (await page.locator('button[data-item-id="address"]').first().getAttribute("aria-label").catch(() => null))
          ?.replace(/^Indirizzo:\s*/i, "") || null;
        // rating + recensioni dal pannello
        const ratingTxt = await page.locator('div.F7nice span[aria-hidden="true"]').first().textContent().catch(() => null);
        const reviewsTxt = await page.locator('div.F7nice span[aria-label*="recension"]').first().textContent().catch(() => null);
        const rating = ratingTxt ? Number(ratingTxt.replace(",", ".")) : null;
        const reviews_count = reviewsTxt ? Number(reviewsTxt.replace(/[^\d]/g, "")) : null;
        // lat/lng + place_id dall'URL
        const url = page.url();
        const ll = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        const lat = ll ? Number(ll[1]) : null;
        const lng = ll ? Number(ll[2]) : null;
        const pid = url.match(/!1s([^!?]+)/);
        results.push({
          business_name: name,
          phone, website,
          email: null,
          address, city, region: null,
          source: "internal_gmaps",
          place_id: pid ? decodeURIComponent(pid[1]) : null,
          rating: rating && !Number.isNaN(rating) ? rating : null,
          reviews_count: reviews_count && !Number.isNaN(reviews_count) ? reviews_count : null,
          lat, lng,
        });
      } catch {
        /* salta il singolo place fallito */
      }
    }
  } finally {
    await ctx.close().catch(() => {});
  }

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
  return results;
}
