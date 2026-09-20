// ============================================================================
// lead-scraper — motore multi-source per la generazione di lead B2B (super_admin)
// (deploy: v1 — primo rilascio via CI bun)
// ============================================================================
// Fonti (action "search", campo source):
//   • google_maps → ATTIVA. Text Search + Place Details (riusa google_maps_api_key).
//   • linkedin    → ATTIVA via Google Custom Search (google_cse_api_key+cx, free 100/g):
//                   trova persone/decisori su linkedin.com/in.
//   • explorium   → gated dietro explorium_api_key (fase 2).
//
// Azioni:
//   search       → ricerca multi-source, salva search + results
//   enrich       → estrae 1 email dal sito (best-effort) per i result selezionati
//   deep_enrich  → sito → email+telefoni+P.IVA+social+segnali d'intento (+VIES). GRATIS
//   find_email   → email pattern (nome.cognome@dominio) + verifica MX. GRATIS
//   find_linkedin→ trova il LinkedIn del decisore via Google CSE
//   validate_vat → valida P.IVA su VIES (UE) e recupera ragione sociale. GRATIS
//   qualify      → punteggio AI 0-100 vs ICP (aiRouter)
//   push_crm     → inserisce i lead selezionati in marketing_contacts
//   import_crm   → aziende già in marketing_contacts (es. con P.IVA ma senza
//                  email) → ricerca scraper arricchibile con tutti gli strumenti
//   sync_crm     → riscrive nel contatto CRM collegato i campi VUOTI riempiti
//                  dall'enrichment (email/PEC affidabili, telefono, P.IVA, sito,
//                  fatturato; ATECO/dipendenti/anno nelle note). Fill-empty only.
//
// Filosofia "minimo costo": tutto l'enrichment di base è gratuito (fetch siti +
// DNS pubblico + VIES). Solo le fonti premium (Explorium) richiedono una chiave.
//
// Sicurezza: requireAuth + requireRole super_admin. CORS centralizzato.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { fetchWithTimeout, isTimeoutError } from "../_shared/fetchWithTimeout.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { extractJsonFromLLM } from "../_shared/extractJson.ts";
import { getSuppressedEmailMap, normalizeEmailAddress } from "../_shared/emailSuppression.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
const PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const GMAPS = "https://maps.googleapis.com/maps/api/place";

// ── Util: pool a concorrenza limitata (evita di saturare l'edge runtime) ──────
async function poolMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        // Non inghiottire in silenzio: il fallimento del singolo item resta
        // non-bloccante (out[i] = undefined) ma finisce nei log della function.
        console.error(`poolMap: item ${i} fallito:`, (e as Error)?.message ?? e);
        out[i] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

// ── Util: dedupe key normalizzata ─────────────────────────────────────────────
function dedupeKey(r: { place_id?: string | null; phone?: string | null; business_name: string }): string {
  if (r.place_id) return `g:${r.place_id}`;
  if (r.phone) return `p:${r.phone.replace(/[^0-9+]/g, "")}`;
  return `n:${r.business_name.trim().toLowerCase()}`;
}

// ── Util: estrazione email da HTML (mailto + pattern testuale) ────────────────
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const EMAIL_JUNK = /(sentry|wixpress|example\.com|\.png|\.jpe?g|\.gif|\.webp|@sentry|godaddy|cloudflare|domain|yourdomain|email@|nome@|user@|@2x)/i;

function pickBestEmail(html: string, domain?: string | null): string | null {
  const found = new Set<string>();
  // mailto: prioritari
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (e.includes("@") && !EMAIL_JUNK.test(e)) found.add(e);
  }
  for (const m of html.matchAll(EMAIL_RE)) {
    const e = m[0].trim().toLowerCase();
    if (!EMAIL_JUNK.test(e)) found.add(e);
  }
  if (found.size === 0) return null;
  const list = [...found];
  // preferisci email sullo stesso dominio del sito
  if (domain) {
    const host = domain.replace(/^www\./, "");
    const same = list.find((e) => e.endsWith(`@${host}`) || e.endsWith(`.${host}`));
    if (same) return same;
  }
  // preferisci info@/amministrazione@/commerciale@ rispetto a generiche
  const priority = list.find((e) => /^(info|commerciale|amministrazione|preventivi|segreteria|contatti)@/.test(e));
  return priority || list[0];
}

// ── Scoperta pagine contatti ──────────────────────────────────────────────────
// I path fissi (/contatti, /chi-siamo) coprono solo una parte dei siti: molti
// usano /contatti-2, /dove-siamo, /it/contact, /azienda/contatti… Su un campione
// di 70 siti reali del CRM, seguire i link della home ha portato le email
// trovate da 15 a 29 (+93%) senza alcun costo aggiuntivo.
const CONTACT_LINK_RE = /contatt|contact|chi-siamo|chi_siamo|chisiamo|azienda|about|dove-siamo|dove_siamo|preventiv|richiedi|privacy|note-legali|impressum/i;
const CONTACT_ASSET_RE = /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)($|\?)/i;

/** Estrae dalla home i link interni che sembrano pagine di contatto. */
function discoverContactLinks(homeHtml: string, base: URL, max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of homeHtml.matchAll(/href=["']([^"']+)["']/gi)) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript):/i.test(raw)) continue;
    if (!CONTACT_LINK_RE.test(raw) || CONTACT_ASSET_RE.test(raw)) continue;
    let u: URL;
    try { u = new URL(raw, base.origin + "/"); } catch { continue; }
    // solo stesso host: niente salti su domini terzi (e niente SSRF di ritorno)
    if (u.hostname !== base.hostname) continue;
    u.hash = "";
    const href = u.href;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= max) break;
  }
  return out;
}

async function extractEmailFromSite(website: string): Promise<string | null> {
  if (!website) return null;
  let base: URL;
  try {
    base = new URL(website.startsWith("http") ? website : `https://${website}`);
  } catch {
    return null;
  }
  const domain = base.hostname.replace(/^www\./, "");
  // prova homepage + pagine contatti tipiche italiane
  const candidates = [base.href, `${base.origin}/contatti`, `${base.origin}/contatti/`, `${base.origin}/contact`];
  const gia: string[] = [];
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, {
        timeoutMs: 6000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EiC-LeadBot/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      const email = pickBestEmail(html, domain);
      if (email) return email;
      // niente email nei path fissi: prova le pagine linkate dalla home
      if (url === base.href && gia.length === 0) gia.push(...discoverContactLinks(html, base));
    } catch {
      // timeout / DNS / TLS → passa al candidato successivo
      continue;
    }
  }
  for (const url of gia) {
    if (candidates.includes(url)) continue;
    try {
      const res = await fetchWithTimeout(url, {
        timeoutMs: 6000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EiC-LeadBot/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const email = pickBestEmail(await res.text(), domain);
      if (email) return email;
    } catch { continue; }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// ENRICHMENT GRATUITO — "vita morte e miracoli" a costo zero
// ══════════════════════════════════════════════════════════════════════════════

const PHONE_RE = /(?:\+39[\s.\-]?)?(?:0\d{1,3}[\s.\-/]?\d{5,8}|3\d{2}[\s.\-/]?\d{6,7})/g;
const PIVA_LABEL_RE = /(?:partita\s*iva|p\.?\s*iva|vat(?:\s*(?:number|n))?)[^0-9]{0,18}(\d{11})/i;
const PIVA_ANY_RE = /\b(\d{11})\b/g;
const SOCIAL_RE = {
  linkedin: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>)]+/i,
  facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>)]+/i,
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>)]+/i,
};

function cleanPhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

/**
 * Normalizza un numero italiano in E.164 (+39…) e lo classifica.
 * Ritorna null se non è un telefono plausibile (scarta P.IVA/CAP/anni, ecc.).
 * mobile = +39 3xx (cellulare, possibile WhatsApp); landline = fisso.
 */
function classifyItPhone(raw: string): { e164: string; type: "mobile" | "landline"; whatsapp: boolean } | null {
  let d = raw.replace(/[^\d]/g, "");
  // Togli il prefisso internazionale 39 SOLO quando è davvero il country code:
  //  - 0039… → nazionale
  //  - 39 + numero che inizia per 0 (fisso) → è +39 su un fisso
  //  - 39 + numero 3xx di 9-10 cifre → è +39 su un cellulare
  // Così "+390150530" NON viene scambiato per un cellulare 39x.
  if (d.startsWith("0039")) d = d.slice(4);
  else if (d.startsWith("39")) {
    const rest = d.slice(2);
    if (rest.startsWith("0")) d = rest;
    else if (rest.startsWith("3") && (rest.length === 9 || rest.length === 10)) d = rest;
  }
  // Cellulare: 3xx + numero = 9-10 cifre totali, prefisso 3
  if (/^3\d{8,9}$/.test(d)) return { e164: `+39${d}`, type: "mobile", whatsapp: true };
  // Fisso: 0 + prefisso + locale = 9-10 cifre totali. Sotto le 9 è un frammento
  // (es. "0150530"), a 11 sarebbe la P.IVA: entrambi scartati.
  if (/^0\d{8,9}$/.test(d)) return { e164: `+39${d}`, type: "landline", whatsapp: false };
  return null; // scarta frammenti, P.IVA, CAP, sequenze non plausibili
}

interface DeepEnrich {
  emails: string[];
  phones: string[];
  phones_classified: Array<{ e164: string; type: "mobile" | "landline"; whatsapp: boolean }>;
  partita_iva: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  intent_signals: Record<string, boolean>;
  excerpt: string; // testo pulito del sito, per l'AI icebreaker
}

/** Scarica homepage + pagine contatti tipiche e ne estrae tutto il possibile. */
async function scrapeWebsiteDeep(website: string): Promise<DeepEnrich | null> {
  let base: URL;
  try {
    base = new URL(website.startsWith("http") ? website : `https://${website}`);
  } catch {
    return null;
  }
  // SSRF guard: solo http/https e nessun host interno/privato/metadata (literal
  // IP/hostname). Il fetch server-side non deve mai puntare a risorse interne.
  if (base.protocol !== "http:" && base.protocol !== "https:") return null;
  const ssrfHost = base.hostname.toLowerCase();
  if (
    ssrfHost === "localhost" || ssrfHost === "0.0.0.0" || ssrfHost === "metadata.google.internal" ||
    ssrfHost.endsWith(".local") || ssrfHost.endsWith(".internal") ||
    /^127\./.test(ssrfHost) || /^10\./.test(ssrfHost) || /^192\.168\./.test(ssrfHost) ||
    /^169\.254\./.test(ssrfHost) || ssrfHost === "[::1]" || ssrfHost === "::1" ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ssrfHost)
  ) return null;
  const domain = base.hostname.replace(/^www\./, "");
  const pages = [base.href, `${base.origin}/contatti`, `${base.origin}/chi-siamo`, `${base.origin}/azienda`];
  let combined = "";
  let homepageUrl = "";
  const scoperte: string[] = [];   // pagine contatti trovate nei link della home
  for (const url of pages) {
    try {
      const res = await fetchWithTimeout(url, {
        timeoutMs: 6000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EiC-LeadBot/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (!homepageUrl) {
        homepageUrl = res.url || url;
        scoperte.push(...discoverContactLinks(html, base));
      }
      combined += "\n" + html;
      if (combined.length > 400_000) break; // safety cap
    } catch {
      continue;
    }
  }
  // Pagine linkate dalla home (/contatti-2, /dove-siamo, /it/contact…): sono
  // quelle che fanno la differenza sui siti che non usano i path standard.
  for (const url of scoperte) {
    if (pages.includes(url) || combined.length > 400_000) continue;
    try {
      const res = await fetchWithTimeout(url, {
        timeoutMs: 6000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EiC-LeadBot/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) continue;
      combined += "\n" + await res.text();
    } catch { continue; }
  }
  if (!combined) return null;

  // email
  const emails = new Set<string>();
  for (const m of combined.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (e.includes("@") && !EMAIL_JUNK.test(e)) emails.add(e);
  }
  for (const m of combined.matchAll(EMAIL_RE)) {
    const e = m[0].trim().toLowerCase();
    if (!EMAIL_JUNK.test(e)) emails.add(e);
  }
  // ordina: dominio del sito > info/commerciale > resto
  const emailList = [...emails].sort((a, b) => {
    const score = (e: string) =>
      (e.endsWith(`@${domain}`) ? 2 : 0) + (/^(info|commerciale|amministrazione|preventivi)@/.test(e) ? 1 : 0);
    return score(b) - score(a);
  });

  // P.IVA — prima con label, poi fallback se ne esiste una sola sulla pagina
  // (calcolata PRIMA dei telefoni così possiamo escluderla dai numeri).
  let piva: string | null = null;
  const labelled = combined.match(PIVA_LABEL_RE);
  if (labelled) piva = labelled[1];
  else {
    const all = new Set<string>();
    for (const m of combined.matchAll(PIVA_ANY_RE)) all.add(m[1]);
    if (all.size === 1) piva = [...all][0];
  }

  // telefoni: normalizza in E.164, classifica fisso/cellulare, scarta P.IVA e
  // numeri non plausibili, dedup per numero normalizzato (mobile prima).
  const phonesMap = new Map<string, { e164: string; type: "mobile" | "landline"; whatsapp: boolean }>();
  for (const m of combined.matchAll(PHONE_RE)) {
    const digits = cleanPhone(m[0]).replace(/^\+/, "");
    if (piva && digits.replace(/^0039|^39/, "") === piva) continue; // è la P.IVA, non un telefono
    const c = classifyItPhone(m[0]);
    if (c && !phonesMap.has(c.e164)) phonesMap.set(c.e164, c);
  }
  const phonesClassified = [...phonesMap.values()].sort((a, b) => Number(b.whatsapp) - Number(a.whatsapp));
  const phones = phonesClassified.map((p) => p.e164);

  // social
  const fb = combined.match(SOCIAL_RE.facebook)?.[0] || null;
  const ig = combined.match(SOCIAL_RE.instagram)?.[0] || null;
  const li = combined.match(SOCIAL_RE.linkedin)?.[0] || null;

  // segnali d'intento (per vendere un gestionale moderno)
  const years = [...combined.matchAll(/(?:©|&copy;|copyright)[^\d]{0,8}(20\d{2})/gi)].map((m) => Number(m[1]));
  const maxYear = years.length ? Math.max(...years) : null;
  const nowYear = new Date().getFullYear();
  const intent_signals: Record<string, boolean> = {
    no_https: (homepageUrl || base.href).startsWith("http://"),
    outdated_copyright: maxYear != null && maxYear < nowYear - 1,
    not_mobile: !/<meta[^>]+name=["']viewport["']/i.test(combined),
    has_form: /<form[\s>]/i.test(combined),
  };

  // estratto testuale pulito (per l'AI icebreaker)
  const excerpt = combined
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1600);

  return {
    emails: emailList,
    phones,
    phones_classified: phonesClassified,
    partita_iva: piva,
    linkedin_url: li,
    facebook_url: fb,
    instagram_url: ig,
    intent_signals,
    excerpt,
  };
}

/** Punteggio "buon prospect per EiC" 0-100 dai segnali d'intento + raggiungibilità. */
function computeIntentScore(signals: Record<string, boolean>, reachable: boolean, hasWebsite: boolean): number {
  let s = 50;
  if (signals.outdated_copyright) s += 20; // sito vecchio = bisogno di modernizzazione
  if (signals.not_mobile) s += 15;
  if (signals.no_https) s += 10;
  if (!hasWebsite) s += 8; // nessun sito = grande opportunità di digitalizzazione
  s += reachable ? 10 : -15; // raggiungibile via email/telefono
  return Math.max(0, Math.min(100, s));
}

/** VIES (UE) — valida P.IVA italiana e ritorna ragione sociale + indirizzo. Gratis. */
async function viesValidate(piva: string): Promise<{ valid: boolean; name?: string; address?: string } | null> {
  const num = piva.replace(/\D/g, "");
  if (num.length !== 11) return null;
  try {
    const res = await fetchWithTimeout(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat/${num}`,
      { timeoutMs: 8000, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const d = await res.json();
    return {
      valid: !!d.isValid,
      name: d.name && d.name !== "---" ? d.name : undefined,
      address: d.address && d.address !== "---" ? String(d.address).replace(/\n/g, ", ") : undefined,
    };
  } catch {
    return null;
  }
}

/** Verifica che il dominio abbia record MX (DNS-over-HTTPS Cloudflare). Gratis. */
async function domainHasMx(domain: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { timeoutMs: 5000, headers: { Accept: "application/dns-json" } },
    );
    if (!res.ok) return false;
    const d = await res.json();
    return Array.isArray(d.Answer) && d.Answer.some((a: { type: number }) => a.type === 15);
  } catch {
    return false;
  }
}

/** Genera email candidate da nome + dominio (pattern italiani comuni). */
function guessEmails(fullName: string, domain: string): string[] {
  const parts = fullName.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // togli accenti
    .replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [`info@${domain}`];
  const [first, ...rest] = parts;
  const last = rest.length ? rest[rest.length - 1] : "";
  const cands = new Set<string>();
  if (first && last) {
    cands.add(`${first}.${last}@${domain}`);
    cands.add(`${first[0]}.${last}@${domain}`);
    cands.add(`${first}${last}@${domain}`);
    cands.add(`${first}@${domain}`);
  } else if (first) {
    cands.add(`${first}@${domain}`);
  }
  cands.add(`info@${domain}`);
  return [...cands];
}

/** Google Custom Search — trova URL LinkedIn/profili. Free tier 100 query/giorno. */
async function googleCseSearch(query: string, key: string, cx: string): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const params = new URLSearchParams({ key, cx, q: query, num: "5", hl: "it" });
  const res = await fetchWithTimeout(`https://www.googleapis.com/customsearch/v1?${params}`, { timeoutMs: 10000 });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || "Google CSE error");
  return (d.items || []).map((it: { title: string; link: string; snippet: string }) => ({
    title: it.title, link: it.link, snippet: it.snippet,
  }));
}

/** Estrae nome persona + ruolo dal title LinkedIn ("Mario Rossi - Titolare - Azienda | LinkedIn"). */
function parseLinkedinTitle(title: string): { name: string | null; role: string | null } {
  const clean = title.replace(/\s*[|–-]\s*LinkedIn\s*$/i, "").trim();
  const segs = clean.split(/\s*[-–|]\s*/);
  const name = segs[0]?.trim() || null;
  const role = segs[1]?.trim() || null;
  return { name, role };
}

// ── Quota guard + cache (anti-bolletta) ───────────────────────────────────────
async function bumpUsage(admin: any, provider: string, n: number): Promise<number> {
  try {
    const { data } = await admin.rpc("lead_scraper_bump_usage", { p_provider: provider, p_n: n });
    return typeof data === "number" ? data : 0;
  } catch { return 0; }
}

/** Ritorna {ok, used, cap}. cap letto da platform_settings (default 2000/giorno). */
async function checkQuota(admin: any, provider: string): Promise<{ ok: boolean; used: number; cap: number }> {
  const capStr = await getPlatformSetting("lead_scraper_google_daily_cap", "LEAD_SCRAPER_GOOGLE_DAILY_CAP");
  const cap = parseInt(capStr, 10) || 2000;
  try {
    const { data } = await admin
      .from("lead_scraper_api_usage")
      .select("count")
      .eq("provider", provider)
      .eq("day", new Date().toISOString().slice(0, 10))
      .maybeSingle();
    const used = data?.count || 0;
    return { ok: used < cap, used, cap };
  } catch { return { ok: true, used: 0, cap }; }
}

/** Place Details con cache (TTL 30 giorni) + conteggio quota solo sul miss. */
async function cachedPlaceDetails(admin: any, placeId: string, key: string) {
  const THIRTY_DAYS = 30 * 24 * 3600 * 1000;
  try {
    const { data: cached } = await admin
      .from("lead_scraper_place_cache")
      .select("data, fetched_at")
      .eq("place_id", placeId)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < THIRTY_DAYS) {
      return cached.data;
    }
  } catch { /* cache miss path */ }

  const fresh = await googlePlaceDetails(placeId, key);
  await bumpUsage(admin, "google_places", 1);
  try {
    await admin.from("lead_scraper_place_cache")
      .upsert({ place_id: placeId, data: fresh, fetched_at: new Date().toISOString() });
  } catch { /* best-effort cache write */ }
  return fresh;
}

// ── Geocoding + Nearby (per il geo-grid, supera il limite di 60) ──────────────
async function geocodeQuery(query: string, key: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ query, language: "it", region: "it", key });
  const res = await fetchWithTimeout(`${GMAPS}/textsearch/json?${params}`, { timeoutMs: 12000 });
  const data = await res.json();
  const loc = data.results?.[0]?.geometry?.location;
  return loc ? { lat: loc.lat, lng: loc.lng } : null;
}

async function googleNearby(lat: number, lng: number, radius: number, keyword: string, key: string): Promise<GPlace[]> {
  const out: GPlace[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 2; page++) {
    const params = new URLSearchParams({ location: `${lat},${lng}`, radius: String(radius), keyword, language: "it", key });
    if (pageToken) { params.set("pagetoken", pageToken); await new Promise((r) => setTimeout(r, 2100)); }
    const res = await fetchWithTimeout(`${GMAPS}/nearbysearch/json?${params}`, { timeoutMs: 15000 });
    const data = await res.json();
    if (data.status && !["OK", "ZERO_RESULTS"].includes(data.status)) break;
    for (const p of data.results || []) {
      out.push({ place_id: p.place_id, name: p.name, formatted_address: p.vicinity, rating: p.rating, user_ratings_total: p.user_ratings_total });
    }
    pageToken = data.next_page_token || null;
    if (!pageToken) break;
  }
  return out;
}

// ── Firmografici + PEC via openapi.it (ATECO, dimensione, PEC) — gated ────────
// La PEC (posta certificata) è l'email B2B garantita-deliverable di ogni azienda
// italiana: è il dato d'oro per l'outreach in Italia.
interface Firmografici {
  ateco?: string; ateco_desc?: string; company_size?: string; pec?: string;
  fatturato?: number; dipendenti?: number; anno_fondazione?: number; forma_giuridica?: string;
}
// Base host openapi.it: produzione vs sandbox (test gratis). Switch via openapi_env.
// Cache in-memory (60s) per non leggere il setting ad ogni chiamata nei loop.
let _openapiBaseCache: { v: string; t: number } | null = null;
async function openapiBase(): Promise<string> {
  const now = Date.now();
  if (_openapiBaseCache && now - _openapiBaseCache.t < 60_000) return _openapiBaseCache.v;
  const env = ((await getPlatformSetting("openapi_env", "OPENAPI_ENV")) || "prod").toLowerCase();
  const v = env === "sandbox" || env === "test" ? "test.company.openapi.com" : "company.openapi.com";
  _openapiBaseCache = { v, t: now };
  return v;
}

// ── openapi.it — Documenti ufficiali: DocuEngine + Visengine (Visure Camerali) ─
// Prodotti openapi SEPARATI dal Company: danno documenti ufficiali (visure CCIAA,
// Registro Imprese, Agenzia Entrate, INPS, catasto) con flusso ASINCRONO:
//   ordina (POST) → poll stato (GET) → scarica (GET /download|/documento).
// Stesso token openapi_it_token (deve avere gli scope DocuEngine + Visure Camerali).
// Host prod|sandbox:
//   DocuEngine  → docuengine.openapi.com | test.docuengine.openapi.com
//   Visengine   → visengine2.altravia.com | test.visengine2.altravia.com
async function openapiIsSandbox(): Promise<boolean> {
  const env = ((await getPlatformSetting("openapi_env", "OPENAPI_ENV")) || "prod").toLowerCase();
  return env === "sandbox" || env === "test";
}
function docuengineBase(sandbox: boolean): string {
  return sandbox ? "test.docuengine.openapi.com" : "docuengine.openapi.com";
}
function visengineBase(sandbox: boolean): string {
  return sandbox ? "test.visengine2.altravia.com" : "visengine2.altravia.com";
}

/** Chiamata autenticata generica a openapi (Bearer) con parsing JSON + errore leggibile. */
async function openapiCall(
  url: string,
  token: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: init.timeoutMs ?? 15000,
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text().catch(() => "");
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) ||
        (typeof data === "string" && data ? data.slice(0, 200) : `HTTP ${res.status}`);
      return { ok: false, status: res.status, data, error: String(msg) };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: `Rete openapi: ${(e as Error).message}` };
  }
}

// ── DocuEngine (docuengine.openapi.com) ────────────────────────────────────────
/** Catalogo documenti ordinabili: id, nome, categoria, prezzo, isSync, requestStructure. */
async function docuengineDocuments(token: string, sandbox: boolean) {
  return openapiCall(`https://${docuengineBase(sandbox)}/documents`, token, { timeoutMs: 15000 });
}
/** Ordina un documento. body: { documentId, search:{field0,field1,…}, selectedOptions?, notifyEmail? }.
 *  NB: NON passare state:"NEW" (lascerebbe la transazione aperta senza processarla);
 *  omesso → openapi chiude e genera il documento (poi poll dello stato). */
async function docuengineRequest(token: string, sandbox: boolean, payload: Record<string, unknown>) {
  return openapiCall(`https://${docuengineBase(sandbox)}/requests`, token, {
    method: "POST",
    body: payload,
    timeoutMs: 25000,
  });
}
/** Stato/dettaglio di una richiesta (poll). */
async function docuengineStatus(token: string, sandbox: boolean, id: string) {
  return openapiCall(`https://${docuengineBase(sandbox)}/requests/${encodeURIComponent(id)}`, token);
}

// ── Visengine / Visure Camerali (visengine2.altravia.com) ──────────────────────
/** Catalogo visure/pratiche: hash, nome, costo. GET /visure (nessun parametro). */
async function visengineCatalog(token: string, sandbox: boolean) {
  return openapiCall(`https://${visengineBase(sandbox)}/visure`, token, { timeoutMs: 15000 });
}
/** Info/costo/parametri di una specifica visura per hash. GET /visure/{hash}. */
async function visengineVisuraInfo(token: string, sandbox: boolean, hash: string) {
  return openapiCall(`https://${visengineBase(sandbox)}/visure/${encodeURIComponent(hash)}`, token);
}
/** Ordina una visura. body tipico: { hash_visura, ricerca:{...} } (dipende dalla visura). */
async function visengineRequest(token: string, sandbox: boolean, payload: Record<string, unknown>) {
  return openapiCall(`https://${visengineBase(sandbox)}/richiesta`, token, {
    method: "POST",
    body: payload,
    timeoutMs: 20000,
  });
}
/** Stato/dettaglio di una richiesta visura (poll). GET /richiesta/{id}. */
async function visengineStatus(token: string, sandbox: boolean, id: string) {
  return openapiCall(`https://${visengineBase(sandbox)}/richiesta/${encodeURIComponent(id)}`, token);
}

/**
 * Scarica il documento pronto dall'endpoint autenticato openapi e lo archivia nel
 * bucket `marketing-attachments` (lo stesso dei documenti CRM), così può essere
 * referenziato in Contatti e Opportunità dal MarketingDocumentsPanel esistente
 * (che crea i signed URL al volo su quel bucket). Ritorna path relativo + size + mime.
 * Gestisce sia risposta binaria (PDF/XML/ZIP) sia envelope JSON con url o base64.
 */
async function openapiDownloadAndStore(
  supabaseAdmin: any, provider: string, requestId: string, url: string, token: string,
): Promise<{ ok: true; file_path: string; mime: string; size: number } | { ok: false; error: string }> {
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: 30000, headers: { Authorization: `Bearer ${token}`, Accept: "*/*" } });
    if (!res.ok) return { ok: false, error: `download HTTP ${res.status}` };
    const ct = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    let bytes: Uint8Array;
    let mime = ct;
    if (ct.includes("application/json")) {
      const j = await res.json().catch(() => null);
      // openapi (DocuEngine) risponde con { data: [ { downloadUrl, mimeType, fileName } ] }
      // (array + camelCase); altre volte { data: { url } }. Normalizza entrambi. Il
      // downloadUrl è un link firmato Google Cloud Storage (senza auth, scade ~24h).
      const first = Array.isArray(j?.data) ? j.data[0] : j?.data;
      const inner = first?.downloadUrl || first?.url || first?.download_url || first?.file
        || j?.data?.url || j?.url || j?.data?.download_url || j?.data?.file;
      const b64 = first?.base64 || first?.content || j?.data?.base64 || j?.base64 || j?.data?.content;
      const mimeHint = (first?.mimeType || first?.mime || j?.data?.mimeType || "").split(";")[0].trim();
      if (inner) {
        const r2 = await fetchWithTimeout(String(inner), { timeoutMs: 30000 });
        bytes = new Uint8Array(await r2.arrayBuffer());
        mime = (r2.headers.get("content-type") || mimeHint || "application/pdf").split(";")[0].trim();
      } else if (b64) {
        bytes = Uint8Array.from(atob(String(b64).replace(/^data:[^,]+,/, "")), (c) => c.charCodeAt(0));
        mime = "application/pdf";
      } else {
        bytes = new TextEncoder().encode(JSON.stringify(j));
        mime = "application/json";
      }
    } else {
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    const ext = mime.includes("pdf") ? "pdf" : mime.includes("xml") ? "xml" : mime.includes("zip") ? "zip" : mime.includes("json") ? "json" : "bin";
    const path = `openapi/${provider}/${requestId}.${ext}`;
    const up = await supabaseAdmin.storage.from("marketing-attachments").upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) return { ok: false, error: `storage: ${up.error.message}` };
    return { ok: true, file_path: path, mime, size: bytes.byteLength };
  } catch (e) {
    return { ok: false, error: `download/store: ${(e as Error).message}` };
  }
}

/**
 * Collega un documento openapi scaricato al CRM: crea UNA riga marketing_documents
 * con contact_id E opportunity_id (entrambi) così lo stesso file compare sia nel
 * Contatto sia nell'Opportunità (nessun duplicato). Idempotente: se già collegato
 * (openapi_document_requests.marketing_document_id valorizzato) non re-inserisce.
 */
async function linkOpenapiDocToCrm(
  supabaseAdmin: any, reqRow: any, filePath: string, mime: string, size: number, userId: string,
): Promise<string | null> {
  try {
    if (reqRow?.marketing_document_id) return reqRow.marketing_document_id;
    if (!reqRow?.contact_id && !reqRow?.opportunity_id) return null;
    // company_id: da contatto/opportunità; fallback platform-admin
    let companyId = reqRow?.company_id || PLATFORM_ADMIN_COMPANY_ID;
    if (reqRow?.contact_id) {
      const { data: c } = await supabaseAdmin.from("marketing_contacts").select("company_id").eq("id", reqRow.contact_id).maybeSingle();
      if (c?.company_id) companyId = c.company_id;
    }
    const name = `${reqRow?.document_name || reqRow?.provider || "documento"}${reqRow?.subject ? " " + reqRow.subject : ""}.${mime.includes("pdf") ? "pdf" : mime.includes("xml") ? "xml" : "bin"}`;
    const { data: md } = await supabaseAdmin.from("marketing_documents").insert({
      contact_id: reqRow?.contact_id ?? null,
      opportunity_id: reqRow?.opportunity_id ?? null,
      company_id: companyId,
      file_name: name,
      file_url: filePath,      // path nel bucket marketing-attachments (il panel crea il signed URL)
      file_type: mime,
      file_size: size,
      uploaded_by: userId,
    }).select("id").single();
    return md?.id ?? null;
  } catch { return null; }
}

async function fetchFirmografici(piva: string, token: string, base = "company.openapi.com"): Promise<Firmografici | null> {
  const num = piva.replace(/\D/g, "");
  if (num.length !== 11) return null;
  try {
    const res = await fetchWithTimeout(`https://${base}/IT-advanced/${num}`, {
      timeoutMs: 9000,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = await res.json();
    const rec = d?.data?.[0] || d?.data || d;
    const atecoObj = rec?.atecoClassification?.ateco || rec?.ateco || {};
    const pec = rec?.pec || rec?.pecEmail || rec?.contacts?.pec || undefined;
    const balance = rec?.balanceSheets?.[0] || rec?.lastBalanceSheet || {};
    const num0 = (v: unknown): number | undefined => {
      const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const empl = num0(rec?.employees) ?? num0(balance?.employees);
    const fatturato = num0(balance?.turnover) ?? num0(balance?.revenue) ?? num0(rec?.turnover) ?? num0(rec?.revenue);
    const startRaw = rec?.startDate || rec?.registrationDate || rec?.activityStartDate || rec?.creationDate;
    const anno = startRaw ? num0(String(startRaw).slice(0, 4)) : undefined;
    return {
      ateco: atecoObj?.code || rec?.atecoCode || undefined,
      ateco_desc: atecoObj?.description || rec?.atecoDescription || undefined,
      company_size: empl ? String(empl) : undefined,
      pec: pec && /@/.test(String(pec)) ? String(pec).toLowerCase() : undefined,
      fatturato,
      dipendenti: empl,
      anno_fondazione: anno && anno > 1800 && anno <= 2100 ? anno : undefined,
      forma_giuridica: rec?.detailedLegalForm?.description || rec?.legalForm?.description || rec?.legalForm || rec?.businessNature || rec?.companyForm || undefined,
    };
  } catch { return null; }
}

// ── Company Search (openapi.it) — elenchi imprese italiane per criteri ────────
// Flusso a 2 step:
//  1) GET /IT-search?atecoCode&companyName&province&townCode → lista di soli ID.
//  2) GET /IT-advanced/{id} per ogni ID → dati completi (P.IVA, ATECO, PEC, SdI…).
// Parametri di ricerca REALI (verificati): atecoCode, companyName, province (sigla),
// townCode (codice catastale), pec, limit, skip.
async function companySearchIds(opts: {
  ateco?: string; companyName?: string; province?: string; townCode?: string; limit: number;
}, token: string, base = "company.openapi.com"): Promise<string[]> {
  const p = new URLSearchParams();
  if (opts.ateco) p.set("atecoCode", opts.ateco);
  if (opts.companyName) p.set("companyName", opts.companyName);
  if (opts.province) p.set("province", opts.province);
  if (opts.townCode) p.set("townCode", opts.townCode);
  p.set("limit", String(Math.max(1, Math.min(200, opts.limit))));
  try {
    const res = await fetchWithTimeout(`https://${base}/IT-search?${p.toString()}`, {
      timeoutMs: 12000,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const d = await res.json();
    const arr = Array.isArray(d?.data) ? d.data : [];
    return arr.map((x: any) => x?.id).filter(Boolean);
  } catch { return []; }
}

// Dettaglio azienda per id (o P.IVA). IT-advanced = con ATECO + PEC; IT-start = solo base.
async function companyDetail(idOrPiva: string, token: string, base = "company.openapi.com", level: "IT-start" | "IT-advanced" = "IT-advanced"): Promise<any | null> {
  try {
    const res = await fetchWithTimeout(`https://${base}/${level}/${encodeURIComponent(idOrPiva)}`, {
      timeoutMs: 10000,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = await res.json();
    return Array.isArray(d?.data) ? (d.data[0] || null) : (d?.data || null);
  } catch { return null; }
}

/**
 * Visura camerale (openapi.it IT-advanced): estrazione RICCA di tutti i campi
 * utili del dettaglio impresa. A differenza di fetchFirmografici (solo 8 campi),
 * qui restituiamo l'anagrafica completa + registro + bilancio + soci/amministratori.
 * In caso di errore ritorna { error, status } così l'UI spiega il perché
 * (crediti finiti, prodotto non attivo sul piano openapi, P.IVA non trovata…).
 */
async function fetchVisura(piva: string, token: string, base = "company.openapi.com"): Promise<
  { ok: true; rec: any; fields: Record<string, unknown> } | { ok: false; status: number; error: string }
> {
  const num = piva.replace(/\D/g, "");
  if (num.length !== 11) return { ok: false, status: 0, error: "P.IVA non valida (servono 11 cifre)." };
  let res: Response;
  try {
    res = await fetchWithTimeout(`https://${base}/IT-advanced/${num}`, {
      timeoutMs: 12000,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch (e) {
    return { ok: false, status: 0, error: `Rete openapi.it: ${(e as Error).message}` };
  }
  const bodyText = await res.text().catch(() => "");
  let body: any = null;
  try { body = JSON.parse(bodyText); } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = body?.message || body?.error || bodyText.slice(0, 200) || `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: String(msg) };
  }
  const rec = Array.isArray(body?.data) ? (body.data[0] || null) : (body?.data || body);
  if (!rec) return { ok: false, status: res.status, error: "openapi.it non ha restituito dati per questa P.IVA." };

  const num0 = (v: unknown): number | undefined => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  };
  const addr = rec.address?.registeredOffice || rec.registeredOffice || rec.address || {};
  const balance = rec.balanceSheets?.[0] || rec.lastBalanceSheet || {};
  const atecoObj = rec.atecoClassification?.ateco || rec.ateco || {};
  const people = (arr: any): Array<{ nome?: string; ruolo?: string }> =>
    Array.isArray(arr) ? arr.slice(0, 12).map((x: any) => ({
      nome: x?.name || [x?.firstName, x?.lastName].filter(Boolean).join(" ") || x?.companyName || undefined,
      ruolo: x?.role || x?.charge || x?.position || undefined,
    })).filter((p) => p.nome) : [];

  const fields: Record<string, unknown> = {
    ragione_sociale: rec.companyName || rec.denomination || undefined,
    forma_giuridica: rec.detailedLegalForm?.description || rec.legalForm?.description || rec.legalForm || undefined,
    stato_attivita: rec.activityStatus || rec.status || rec.companyStatus || undefined,
    data_costituzione: rec.startDate || rec.registrationDate || rec.creationDate || undefined,
    capitale_sociale: num0(rec.shareCapital?.amount ?? rec.shareCapital ?? rec.capital),
    rea: rec.rea?.number || rec.reaNumber || rec.rea || undefined,
    codice_fiscale: rec.taxCode || rec.fiscalCode || undefined,
    sdi: rec.sdiCode || rec.recipientCode || undefined,
    pec: (rec.pec || rec.pecEmail || rec.contacts?.pec) ? String(rec.pec || rec.pecEmail || rec.contacts?.pec).toLowerCase() : undefined,
    ateco: atecoObj?.code || rec.atecoCode || undefined,
    ateco_desc: atecoObj?.description || rec.atecoDescription || undefined,
    indirizzo: [addr.streetName || addr.address, addr.streetNumber].filter(Boolean).join(" ") || undefined,
    comune: addr.town || addr.city || addr.municipality || undefined,
    provincia: addr.province || addr.provinceCode || undefined,
    cap: addr.zipCode || addr.postalCode || addr.cap || undefined,
    dipendenti: num0(rec.employees ?? balance.employees),
    fatturato: num0(balance.turnover ?? balance.revenue ?? rec.turnover),
    utile: num0(balance.netIncome ?? balance.profit),
    anno_bilancio: num0(balance.year),
    soci: people(rec.shareholders || rec.members),
    amministratori: people(rec.administrators || rec.managers || rec.directors),
  };
  return { ok: true, rec, fields };
}

// ── LinkedIn full profile via Proxycurl — gated ───────────────────────────────
async function proxycurlProfile(linkedinUrl: string, key: string): Promise<{ name?: string; role?: string; email?: string } | null> {
  try {
    const params = new URLSearchParams({ url: linkedinUrl, extra: "include", personal_email: "include" });
    const res = await fetchWithTimeout(`https://nubela.co/proxycurl/api/v2/linkedin?${params}`, {
      timeoutMs: 15000,
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const d = await res.json();
    const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || d.full_name || undefined;
    const role = d.occupation || d.headline || undefined;
    const email = (Array.isArray(d.personal_emails) && d.personal_emails[0]) || d.work_email || undefined;
    return { name, role, email };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// FONTI/ENRICHER ESTERNI A BASSO COSTO (tutti gated dietro chiave)
// ══════════════════════════════════════════════════════════════════════════════

/** Serper.dev — Google Search API, ~$0.30/1000 (molto < Google CSE a scala). */
async function serperSearch(query: string, key: string, num = 5): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const res = await fetchWithTimeout("https://google.serper.dev/search", {
    timeoutMs: 10000,
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num, gl: "it", hl: "it" }),
  });
  // BUGFIX: status PRIMA di res.json() — su 429/5xx il body può non essere JSON
  // (res.json() lancerebbe un errore opaco senza "rate/limit", così il break
  // anti-rate-limit in find_linkedin non scatterebbe).
  if (!res.ok) throw new Error(`Serper ${res.status}${res.status === 429 ? " — rate limit" : ""}`);
  const d = await res.json().catch(() => ({} as { message?: string; organic?: unknown[] }));
  if (d.message && !d.organic) throw new Error(`Serper: ${d.message}`);
  return (d.organic || []).map((o: { title: string; link: string; snippet: string }) => ({
    title: o.title, link: o.link, snippet: o.snippet,
  }));
}

/** Apollo.io — People Search per ICP (titolo + settore + Italia). Free tier + crediti economici. */
async function apolloPeopleSearch(opts: { titles: string[]; keyword: string; location: string; perPage: number }, key: string): Promise<Array<any>> {
  const body: Record<string, unknown> = {
    person_titles: opts.titles,
    person_locations: [opts.location || "Italy"],
    q_organization_keyword_tags: [opts.keyword],
    page: 1,
    per_page: Math.min(50, opts.perPage),
  };
  const res = await fetchWithTimeout("https://api.apollo.io/api/v1/mixed_people/search", {
    timeoutMs: 15000,
    method: "POST",
    headers: { "X-Api-Key": key, "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(body),
  });
  // BUGFIX: status PRIMA di res.json() — un 429/5xx con body non-JSON farebbe
  // lanciare res.json() un errore opaco invece del rate-limit reale.
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Apollo ${res.status}${res.status === 429 ? " — rate limit" : ""}${t ? ": " + t.slice(0, 120) : ""}`);
  }
  const d = await res.json().catch(() => ({} as { people?: unknown[]; contacts?: unknown[] }));
  return d.people || d.contacts || [];
}

/** Apollo People Match — recupera l'email reale di una persona (1 credito). */
async function apolloEnrich(opts: { first_name?: string; last_name?: string; organization_name?: string; domain?: string }, key: string): Promise<{ email?: string; phone?: string; linkedin?: string } | null> {
  try {
    const res = await fetchWithTimeout("https://api.apollo.io/api/v1/people/match", {
      timeoutMs: 12000,
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({ ...opts, reveal_personal_emails: false }),
    });
    const d = await res.json();
    const p = d.person;
    if (!p) return null;
    const email = p.email && !/email_not_unlocked/i.test(p.email) ? p.email : undefined;
    const phone = p.phone_numbers?.[0]?.sanitized_number || p.organization?.phone || undefined;
    return { email, phone, linkedin: p.linkedin_url };
  } catch { return null; }
}

/** Apify — Google Maps Scraper actor (ritorna anche le email, che Places API non dà). */
async function apifyGoogleMaps(opts: { keyword: string; city: string; max: number }, token: string): Promise<Array<any>> {
  const input = {
    searchStringsArray: [`${opts.keyword} ${opts.city}`.trim()],
    maxCrawledPlacesPerSearch: Math.min(120, opts.max),
    language: "it",
    scrapeContacts: true,
  };
  // run-sync-get-dataset-items: esegue l'actor e ritorna i risultati in un colpo
  const res = await fetchWithTimeout(
    `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    { timeoutMs: 120000, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
  if (res.status >= 400) {
    const t = await res.text();
    throw new Error(`Apify: ${res.status} ${t.slice(0, 120)}`);
  }
  return await res.json();
}

/** People Data Labs — person enrich (email/telefono da nome + azienda). Free 100/mese. */
async function pdlEnrich(opts: { first_name?: string; last_name?: string; company?: string }, key: string): Promise<{ email?: string; phone?: string } | null> {
  try {
    const params = new URLSearchParams();
    if (opts.first_name) params.set("first_name", opts.first_name);
    if (opts.last_name) params.set("last_name", opts.last_name);
    if (opts.company) params.set("company", opts.company);
    params.set("min_likelihood", "6");
    const res = await fetchWithTimeout(`https://api.peopledatalabs.com/v5/person/enrich?${params}`, {
      timeoutMs: 12000, headers: { "X-Api-Key": key },
    });
    const d = await res.json();
    if (d.status !== 200 || !d.data) return null;
    const email = d.data.work_email || d.data.emails?.[0]?.address || undefined;
    const phone = d.data.phone_numbers?.[0] || d.data.mobile_phone || undefined;
    return { email, phone };
  } catch { return null; }
}

/** Verifica deliverability email via provider (NeverBounce o ZeroBounce). Pochi millesimi/email. */
async function verifyEmailProvider(email: string, provider: string, key: string): Promise<"valid" | "invalid" | "unknown"> {
  try {
    if (provider === "zerobounce") {
      const res = await fetchWithTimeout(`https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`, { timeoutMs: 10000 });
      const d = await res.json();
      if (d.status === "valid") return "valid";
      if (d.status === "invalid") return "invalid";
      return "unknown";
    }
    // default: NeverBounce
    const res = await fetchWithTimeout(`https://api.neverbounce.com/v4/single/check?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`, { timeoutMs: 10000 });
    const d = await res.json();
    if (d.result === "valid") return "valid";
    if (d.result === "invalid" || d.result === "disposable") return "invalid";
    return "unknown";
  } catch { return "unknown"; }
}

/** Rileva segnale d'assunzione dal sito (sta assumendo = cresce = buon momento). */
const HIRING_RE = /(lavora con noi|posizioni aperte|stiamo assumendo|si ricerca|cerchiamo|candidati|invia il tuo cv|offerte di lavoro|careers|we are hiring|join our team)/i;
async function detectHiring(website: string | null | undefined): Promise<boolean> {
  if (!website) return false;
  let base: URL;
  try { base = new URL(website.startsWith("http") ? website : `https://${website}`); } catch { return false; }
  const pages = [base.href, `${base.origin}/lavora-con-noi`, `${base.origin}/careers`, `${base.origin}/lavora-con-noi/`];
  for (const url of pages) {
    try {
      const res = await fetchWithTimeout(url, { timeoutMs: 6000, headers: { "User-Agent": "Mozilla/5.0 (compatible; EiC-LeadBot/1.0)" }, redirect: "follow" });
      if (!res.ok) continue;
      const html = await res.text();
      if (HIRING_RE.test(html)) return true;
    } catch { continue; }
  }
  return false;
}

// ── Google Maps: Text Search paginata (fino a ~60 risultati) ──────────────────
interface GPlace {
  place_id: string;
  name: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
}

// ── OpenStreetMap / Overpass — fonte GRATUITA senza chiave ────────────────────
// Nominatim geolocalizza città/regione → Overpass estrae le imprese con nome,
// telefono, sito, EMAIL (tag contact:email/email), indirizzo, categoria.
// v2: ricerca area-wide (regione/provincia intera via Overpass area, non solo
// bbox città), targeting per mestiere, multi-città ("Milano, Monza, Como").
interface OsmBiz { name: string; phone: string | null; website: string | null; email: string | null; address: string | null; city: string | null; category: string | null; lat?: number; lng?: number; }

/** keyword italiana → filtri tag OSM mirati. Ritorna [] se il mestiere non è
 *  riconosciuto (in quel caso si usa il set edile completo). */
function osmTagsForKeyword(kw: string): string[] {
  const k = kw.toLowerCase();
  const t: string[] = [];
  if (/idraul|termoidraul/.test(k)) t.push('"craft"="plumber"', '"craft"="hvac"');
  if (/elettricist/.test(k)) t.push('"craft"="electrician"');
  if (/serrament|infiss|finestre|vetr/.test(k)) t.push('"craft"~"window_construction|glaziery"', '"shop"="window_blind"');
  if (/falegnam|carpent/.test(k)) t.push('"craft"~"carpenter|joiner"');
  if (/imbianch|pittur|decorat/.test(k)) t.push('"craft"="painter"');
  if (/tett|copertur|lattoner/.test(k)) t.push('"craft"~"roofer|tinsmith"');
  if (/piastrell|pavim/.test(k)) t.push('"craft"~"tiler|flooring"');
  if (/giardin|verde|paesagg/.test(k)) t.push('"craft"="gardener"', '"shop"="garden_centre"');
  if (/architett/.test(k)) t.push('"office"="architect"');
  if (/geometr|ingegn|studio tecnic/.test(k)) t.push('"office"~"engineer|surveyor"');
  if (/impresa|costruz|edil|ristruttur|general contractor/.test(k)) {
    t.push('"craft"="builder"', '"office"="construction_company"', '"industrial"="construction"');
  }
  if (/ferrament|material.*edil|rivendit/.test(k)) t.push('"shop"~"trade|doityourself|hardware"');
  if (/scav|movimento terra|demoliz/.test(k)) t.push('"craft"~"builder"', '"industrial"="construction"');
  if (/ponteggi/.test(k)) t.push('"craft"="scaffolder"');
  if (/cartongess|controsoffitt/.test(k)) t.push('"craft"="plasterer"');
  return [...new Set(t)];
}
const OSM_BROAD_TAGS = [
  '"craft"~"builder|carpenter|electrician|plumber|painter|roofer|hvac|stonemason|scaffolder|tiler|plasterer|glaziery|window_construction"',
  '"office"~"architect|engineer|construction_company|surveyor"',
  '"shop"~"trade|doityourself|hardware"',
  '"industrial"="construction"',
];

async function osmSearch(keyword: string, city: string, region: string, max: number): Promise<OsmBiz[]> {
  const UA = "EiC-LeadBot/1.0 (edilizia in cloud lead scraper)";
  const targeted = osmTagsForKeyword(keyword);
  const tags = targeted.length ? targeted : OSM_BROAD_TAGS;

  // Zone: multi-città separate da virgola; senza città → regione/provincia INTERA.
  const zones = city
    ? city.split(",").map((c) => c.trim()).filter(Boolean)
    : [region.trim()].filter(Boolean);
  if (zones.length === 0) return [];

  const out: OsmBiz[] = [];
  const seen = new Set<string>();

  for (const zone of zones.slice(0, 5)) { // max 5 zone per ricerca
    // 1) Nominatim: risolvi la zona. Preferisci il risultato amministrativo →
    //    area Overpass (copre TUTTO il comune/provincia/regione, non solo il bbox).
    const q = encodeURIComponent([zone, city ? region : "", "Italia"].filter(Boolean).join(", "));
    const geoRes = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=3`, {
      timeoutMs: 10000, headers: { "User-Agent": UA, Accept: "application/json" },
    });
    const geo = await geoRes.json().catch(() => []);
    const relation = (Array.isArray(geo) ? geo : []).find((g: any) => g.osm_type === "relation");
    const place = relation || (Array.isArray(geo) ? geo[0] : null);
    if (!place) continue;

    // 2) query Overpass: area amministrativa se disponibile, altrimenti bbox
    let spatial: string;
    let header = "";
    if (place.osm_type === "relation" && place.osm_id) {
      const areaId = 3600000000 + Number(place.osm_id); // relazione → area id
      header = `area(${areaId})->.z;`;
      spatial = "(area.z)";
    } else {
      const [south, north, west, east] = place.boundingbox.map(Number);
      spatial = `(${south},${west},${north},${east})`;
    }
    // Aree amministrative grandi (provincia/regione): una query con tutti i tag
    // insieme manda in timeout l'endpoint pubblico → spezza per gruppo di tag e
    // prova più mirror in fallback.
    const MIRRORS = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
    ];
    const runOverpass = async (ql: string): Promise<any[]> => {
      let lastErr = "";
      for (const url of MIRRORS) {
        try {
          const res = await fetchWithTimeout(url, {
            timeoutMs: 40000, method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
            body: `data=${encodeURIComponent(ql)}`,
          });
          if (!res.ok) { lastErr = `Overpass ${res.status}`; continue; }
          const d = await res.json().catch(() => null);
          if (d?.elements) return d.elements;
          lastErr = "risposta non valida";
        } catch (e) { lastErr = (e as Error).message; }
      }
      throw new Error(lastErr || "tutti i mirror Overpass hanno fallito");
    };

    const isArea = !!header;
    const groups = isArea ? tags.map((t) => [t]) : [tags]; // area → una query per tag
    const elements: any[] = [];
    for (const group of groups) {
      const body = group.map((f) => `nwr[${f}]${spatial};`).join("");
      const ql = `[out:json][timeout:30];${header}(${body});out center ${Math.min(400, max * 4)};`;
      try {
        elements.push(...await runOverpass(ql));
      } catch (e) {
        // un gruppo fallito non azzera la ricerca: continua con gli altri
        console.warn(`[osm] gruppo tag fallito (${group[0].slice(0, 40)}…):`, (e as Error).message);
      }
      if (elements.length >= max * 4) break;
    }
    if (elements.length === 0 && groups.length > 0) throw new Error("Overpass timeout/nessun mirror disponibile — riprova tra poco o restringi l'area");

    for (const el of elements) {
      const t = el.tags || {};
      const name = t.name || t["operator"] || null;
      if (!name) continue;
      const nk = String(name).trim().toLowerCase();
      if (seen.has(nk)) continue;
      seen.add(nk);
      const addr = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || null;
      const rawEmail = t["contact:email"] || t["email"] || null;
      const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(rawEmail)) ? String(rawEmail).toLowerCase() : null;
      out.push({
        name: String(name),
        phone: t["contact:phone"] || t["phone"] || null,
        website: t["contact:website"] || t["website"] || null,
        email,
        address: addr,
        city: t["addr:city"] || (city ? zone : null),
        category: t["craft"] || t["office"] || t["shop"] || t["industrial"] || null,
        lat: el.lat ?? el.center?.lat,
        lng: el.lon ?? el.center?.lon,
      });
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  return out;
}

async function googleTextSearch(query: string, key: string, maxResults: number): Promise<GPlace[]> {
  const results: GPlace[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 3 && results.length < maxResults; page++) {
    const params = new URLSearchParams({ query, language: "it", region: "it", key });
    if (pageToken) params.set("pagetoken", pageToken);
    // next_page_token diventa valido dopo ~2s
    if (pageToken) await new Promise((r) => setTimeout(r, 2100));
    const res = await fetchWithTimeout(`${GMAPS}/textsearch/json?${params}`, { timeoutMs: 15000 });
    const data = await res.json();
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Google Places: ${data.status}${data.error_message ? " — " + data.error_message : ""}`);
    }
    for (const p of data.results || []) {
      results.push({
        place_id: p.place_id,
        name: p.name,
        formatted_address: p.formatted_address,
        rating: p.rating,
        user_ratings_total: p.user_ratings_total,
      });
    }
    pageToken = data.next_page_token || null;
    if (!pageToken) break;
  }
  return results.slice(0, maxResults);
}

async function googlePlaceDetails(placeId: string, key: string) {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "formatted_phone_number,international_phone_number,website,formatted_address,address_components",
    language: "it",
    key,
  });
  const res = await fetchWithTimeout(`${GMAPS}/details/json?${params}`, { timeoutMs: 12000 });
  const data = await res.json();
  const r = data.result || {};
  const comp = r.address_components || [];
  const get = (t: string) => comp.find((c: any) => c.types?.includes(t))?.long_name || "";
  return {
    phone: r.international_phone_number || r.formatted_phone_number || null,
    website: r.website || null,
    address: r.formatted_address || null,
    city: get("locality") || get("administrative_area_level_3") || null,
    region: get("administrative_area_level_1") || null,
  };
}

// ── AI: qualificazione lead 0-100 vs ICP ──────────────────────────────────────
const ICP_DEFAULT =
  "Impresa edile / impresa di costruzioni / studio tecnico / general contractor in Italia, " +
  "5-50 dipendenti, che gestisce cantieri, preventivi, DDT e fatture e trarrebbe beneficio da " +
  "un gestionale cloud (Edilizia in Cloud).";

async function qualifyLeads(
  supabaseAdmin: any,
  leads: Array<{ id: string; business_name: string; website?: string | null; address?: string | null; rating?: number | null; reviews_count?: number | null }>,
  icp: string,
): Promise<Array<{ id: string; ai_score: number; ai_label: "hot" | "warm" | "cold"; ai_reason: string }>> {
  const compact = leads.map((l, i) => ({
    i,
    nome: l.business_name,
    sito: l.website || "—",
    indirizzo: l.address || "—",
    rating: l.rating ?? "—",
    recensioni: l.reviews_count ?? "—",
  }));
  const sys =
    "Sei un analista di lead B2B. Valuta ogni azienda rispetto all'Ideal Customer Profile (ICP) e assegna " +
    "un punteggio 0-100 (100 = fit perfetto). Considera coerenza del settore, presenza di un sito web, " +
    "dimensione plausibile, segnali di attività (recensioni). Rispondi SOLO con JSON valido.";
  const user =
    `ICP: ${icp}\n\nAziende (array, usa l'indice "i"):\n${JSON.stringify(compact)}\n\n` +
    `Rispondi con: {"results":[{"i":0,"score":0-100,"label":"hot|warm|cold","reason":"<max 12 parole in italiano>"}]}. ` +
    `label: hot se score>=70, warm se 40-69, cold se <40.`;

  const out = await aiRouterComplete({
    supabase: supabaseAdmin,
    taskKey: "lead_qualify",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    params: { temperature: 0.2, max_tokens: 1500 },
    responseFormat: { type: "json_object" },
  });

  let parsed: { results?: Array<{ i: number; score: number; label: string; reason: string }> } | null = null;
  try {
    parsed = extractJsonFromLLM(out.content);
  } catch {
    parsed = null;
  }
  const rows = parsed?.results || [];
  const mapped: Array<{ id: string; ai_score: number; ai_label: "hot" | "warm" | "cold"; ai_reason: string }> = [];
  for (const row of rows) {
    const lead = leads[row.i];
    if (!lead) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(row.score) || 0)));
    const label = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
    mapped.push({ id: lead.id, ai_score: score, ai_label: label, ai_reason: String(row.reason || "").slice(0, 200) });
  }
  return mapped;
}

// ── Handler ───────────────────────────────────────────────────────────────────
serveConMetriche("lead-scraper", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Body JSON non valido", 400, corsH);
    }
    const action = String(body.action || "");

    // ════════════════════════════ SEARCH ════════════════════════════
    if (action === "search") {
      const source = String(body.source || "google_maps");

      // ── LinkedIn (persone) via Google Custom Search — free tier 100/giorno ──
      if (source === "linkedin") {
        // Serper.dev è preferito (≈$0.30/1000, più economico); fallback su Google CSE (gratis 100/g)
        const serperKey = await getPlatformSetting("serper_api_key", "SERPER_API_KEY");
        const cseKey = await getPlatformSetting("google_cse_api_key", "GOOGLE_CSE_API_KEY");
        const cseCx = await getPlatformSetting("google_cse_cx", "GOOGLE_CSE_CX");
        if (!serperKey && !(cseKey && cseCx)) {
          return errorResponse(
            "Fonte LinkedIn non configurata: imposta serper_api_key (Serper.dev, ≈$0.30/1000) OPPURE google_cse_api_key + google_cse_cx (Google Programmable Search, gratis 100/giorno).",
            400, corsH,
          );
        }
        const keyword = String(body.keyword || "").trim();
        const city = String(body.city || "").trim();
        if (!keyword) return errorResponse("Parametro 'keyword' obbligatorio (es. 'titolare impresa edile').", 400, corsH);
        const q = `site:linkedin.com/in/ ${keyword} ${city}`.trim();
        let items: Array<{ title: string; link: string; snippet: string }>;
        try {
          items = serperKey ? await serperSearch(q, serperKey, 10) : await googleCseSearch(q, cseKey, cseCx);
        } catch (e) {
          return errorResponse(`Ricerca LinkedIn fallita: ${(e as Error).message}`, 502, corsH);
        }
        const peopleRows = items
          .filter((it) => /linkedin\.com\/in\//i.test(it.link))
          .map((it) => {
            const { name, role } = parseLinkedinTitle(it.title);
            const base = {
              source: "linkedin",
              business_name: name || it.title.slice(0, 80),
              contact_name: name,
              role,
              linkedin_url: it.link,
              city: city || null,
              country: "IT",
              raw: { snippet: it.snippet },
            };
            return { ...base, dedupe_key: `li:${it.link}` };
          });

        const { data: searchRow, error: sErr } = await supabaseAdmin
          .from("lead_scraper_searches")
          .insert({
            created_by: userId, source: "linkedin",
            label: body.label || `LinkedIn · ${keyword}${city ? " · " + city : ""}`,
            query: { keyword, city }, status: "completed", results_count: peopleRows.length,
          })
          .select("id").single();
        if (sErr) return errorResponse(`Errore salvataggio ricerca: ${sErr.message}`, 500, corsH);

        const { data: inserted, error: rErr } = await supabaseAdmin
          .from("lead_scraper_results")
          .upsert(peopleRows.map((r) => ({ ...r, search_id: searchRow.id })), { onConflict: "search_id,dedupe_key", ignoreDuplicates: true })
          .select("*");
        if (rErr) return errorResponse(`Errore salvataggio lead: ${rErr.message}`, 500, corsH);

        return jsonResponse({ searchId: searchRow.id, count: (inserted || []).length, results: inserted || [] }, 200, corsH);
      }

      // ── INTERNO (scraper self-host + DB proprietario riuso-first) — costo ~€0 ──
      if (source === "internal") {
        const internalUrl = (await getPlatformSetting("internal_scraper_url", "INTERNAL_SCRAPER_URL")).replace(/\/$/, "");
        const internalSecret = await getPlatformSetting("internal_scraper_secret", "INTERNAL_SCRAPER_SECRET");
        const keyword = String(body.keyword || "").trim();
        const city = String(body.city || "").trim();
        const region = String(body.region || "").trim();
        const maxResults = Math.max(1, Math.min(200, Number(body.maxResults) || 40));
        const engine = body.engine === "gmaps" ? "gmaps" : "paginegialle";
        const refresh = body.refresh === true;
        if (!keyword) return errorResponse("Parametro 'keyword' obbligatorio.", 400, corsH);

        const kw = keyword.toLowerCase();
        // 1) RIUSO dal database proprietario (gratis)
        const reuseQuery = () => {
          let q = supabaseAdmin.from("scraped_companies").select("*").contains("categories", [kw]);
          if (city) q = q.ilike("city", `%${city}%`);
          return q.order("last_scraped_at", { ascending: false }).limit(maxResults);
        };
        let { data: pool } = await reuseQuery();
        pool = pool || [];
        let scrapedNew = 0;

        // 2) SCRAPA solo se servono nuovi (o refresh forzato)
        if (refresh || pool.length < maxResults) {
          if (!internalUrl) {
            if (pool.length === 0) {
              return errorResponse("Fonte interna non configurata: imposta internal_scraper_url (URL del tuo scraper-worker self-host). Vedi scraper-worker/README.md.", 400, corsH);
            }
            // ho cache → la uso comunque
          } else {
            try {
              const res = await fetchWithTimeout(`${internalUrl}/scrape`, {
                timeoutMs: 130000,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ secret: internalSecret, engine, keyword, city, max: maxResults, withEmails: body.extractEmails !== false }),
              });
              if (!res.ok) {
                const t = await res.text();
                throw new Error(`worker ${res.status}: ${t.slice(0, 150)}`);
              }
              const d = await res.json();
              const scraped: any[] = d.results || [];
              if (scraped.length) {
                // 3) UPSERT nel DB proprietario (merge categorie) → asset che cresce
                const rows = scraped.map((b) => {
                  const dk = b.place_id
                    ? `g:${b.place_id}`
                    : b.phone
                      ? `p:${String(b.phone).replace(/[^0-9+]/g, "")}`
                      : `n:${String(b.business_name || "").trim().toLowerCase()}|${String(b.city || city || "").toLowerCase()}`;
                  // source: prima restava NULL nel DB proprietario (reporting cieco)
                  return { ...b, region: b.region || region || null, source: b.source || `internal_${engine}`, dedupe_key: dk, categories: [kw] };
                });
                const { error: upErr } = await supabaseAdmin.rpc("scraped_companies_upsert", { p_rows: rows });
                if (upErr) console.error("internal: scraped_companies_upsert fallita:", upErr.message);
                scrapedNew = upErr ? 0 : rows.length;
                const re = await reuseQuery();
                pool = re.data || pool;
              }
            } catch (e) {
              if (pool.length === 0) return errorResponse(`Scraper interno non raggiungibile: ${(e as Error).message}`, 502, corsH);
              // altrimenti degrado alla cache
            }
          }
        }

        // 4) costruisci i lead della ricerca dal pool (DB proprietario)
        const rows = pool.slice(0, maxResults).map((c: any) => {
          const base = {
            source: "internal",
            business_name: c.business_name,
            phone: c.phone || null,
            email: c.email || null,
            email_status: c.email ? "found" : null,
            website: c.website || null,
            address: c.address || null,
            city: c.city || city || null,
            region: c.region || region || null,
            country: c.country || "IT",
            partita_iva: c.partita_iva || null,
            place_id: c.place_id || null,
            rating: c.rating ?? null,
            reviews_count: c.reviews_count ?? null,
          };
          return { ...base, dedupe_key: c.dedupe_key };
        });

        const { data: searchRow, error: sErr } = await supabaseAdmin.from("lead_scraper_searches").insert({
          created_by: userId, source: "internal",
          label: body.label || `Interno · ${keyword}${city ? " · " + city : ""}`,
          query: { keyword, city, region, engine, reused: pool.length - scrapedNew, scrapedNew },
          status: "completed", results_count: rows.length,
        }).select("id").single();
        if (sErr) return errorResponse(`Errore salvataggio ricerca: ${sErr.message}`, 500, corsH);

        const { data: inserted, error: rErr } = await supabaseAdmin.from("lead_scraper_results")
          .upsert(rows.map((r) => ({ ...r, search_id: searchRow.id })), { onConflict: "search_id,dedupe_key", ignoreDuplicates: true })
          .select("*");
        if (rErr) return errorResponse(`Errore salvataggio lead: ${rErr.message}`, 500, corsH);

        return jsonResponse({
          searchId: searchRow.id,
          count: (inserted || []).length,
          withEmail: (inserted || []).filter((r: any) => r.email).length,
          withPhone: (inserted || []).filter((r: any) => r.phone).length,
          scrapedNew, reused: Math.max(0, (inserted || []).length - scrapedNew),
          results: inserted || [],
        }, 200, corsH);
      }

      // ── Apollo.io (decisori + email) — free tier + crediti economici ──
      // ── Company Search (openapi.it) — liste imprese italiane dal Registro ──
      if (source === "company_search") {
        const token = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");
        if (!token) return errorResponse("Fonte Company Search non configurata: imposta openapi_it_token (openapi.it → attiva il servizio Company Search).", 400, corsH);
        const keyword = String(body.keyword || "").trim();
        const region = String(body.region || "").trim();
        // la UI riusa il campo "città" per la sigla provincia (es. MI) su questa fonte
        const provincia = String(body.provincia || body.province || body.city || "").trim().toUpperCase();
        // se la keyword è un codice ATECO (cifre) usala come filtro ATECO, altrimenti come nome
        const ateco = String(body.ateco || "").trim() || (/^\d{2}/.test(keyword) ? keyword.replace(/[^\d.]/g, "") : "");
        const companyName = ateco ? String(body.companyName || "").trim() : keyword;
        const max = Math.max(1, Math.min(100, Number(body.maxResults) || 40));
        const cbase = await openapiBase();
        // 1) ricerca → lista di ID
        let ids: string[];
        try {
          ids = await companySearchIds({
            ateco, companyName,
            province: provincia.length === 2 ? provincia : undefined,
            limit: max,
          }, token, cbase);
        } catch (e) {
          return errorResponse(`Company Search fallita: ${(e as Error).message}`, 502, corsH);
        }
        // 2) dettaglio per ogni ID (IT-advanced: P.IVA + ATECO + PEC + SdI)
        const details = (await poolMap(ids.slice(0, max), 6, (id: string) => companyDetail(id, token, cbase, "IT-advanced"))).filter(Boolean);
        try { await supabaseAdmin.rpc("lead_scraper_bump_usage", { p_provider: "openapi_company_search", p_n: 1 + details.length }); } catch { /* best-effort */ }
        const rows = details.map((c: any) => {
          const ro = c.address?.registeredOffice || c.address || {};
          const atecoObj = c.atecoClassification?.ateco || {};
          const pivaRaw = c.vatCode || c.taxCode || null;
          const town = ro.town || null;
          const pec = c.pec || null;
          const base = {
            source: "company_search",
            business_name: c.companyName || "Azienda",
            partita_iva: pivaRaw ? String(pivaRaw).replace(/\D/g, "") : null,
            city: town,
            region: ro.region?.description || region || null,
            address: [ro.streetName, ro.zipCode, town].filter(Boolean).join(", ") || null,
            ateco: atecoObj.code || null,
            ateco_desc: atecoObj.description || null,
            anno_fondazione: c.startDate ? (Number(String(c.startDate).slice(0, 4)) || null) : null,
            forma_giuridica: c.detailedLegalForm?.description || c.legalForm || null,
            email: pec && /@/.test(String(pec)) ? String(pec).toLowerCase() : null,
            email_status: pec && /@/.test(String(pec)) ? "pec" : null,
            country: "IT",
            raw: { openapi_id: c.id, sdi_code: c.sdiCode || null, province: ro.province || null, activity: c.activityStatus || null, source: "openapi_company_search" },
          };
          const dk = base.partita_iva ? `piva:${base.partita_iva}` : `n:${base.business_name.toLowerCase()}|${(town || "").toLowerCase()}`;
          return { ...base, dedupe_key: dk };
        });
        const seenK = new Set<string>();
        const uniq = rows.filter((r) => (seenK.has(r.dedupe_key) ? false : (seenK.add(r.dedupe_key), true)));
        const { data: searchRow, error: sErr } = await supabaseAdmin.from("lead_scraper_searches").insert({
          created_by: userId, source: "company_search",
          label: body.label || `Registro Imprese · ${ateco ? "ATECO " + ateco : (keyword || "imprese")}${provincia ? " · " + provincia : ""}`,
          query: { keyword, region, provincia, ateco }, status: "completed", results_count: uniq.length,
        }).select("id").single();
        if (sErr) return errorResponse(`Errore salvataggio ricerca: ${sErr.message}`, 500, corsH);
        const { data: inserted, error: rErr } = await supabaseAdmin.from("lead_scraper_results")
          .upsert(uniq.map((r) => ({ ...r, search_id: searchRow.id })), { onConflict: "search_id,dedupe_key", ignoreDuplicates: true }).select("*");
        if (rErr) return errorResponse(`Errore salvataggio lead: ${rErr.message}`, 500, corsH);
        return jsonResponse({ searchId: searchRow.id, count: (inserted || []).length, withPiva: (inserted || []).filter((r: any) => r.partita_iva).length, results: inserted || [] }, 200, corsH);
      }

      if (source === "apollo") {
        const apolloKey = await getPlatformSetting("apollo_api_key", "APOLLO_API_KEY");
        if (!apolloKey) return errorResponse("Fonte Apollo non configurata: imposta apollo_api_key (apollo.io — free tier + crediti a basso costo).", 400, corsH);
        const keyword = String(body.keyword || "").trim();
        const city = String(body.city || "").trim();
        const titles = Array.isArray(body.titles) && body.titles.length
          ? body.titles.map(String)
          : ["owner", "ceo", "founder", "titolare", "amministratore", "general manager"];
        const perPage = Math.max(1, Math.min(50, Number(body.maxResults) || 25));
        let people: any[];
        try {
          people = await apolloPeopleSearch({ titles, keyword: keyword || "construction", location: city || "Italy", perPage }, apolloKey);
        } catch (e) {
          return errorResponse(`Ricerca Apollo fallita: ${(e as Error).message}`, 502, corsH);
        }
        const rows = people.map((p: any) => {
          const org = p.organization || {};
          const email = p.email && !/email_not_unlocked/i.test(p.email) ? String(p.email).toLowerCase() : null;
          const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
          const base = {
            source: "apollo",
            business_name: org.name || name || "Lead",
            contact_name: name,
            role: p.title || null,
            email,
            email_status: email ? "found" : null,
            website: org.website_url || (org.primary_domain ? `https://${org.primary_domain}` : null),
            linkedin_url: p.linkedin_url || null,
            city: p.city || city || null,
            country: "IT",
            raw: { apollo_id: p.id, org_domain: org.primary_domain },
          };
          const dk = email ? `p:${email}` : (p.linkedin_url ? `li:${p.linkedin_url}` : `n:${(base.business_name + (name || "")).toLowerCase()}`);
          return { ...base, dedupe_key: dk };
        });
        const seenK = new Set<string>();
        const uniq = rows.filter((r) => (seenK.has(r.dedupe_key) ? false : (seenK.add(r.dedupe_key), true)));
        const { data: searchRow, error: sErr } = await supabaseAdmin.from("lead_scraper_searches").insert({
          created_by: userId, source: "apollo",
          label: body.label || `Apollo · ${keyword || "edili"}${city ? " · " + city : ""}`,
          query: { keyword, city, titles }, status: "completed", results_count: uniq.length,
        }).select("id").single();
        if (sErr) return errorResponse(`Errore salvataggio ricerca: ${sErr.message}`, 500, corsH);
        const { data: inserted, error: rErr } = await supabaseAdmin.from("lead_scraper_results")
          .upsert(uniq.map((r) => ({ ...r, search_id: searchRow.id })), { onConflict: "search_id,dedupe_key", ignoreDuplicates: true }).select("*");
        if (rErr) return errorResponse(`Errore salvataggio lead: ${rErr.message}`, 500, corsH);
        return jsonResponse({ searchId: searchRow.id, count: (inserted || []).length, withEmail: (inserted || []).filter((r: any) => r.email).length, results: inserted || [] }, 200, corsH);
      }

      // ── Apify Google Maps actor (business + email) — $5 free/mese ──
      if (source === "apify_maps") {
        const apifyToken = await getPlatformSetting("apify_api_token", "APIFY_API_TOKEN");
        if (!apifyToken) return errorResponse("Fonte Apify non configurata: imposta apify_api_token (apify.com — $5 free/mese).", 400, corsH);
        const keyword = String(body.keyword || "").trim();
        const city = String(body.city || "").trim();
        if (!keyword) return errorResponse("Parametro 'keyword' obbligatorio.", 400, corsH);
        const max = Math.max(1, Math.min(120, Number(body.maxResults) || 30));
        let items: any[];
        try {
          items = await apifyGoogleMaps({ keyword, city, max }, apifyToken);
        } catch (e) {
          return errorResponse(`Apify fallito: ${(e as Error).message}`, 502, corsH);
        }
        const rows = (items || []).map((p: any) => {
          const email = Array.isArray(p.emails) && p.emails[0] ? String(p.emails[0]).toLowerCase() : null;
          const base = {
            source: "apify_maps",
            business_name: p.title || p.name || "Lead",
            phone: p.phone || p.phoneUnformatted || null,
            website: p.website || null,
            address: p.address || null,
            city: p.city || city || null,
            country: "IT",
            place_id: p.placeId || null,
            rating: typeof p.totalScore === "number" ? p.totalScore : null,
            reviews_count: typeof p.reviewsCount === "number" ? p.reviewsCount : null,
            email, email_status: email ? "found" : null,
          };
          return { ...base, dedupe_key: dedupeKey(base) };
        });
        const seenK = new Set<string>();
        const uniq = rows.filter((r) => (r.business_name && !seenK.has(r.dedupe_key) ? (seenK.add(r.dedupe_key), true) : false)).slice(0, max);
        const { data: searchRow, error: sErr } = await supabaseAdmin.from("lead_scraper_searches").insert({
          created_by: userId, source: "apify_maps",
          label: body.label || `Apify Maps · ${keyword}${city ? " · " + city : ""}`,
          query: { keyword, city, max }, status: "completed", results_count: uniq.length,
        }).select("id").single();
        if (sErr) return errorResponse(`Errore salvataggio ricerca: ${sErr.message}`, 500, corsH);
        const { data: inserted, error: rErr } = await supabaseAdmin.from("lead_scraper_results")
          .upsert(uniq.map((r) => ({ ...r, search_id: searchRow.id })), { onConflict: "search_id,dedupe_key", ignoreDuplicates: true }).select("*");
        if (rErr) return errorResponse(`Errore salvataggio lead: ${rErr.message}`, 500, corsH);
        return jsonResponse({ searchId: searchRow.id, count: (inserted || []).length, withEmail: (inserted || []).filter((r: any) => r.email).length, withPhone: (inserted || []).filter((r: any) => r.phone).length, results: inserted || [] }, 200, corsH);
      }

      // ── OSM / OpenStreetMap — fonte GRATUITA senza chiave ──────────────────
      if (source === "osm") {
        const keyword = String(body.keyword || "").trim();
        const city = String(body.city || "").trim();
        const region = String(body.region || "").trim();
        const max = Math.max(1, Math.min(200, Number(body.maxResults) || 20));
        const extractEmails = body.extractEmails !== false;
        if (!keyword) return errorResponse("Parametro 'keyword' obbligatorio (es. 'impresa edile').", 400, corsH);
        if (!city && !region) return errorResponse("Indica una città (anche più di una: 'Milano, Monza') oppure solo la regione/provincia per una ricerca area-wide.", 400, corsH);

        let biz: OsmBiz[];
        try {
          biz = await osmSearch(keyword, city, region, max);
        } catch (e) {
          return errorResponse(`Ricerca OpenStreetMap fallita: ${(e as Error).message}`, 502, corsH);
        }
        if (biz.length === 0) {
          return jsonResponse({ searchId: null, count: 0, withEmail: 0, withPhone: 0, results: [], note: "Nessuna impresa mappata su OpenStreetMap per questi criteri. OSM ha copertura variabile: prova un'area più ampia o un'altra fonte." }, 200, corsH);
        }

        // email: prima dai tag OSM (già pubbliche), poi best-effort dai siti
        const emails = extractEmails
          ? await poolMap(biz.map((b) => (b.email ? "" : b.website || "")), 5, (w) => (w ? extractEmailFromSite(w) : Promise.resolve(null)))
          : biz.map(() => null);

        const rows = biz.map((b, i) => {
          const email = b.email || emails[i] || null;
          const base = {
            source: "osm",
            business_name: b.name,
            phone: b.phone || null,
            website: b.website || null,
            address: b.address || null,
            city: b.city || city || null,
            region: region || null,
            country: "IT",
            email,
            email_status: email ? "found" : null,
            raw: b.category ? { osm_category: b.category } : null,
          };
          return { ...base, dedupe_key: dedupeKey(base) };
        });

        // tag seen_before
        const dkeys = rows.map((r) => r.dedupe_key).filter(Boolean);
        const seenKeys = new Set<string>();
        if (dkeys.length) {
          const { data: prev } = await supabaseAdmin.from("lead_scraper_results").select("dedupe_key").in("dedupe_key", dkeys);
          for (const row of prev || []) if (row.dedupe_key) seenKeys.add(row.dedupe_key);
        }

        const label = body.label || `${keyword}${city ? " · " + city : ""}${region ? " · " + region : ""} · OSM`;
        const { data: searchRow, error: sErr } = await supabaseAdmin
          .from("lead_scraper_searches")
          .insert({ created_by: userId, source: "osm", label, query: { keyword, city, region, maxResults: max, extractEmails }, status: "completed", results_count: rows.length })
          .select("id").single();
        if (sErr) return errorResponse(`Errore salvataggio ricerca: ${sErr.message}`, 500, corsH);

        const toInsert = rows.map((r) => ({ ...r, search_id: searchRow.id, seen_before: seenKeys.has(r.dedupe_key) }));
        const { data: inserted, error: rErr } = await supabaseAdmin
          .from("lead_scraper_results")
          .upsert(toInsert, { onConflict: "search_id,dedupe_key", ignoreDuplicates: true })
          .select("*");
        if (rErr) return errorResponse(`Errore salvataggio lead: ${rErr.message}`, 500, corsH);

        return jsonResponse({
          searchId: searchRow.id, label,
          count: (inserted || []).length,
          withEmail: (inserted || []).filter((r: any) => r.email).length,
          withPhone: (inserted || []).filter((r: any) => r.phone).length,
          results: inserted || [],
        }, 200, corsH);
      }

      if (source !== "google_maps") {
        // Explorium gated — verifica chiave, altrimenti messaggio chiaro
        const k = await getPlatformSetting("explorium_api_key", "EXPLORIUM_API_KEY");
        if (!k) {
          return errorResponse(
            `Fonte "${source}" non configurata: imposta explorium_api_key in platform_settings per attivarla.`,
            400, corsH,
          );
        }
        return errorResponse(`Fonte "${source}" in arrivo (chiave presente, integrazione fase 2).`, 501, corsH);
      }

      const keyword = String(body.keyword || "").trim();
      const city = String(body.city || "").trim();
      const region = String(body.region || "").trim();
      const mode = body.mode === "grid" ? "grid" : "text";
      const hardCap = mode === "grid" ? 200 : 60;
      const maxResults = Math.max(1, Math.min(hardCap, Number(body.maxResults) || (mode === "grid" ? 120 : 20)));
      const extractEmails = body.extractEmails !== false; // default true
      if (!keyword) return errorResponse("Parametro 'keyword' obbligatorio (es. 'impresa edile').", 400, corsH);

      const GKEY = await getPlatformSetting("google_maps_api_key", "GOOGLE_MAPS_API_KEY");
      if (!GKEY) return errorResponse("google_maps_api_key non configurata in platform_settings.", 500, corsH);

      // guard rail anti-bolletta
      const quota = await checkQuota(supabaseAdmin, "google_places");
      if (!quota.ok) {
        return errorResponse(`Quota giornaliera Google raggiunta (${quota.used}/${quota.cap}). Riprova domani o aumenta lead_scraper_google_daily_cap.`, 429, corsH);
      }

      const queryStr = [keyword, city, region].filter(Boolean).join(" ");
      const label = body.label || `${keyword}${city ? " · " + city : ""}${region ? " · " + region : ""}${mode === "grid" ? " · grid" : ""}`;

      // 1) raccogli i place
      let places: GPlace[];
      try {
        if (mode === "grid") {
          const center = await geocodeQuery(queryStr, GKEY);
          await bumpUsage(supabaseAdmin, "google_places", 1);
          if (!center) return errorResponse("Impossibile geolocalizzare l'area per il geo-grid.", 502, corsH);
          // Guard-rail costo: il solo check iniziale di quota non basta — il grid
          // fa gridSize² chiamate nearby (a pagamento). Riduci il grid se siamo
          // vicini al cap giornaliero, così non si sfora di decine di chiamate.
          const remaining = Math.max(0, quota.cap - quota.used);
          let gridSize = Math.max(2, Math.min(5, Number(body.gridSize) || 3)); // NxN
          while (gridSize > 1 && gridSize * gridSize + 1 > remaining) gridSize--;
          const stepLat = 0.018, stepLng = 0.024; // ~2km
          const half = (gridSize - 1) / 2;
          const points: Array<{ lat: number; lng: number }> = [];
          for (let i = 0; i < gridSize; i++)
            for (let j = 0; j < gridSize; j++)
              points.push({ lat: center.lat + (i - half) * stepLat, lng: center.lng + (j - half) * stepLng });
          const chunks = await poolMap(points, 3, async (pt) => {
            const r = await googleNearby(pt.lat, pt.lng, 1600, keyword, GKEY);
            await bumpUsage(supabaseAdmin, "google_places", 1);
            return r;
          });
          places = chunks.flat();
        } else {
          places = await googleTextSearch(queryStr, GKEY, maxResults);
          await bumpUsage(supabaseAdmin, "google_places", 3); // ~3 pagine
        }
      } catch (e) {
        return errorResponse(`Ricerca Google Maps fallita: ${(e as Error).message}`, 502, corsH);
      }

      // 2) dedup per place_id + cap
      const seenIds = new Set<string>();
      places = places.filter((p) => (p.place_id && !seenIds.has(p.place_id) ? (seenIds.add(p.place_id), true) : false)).slice(0, maxResults);

      // 3) details con cache (telefono/sito) — concorrenza 5
      const details = await poolMap(places, 5, (p) => cachedPlaceDetails(supabaseAdmin, p.place_id, GKEY));

      // 4) email best-effort dal sito — concorrenza 5
      const websites = details.map((d: any) => d?.website || "");
      const emails = extractEmails
        ? await poolMap(websites, 5, (w) => (w ? extractEmailFromSite(w) : Promise.resolve(null)))
        : websites.map(() => null);

      // 5) costruisci righe
      const rows = places.map((p, i) => {
        const d = details[i] || ({} as any);
        const base = {
          source: "google_maps",
          business_name: p.name,
          phone: d.phone || null,
          website: d.website || null,
          address: d.address || p.formatted_address || null,
          city: d.city || city || null,
          region: d.region || region || null,
          country: "IT",
          place_id: p.place_id,
          rating: typeof p.rating === "number" ? p.rating : null,
          reviews_count: typeof p.user_ratings_total === "number" ? p.user_ratings_total : null,
          email: emails[i] || null,
          email_status: emails[i] ? "found" : null,
        };
        return { ...base, dedupe_key: dedupeKey(base) };
      });

      // 5b) tag "seen_before": dedupe_key già presente in ricerche precedenti
      const dkeys = rows.map((r) => r.dedupe_key).filter(Boolean);
      const seenKeys = new Set<string>();
      if (dkeys.length) {
        const { data: prev } = await supabaseAdmin
          .from("lead_scraper_results")
          .select("dedupe_key")
          .in("dedupe_key", dkeys);
        for (const row of prev || []) if (row.dedupe_key) seenKeys.add(row.dedupe_key);
      }

      // 6) crea search
      const { data: searchRow, error: sErr } = await supabaseAdmin
        .from("lead_scraper_searches")
        .insert({
          created_by: userId,
          source: "google_maps",
          label,
          query: { keyword, city, region, maxResults, extractEmails, mode },
          status: "completed",
          results_count: rows.length,
        })
        .select("id")
        .single();
      if (sErr) return errorResponse(`Errore salvataggio ricerca: ${sErr.message}`, 500, corsH);

      // 7) inserisci results (dedup intra-ricerca via unique index → upsert ignore)
      const toInsert = rows.map((r) => ({ ...r, search_id: searchRow.id, seen_before: seenKeys.has(r.dedupe_key) }));
      const { data: inserted, error: rErr } = await supabaseAdmin
        .from("lead_scraper_results")
        .upsert(toInsert, { onConflict: "search_id,dedupe_key", ignoreDuplicates: true })
        .select("*");
      if (rErr) return errorResponse(`Errore salvataggio lead: ${rErr.message}`, 500, corsH);

      const emailCount = (inserted || []).filter((r: any) => r.email).length;
      return jsonResponse(
        {
          searchId: searchRow.id,
          label,
          count: (inserted || []).length,
          withEmail: emailCount,
          withPhone: (inserted || []).filter((r: any) => r.phone).length,
          results: inserted || [],
        },
        200,
        corsH,
      );
    }

    // ════════════════════════════ ENRICH (email) ════════════════════════════
    if (action === "enrich") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, website, email")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      const targets = (leads || []).filter((l: any) => l.website && !l.email);
      const found = await poolMap(targets, 5, async (l: any) => ({ id: l.id, email: await extractEmailFromSite(l.website) }));

      let updated = 0;
      for (const f of found) {
        if (f?.email) {
          await supabaseAdmin.from("lead_scraper_results").update({ email: f.email, enriched: true }).eq("id", f.id);
          updated++;
        }
      }
      return jsonResponse({ enriched: updated, attempted: targets.length }, 200, corsH);
    }

    // ════════════════════════════ QUALIFY (AI) ════════════════════════════
    if (action === "qualify") {
      const searchId = String(body.searchId || "");
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      const icp = String(body.icp || "").trim() || ICP_DEFAULT;

      let q = supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, website, address, rating, reviews_count");
      if (ids.length) q = q.in("id", ids);
      else if (searchId) q = q.eq("search_id", searchId);
      else return errorResponse("Specifica searchId o resultIds.", 400, corsH);

      const { data: leads, error } = await q.limit(60);
      if (error) return errorResponse(error.message, 500, corsH);
      if (!leads?.length) return jsonResponse({ qualified: 0 }, 200, corsH);

      let scored: Array<{ id: string; ai_score: number; ai_label: string; ai_reason: string }>;
      try {
        scored = await qualifyLeads(supabaseAdmin, leads, icp);
      } catch (e) {
        return errorResponse(`Qualificazione AI fallita: ${(e as Error).message}`, 502, corsH);
      }

      // Conteggio ONESTO: gli update falliti (record eliminato nel frattempo,
      // permessi) non vengono più riportati come "qualificati".
      let updateFailed = 0;
      for (const s of scored) {
        const { error: uErr } = await supabaseAdmin
          .from("lead_scraper_results")
          .update({ ai_score: s.ai_score, ai_label: s.ai_label, ai_reason: s.ai_reason })
          .eq("id", s.id);
        if (uErr) { updateFailed++; console.error("qualify: update fallito", s.id, uErr.message); }
      }
      return jsonResponse({ qualified: scored.length - updateFailed, update_failed: updateFailed || undefined, results: scored }, 200, corsH);
    }

    // ════════════════════════════ PUSH CRM ════════════════════════════
    if (action === "push_crm") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      const extraTags: string[] = Array.isArray(body.tags) ? body.tags.map(String) : [];
      const createOpp = body.createOpportunity === true;

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("*")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);
      const rows = leads || [];

      // ── GDPR: filtra le email soppresse (unsubscribe/bounce/legal) ──
      const allEmails = rows.map((l: any) => l.email).filter(Boolean);
      const suppressedMap = allEmails.length
        ? await getSuppressedEmailMap(supabaseAdmin, allEmails, PLATFORM_ADMIN_COMPANY_ID, "marketing")
        : new Map();

      // ── Anti-duplicato CRM: contatti già presenti per email o telefono ──
      const phoneDigits = (p: string | null) => (p ? p.replace(/\D/g, "") : "");
      const existingEmails = new Set<string>();
      const existingPhones = new Set<string>();
      if (allEmails.length) {
        const { data: ex } = await supabaseAdmin
          .from("marketing_contacts").select("email")
          .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
          .in("email", allEmails);
        for (const c of ex || []) if (c.email) existingEmails.add(c.email.toLowerCase());
      }
      const allPhones = rows.map((l: any) => l.phone).filter(Boolean);
      if (allPhones.length) {
        const { data: ex } = await supabaseAdmin
          .from("marketing_contacts").select("phone")
          .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
          .in("phone", allPhones);
        for (const c of ex || []) if (c.phone) existingPhones.add(phoneDigits(c.phone));
      }

      // ── Pipeline/stage di default per le opportunità (risolti una sola volta) ──
      let pipelineId: string | null = null, stageId: string | null = null;
      if (createOpp) {
        const { data: pl } = await supabaseAdmin
          .from("marketing_pipelines").select("id")
          .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (pl) {
          pipelineId = pl.id;
          const { data: st } = await supabaseAdmin
            .from("marketing_pipeline_stages").select("id")
            .eq("pipeline_id", pl.id)
            .order("position", { ascending: true }).limit(1).maybeSingle();
          stageId = st?.id || null;
        }
      }

      let pushed = 0, skipped = 0, suppressed = 0, duplicates = 0, opportunities = 0, failed = 0;
      for (const l of rows) {
        if (l.pushed_to_crm) { skipped++; continue; }
        // GDPR
        if (l.email && suppressedMap.has(normalizeEmailAddress(l.email))) { suppressed++; continue; }
        // dedup CRM
        const isDup = (l.email && existingEmails.has(l.email.toLowerCase())) ||
                      (l.phone && existingPhones.has(phoneDigits(l.phone)));
        if (isDup) { duplicates++; continue; }

        const fullName = (l.contact_name || l.business_name || "").trim();
        const parts = fullName.split(/\s+/);
        const first_name = parts[0] || l.business_name || "Lead";
        const last_name = parts.length > 1 ? parts.slice(1).join(" ") : null;

        const tags = Array.from(new Set(["lead-scraper", l.source, l.ai_label, l.ateco ? `ateco:${l.ateco}` : null, ...extraTags].filter(Boolean)));
        const noteBits = [
          l.ateco_desc ? `ATECO: ${l.ateco_desc}` : null,
          l.rating != null ? `Rating: ${l.rating}★ (${l.reviews_count || 0})` : null,
          l.ai_score != null ? `AI: ${l.ai_score}/100 — ${l.ai_reason || ""}` : null,
          l.ai_icebreaker ? `Icebreaker: ${l.ai_icebreaker}` : null,
        ].filter(Boolean);

        const { data: contact, error: cErr } = await supabaseAdmin
          .from("marketing_contacts")
          .insert({
            company_id: PLATFORM_ADMIN_COMPANY_ID,
            first_name, last_name,
            phone: l.phone || null,
            email: l.email || null,
            company_name: l.business_name || null,
            website: l.website || null,
            address: l.address || null,
            city: l.city || null,
            // `region` è il NOME regione (es. "Lombardia"); `province` vuole la
            // sigla (MI/RM). Salva solo se sembra una sigla, altrimenti null.
            province: (l.region && String(l.region).trim().length <= 3)
              ? String(l.region).trim().toUpperCase()
              : null,
            vat_number: l.partita_iva || null,
            country: l.country || "IT",
            tags,
            notes: noteBits.join(" · ") || null,
            source: `lead_scraper:${l.source}`,
          })
          .select("id").single();

        if (!cErr && contact) {
          // evita duplicati intra-batch
          if (l.email) existingEmails.add(l.email.toLowerCase());
          if (l.phone) existingPhones.add(phoneDigits(l.phone));

          let oppId: string | null = null;
          if (createOpp && pipelineId && stageId) {
            const { data: opp } = await supabaseAdmin
              .from("marketing_opportunities")
              .insert({
                company_id: PLATFORM_ADMIN_COMPANY_ID,
                contact_id: contact.id,
                pipeline_id: pipelineId,
                stage_id: stageId,
                name: l.business_name || "Lead",
                company_name: l.business_name || null,
                source: `lead_scraper:${l.source}`,
                status: "open",
                notes: l.ai_icebreaker || null,
              })
              .select("id").single();
            if (opp) { oppId = opp.id; opportunities++; }
          }

          await supabaseAdmin
            .from("lead_scraper_results")
            .update({ pushed_to_crm: true, crm_contact_id: contact.id, crm_opportunity_id: oppId })
            .eq("id", l.id);
          pushed++;
        } else {
          failed++;
        }
      }
      return jsonResponse({ pushed, skipped, suppressed, duplicates, opportunities, failed }, 200, corsH);
    }

    // ════════════════════ DEEP ENRICH (sito → tutto, gratis) ════════════════════
    if (action === "deep_enrich") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      const doVies = body.vies !== false;
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);

      // firmografici opzionali (ATECO/dimensione) — gated dietro openapi.it
      const openapiToken = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, website, phone, email, email_status, contact_name, partita_iva, facebook_url, instagram_url, linkedin_url, ateco, ateco_desc, company_size, fatturato, dipendenti, anno_fondazione, forma_giuridica, intent_signals, enrichment")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let enriched = 0;
      await poolMap(leads || [], 4, async (l: any) => {
        const hasWebsite = !!l.website;
        const deep = hasWebsite ? await scrapeWebsiteDeep(l.website) : null;

        // Merge coi segnali precedenti: senza sito (o scrape fallito) non
        // dobbiamo azzerare quanto già rilevato in passato.
        const signals: Record<string, boolean> = { ...(l.intent_signals || {}), ...(deep?.intent_signals || {}) };
        if (!hasWebsite) signals.no_website = true;

        const bestEmail = l.email || deep?.emails?.[0] || null;
        const bestPhone = l.phone || deep?.phones?.[0] || null;
        const reachable = !!(bestEmail || bestPhone);
        const intent_score = computeIntentScore(signals, reachable, hasWebsite);

        // enrichment JSON: MERGE con l'esistente (validate_vat/find_email/registro
        // scrivono qui: sovrascrivere l'oggetto intero perdeva quei dati).
        const enrichment: Record<string, unknown> = { ...(l.enrichment || {}) };
        if (deep?.phones?.length) enrichment.phones = deep.phones;
        if (deep?.emails?.length) enrichment.emails = deep.emails;
        if (deep?.excerpt) enrichment.site_excerpt = deep.excerpt;

        // P.IVA: quella già nota (Registro/manuale) vince sul parsing del sito.
        const piva: string | null = l.partita_iva || deep?.partita_iva || null;

        // VIES sulla P.IVA disponibile (anche quella già presente sul lead)
        if (doVies && piva) {
          const vies = await viesValidate(piva);
          if (vies) enrichment.vies = vies;
        }

        // Firmografici (ATECO, dimensione, fatturato, dipendenti, anno) + PEC se
        // token openapi configurato. Parti dai valori esistenti: mai regredire a null.
        let ateco: string | null = l.ateco || null, ateco_desc: string | null = l.ateco_desc || null;
        let company_size: string | null = l.company_size || null;
        let fatturato: number | null = l.fatturato ?? null, dipendenti: number | null = l.dipendenti ?? null;
        let anno_fondazione: number | null = l.anno_fondazione ?? null, forma_giuridica: string | null = l.forma_giuridica || null;
        let pecEmail: string | null = null;
        // chiama openapi solo se manca qualcosa (risparmio crediti sul re-run)
        const firmoMissing = !ateco || fatturato == null || dipendenti == null;
        if (openapiToken && piva && firmoMissing) {
          const firmo = await fetchFirmografici(piva, openapiToken, await openapiBase());
          if (firmo) {
            ateco = firmo.ateco || ateco;
            ateco_desc = firmo.ateco_desc || ateco_desc;
            company_size = firmo.company_size || company_size;
            fatturato = firmo.fatturato ?? fatturato;
            dipendenti = firmo.dipendenti ?? dipendenti;
            anno_fondazione = firmo.anno_fondazione ?? anno_fondazione;
            forma_giuridica = firmo.forma_giuridica || forma_giuridica;
            pecEmail = firmo.pec || null;
            enrichment.firmografici = firmo;
          }
        }
        // PEC = email certificata deliverable → usala se non c'è una email
        const finalEmail = bestEmail || pecEmail;
        const finalEmailStatus = l.email
          ? l.email_status
          : (deep?.emails?.length ? "found" : (pecEmail ? "pec" : l.email_status));

        await supabaseAdmin.from("lead_scraper_results").update({
          email: finalEmail,
          phone: bestPhone,
          email_status: finalEmailStatus,
          partita_iva: piva,
          // social: il nuovo scrape vince, ma senza dato mantieni l'esistente
          facebook_url: deep?.facebook_url || l.facebook_url || null,
          instagram_url: deep?.instagram_url || l.instagram_url || null,
          linkedin_url: deep?.linkedin_url || l.linkedin_url || null,
          // NB: la ragione sociale VIES resta in enrichment.vies — NON va in
          // contact_name ("Referente" è una persona; push_crm la spezzerebbe
          // in nome/cognome creando contatti tipo "ROSSI COSTRUZIONI"/"SRL").
          ateco,
          ateco_desc,
          company_size,
          fatturato,
          dipendenti,
          anno_fondazione,
          forma_giuridica,
          intent_signals: signals,
          intent_score,
          enriched: true,
          enrichment,
        }).eq("id", l.id);
        enriched++;
      });

      return jsonResponse({ enriched, attempted: (leads || []).length }, 200, corsH);
    }

    // ═══════ FIND WEBSITE (ricerca sito ufficiale dal nome, gratis) ═══════
    // Input { business_name, city? }. Cerca su DuckDuckGo e restituisce i
    // candidati (dominio+titolo) filtrando aggregatori/social/directory: la
    // scelta finale resta all'operatore (pre-flight dell'arricchimento).
    if (action === "find_website") {
      const businessName: string | null = typeof body.business_name === "string" ? body.business_name.trim() : null;
      const city: string | null = typeof body.city === "string" ? body.city.trim() : null;
      if (!businessName) return errorResponse("business_name richiesto.", 400, corsH);

      const BLOCKED = [
        "duckduckgo.", "paginegialle.", "paginebianche.", "facebook.", "instagram.", "linkedin.",
        "youtube.", "twitter.", "x.com", "tiktok.", "wikipedia.", "reportaziende.", "ufficiocamerale.",
        "registroimprese.", "informazione-aziende.", "aziende.virgilio.", "virgilio.", "cylex", "misterimprese.",
        "infoimprese.", "icribis.", "companyreports.", "trustpilot.", "yelp.", "glassdoor.", "indeed.",
        "subito.it", "immobiliare.it", "amazon.", "ebay.", "trovaprezzi.", "europages.", "kompass.",
        "mappy.", "tuttocitta.", "prontoimprese.", "guidafinestra.", "edilportale.", "wikidata.",
      ];
      const q = `${businessName}${city ? " " + city : ""}`;
      // Motore di ricerca: Serper.dev (preferito) → Google CSE (gratis 100/g) →
      // DuckDuckGo lite (best-effort, spesso rate-limitato server-side).
      const serperKey = await getPlatformSetting("serper_api_key", "SERPER_API_KEY");
      const cseKey = await getPlatformSetting("google_cse_api_key", "GOOGLE_CSE_API_KEY");
      const cseCx = await getPlatformSetting("google_cse_cx", "GOOGLE_CSE_CX");

      const candidates: Array<{ url: string; domain: string; title: string }> = [];
      const seen = new Set<string>();
      const pushCandidate = (link: string, title: string) => {
        if (!/^https?:\/\//i.test(link)) return;
        let host: string;
        try { host = new URL(link).hostname.toLowerCase().replace(/^www\./, ""); } catch { return; }
        if (BLOCKED.some((b) => host.includes(b))) return;
        if (seen.has(host)) return;
        seen.add(host);
        candidates.push({ url: `https://${host}`, domain: host, title: (title || "").slice(0, 120) });
      };

      let items: Array<{ title: string; link: string; snippet: string }> = [];
      let engineUsed = "none";
      try {
        if (serperKey) { items = await serperSearch(q, serperKey, 10); engineUsed = "serper"; }
        else if (cseKey && cseCx) { items = await googleCseSearch(q, cseKey, cseCx); engineUsed = "google_cse"; }
      } catch (e) {
        console.warn(`[find_website] ${engineUsed} fallito:`, (e as Error)?.message);
      }
      for (const it of items) { pushCandidate(it.link, it.title); if (candidates.length >= 5) break; }

      // Fallback affidabile senza chiavi di ricerca: openapi.it (registro imprese).
      // Cerca l'azienda ufficiale per ragione sociale (+ provincia dal contatto)
      // e recupera il sito web dal dettaglio. Costa 1-2 crediti openapi.
      if (candidates.length === 0) {
        const openapiToken = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");
        if (openapiToken) {
          engineUsed = "openapi";
          const base = await openapiBase();
          const province = typeof body.province === "string" && body.province.trim().length === 2 ? body.province.trim().toUpperCase() : undefined;
          const ids = await companySearchIds({ companyName: businessName, province, limit: 5 }, openapiToken, base);
          for (const cid of ids.slice(0, 3)) {
            const det = await companyDetail(cid, openapiToken, base, "IT-start");
            const web = det?.website || det?.web || det?.contacts?.website || det?.registeredOffice?.website || null;
            const denom = det?.companyName || det?.denomination || businessName;
            if (web) pushCandidate(String(web).startsWith("http") ? String(web) : `https://${web}`, denom);
            if (candidates.length >= 5) break;
          }
        }
      }

      return jsonResponse({ candidates, query: q, engine: engineUsed }, 200, corsH);
    }

    // ═══════ ENRICH COMPANY (ad-hoc: dati liberi → tutte le info, gratis) ═══════
    // Input { business_name?, website?, partita_iva?, vies?, contactId? }. Non
    // richiede una riga lead. Se contactId è fornito, riempie i campi vuoti del
    // contatto CRM (così "arricchisci l'azienda di un'opportunità" è closed-loop).
    if (action === "enrich_company") {
      const website: string | null = typeof body.website === "string" ? body.website.trim() : null;
      let piva: string | null = typeof body.partita_iva === "string" ? body.partita_iva.replace(/\s/g, "") : null;
      const businessName: string | null = typeof body.business_name === "string" ? body.business_name.trim() : null;
      const doVies = body.vies !== false;
      const contactId: string | null = typeof body.contactId === "string" ? body.contactId : null;
      if (!website && !piva && !businessName) {
        return errorResponse("Fornisci almeno sito, P.IVA o ragione sociale.", 400, corsH);
      }

      const openapiToken = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");
      const result: Record<string, unknown> = {
        input: { website, partita_iva: piva, business_name: businessName },
      };

      // 1) Scraping sito (gratis): email, telefoni, P.IVA, social, segnali
      const deep = website ? await scrapeWebsiteDeep(website) : null;
      if (deep) {
        result.emails = deep.emails;
        result.phones = deep.phones;
        result.phones_classified = deep.phones_classified;
        result.facebook_url = deep.facebook_url;
        result.instagram_url = deep.instagram_url;
        result.linkedin_url = deep.linkedin_url;
        result.intent_signals = deep.intent_signals;
        result.site_excerpt = deep.excerpt;
        // P.IVA letta sul sito, restituita SEPARATA: serve al chiamante per la
        // verifica di coerenza "il sito è davvero di questa azienda?"
        result.site_partita_iva = deep.partita_iva;
        if (deep.partita_iva && !piva) piva = deep.partita_iva;
      }
      result.partita_iva = piva;

      // Segnale d'acquisto: punteggio "lead caldo" dai segnali del sito.
      {
        const reachable = !!((deep?.emails?.length) || (deep?.phones?.length));
        result.intent_score = computeIntentScore(deep?.intent_signals || {}, reachable, !!website);
        // salva su lead_score del contatto (best-effort)
        if (contactId) {
          await supabaseAdmin.from("marketing_contacts")
            .update({ lead_score: result.intent_score, ai_intent_signals: deep?.intent_signals || {} })
            .eq("id", contactId).eq("company_id", PLATFORM_ADMIN_COMPANY_ID);
        }
      }

      // 2) VIES (gratis): valida P.IVA → ragione sociale + indirizzo ufficiali
      if (doVies && piva) {
        const vies = await viesValidate(piva);
        if (vies) result.vies = vies;
      }

      // 3) Firmografici + visura (openapi.it, solo se token configurato).
      // Usa fetchVisura (ricca) e, in caso di errore, SURFACE il motivo invece
      // di sparire in silenzio (es. "Wrong Token" → token openapi non valido).
      if (openapiToken && piva) {
        const v = await fetchVisura(piva, openapiToken, await openapiBase());
        if (v.ok) {
          result.visura = v.fields;
          // retrocompat: mantieni anche il sotto-set "firmografici"
          result.firmografici = {
            ateco: v.fields.ateco, ateco_desc: v.fields.ateco_desc,
            pec: v.fields.pec, dipendenti: v.fields.dipendenti,
            fatturato: v.fields.fatturato, forma_giuridica: v.fields.forma_giuridica,
          };
        } else {
          result.openapi_error = v.error;
        }
      } else if (!openapiToken) {
        result.openapi_error = "openapi.it non configurato (nessun token).";
      }

      // 4) Opzionale: riempi i campi vuoti del contatto CRM
      if (contactId) {
        const { data: c } = await supabaseAdmin
          .from("marketing_contacts").select("*")
          .eq("id", contactId).eq("company_id", PLATFORM_ADMIN_COMPANY_ID).maybeSingle();
        if (c) {
          const vis = (result.visura || {}) as Record<string, unknown>;
          const viesName = (result.vies as { name?: string } | undefined)?.name;
          const bestEmail = c.email || deep?.emails?.[0] || (vis.pec as string | undefined) || null;
          const bestPhone = c.phone || deep?.phones?.[0] || null;
          const patch: Record<string, unknown> = {};
          if (!c.email && bestEmail) patch.email = bestEmail;
          if (!c.phone && bestPhone) patch.phone = bestPhone;
          if (!c.website && website) patch.website = website;
          if (!c.vat_number && piva) patch.vat_number = piva;
          if (!c.company_name && (businessName || viesName || vis.ragione_sociale)) patch.company_name = businessName || viesName || vis.ragione_sociale;
          if (!c.city && vis.comune) patch.city = vis.comune;
          if (!c.province && vis.provincia) patch.province = vis.provincia;
          if (!c.address && vis.indirizzo) patch.address = vis.indirizzo;
          if (Object.keys(patch).length) {
            await supabaseAdmin.from("marketing_contacts").update(patch)
              .eq("id", contactId).eq("company_id", PLATFORM_ADMIN_COMPANY_ID);
            result.contact_updated = Object.keys(patch);
          }
        }
      }

      return jsonResponse(result, 200, corsH);
    }

    // ═══════ VISURA (openapi.it IT-advanced: anagrafica camerale ricca) ═══════
    // Input { partita_iva? , contactId? }. Opzionale/on-demand (consuma crediti
    // openapi). Se contactId, riempie i campi vuoti del contatto (PEC, indirizzo,
    // forma giuridica). Diagnostica esplicita se openapi fallisce.
    if (action === "enrich_visura") {
      let piva: string | null = typeof body.partita_iva === "string" ? body.partita_iva.replace(/\D/g, "") : null;
      const contactId: string | null = typeof body.contactId === "string" ? body.contactId : null;
      const openapiToken = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");
      if (!openapiToken) {
        return jsonResponse({ ok: false, error: "openapi.it non configurato: imposta openapi_it_token nelle impostazioni piattaforma." }, 200, corsH);
      }
      // Se manca la P.IVA ma ho il contatto, provo a leggerla dal contatto
      if (!piva && contactId) {
        const { data: c } = await supabaseAdmin.from("marketing_contacts").select("vat_number").eq("id", contactId).eq("company_id", PLATFORM_ADMIN_COMPANY_ID).maybeSingle();
        if (c?.vat_number) piva = String(c.vat_number).replace(/\D/g, "");
      }
      if (!piva || piva.length !== 11) {
        return jsonResponse({ ok: false, error: "Serve una P.IVA valida (11 cifre) per la visura." }, 200, corsH);
      }
      const v = await fetchVisura(piva, openapiToken, await openapiBase());
      if (!v.ok) {
        return jsonResponse({ ok: false, status: v.status, error: `openapi.it: ${v.error}` }, 200, corsH);
      }
      const f = v.fields as Record<string, unknown>;
      // Auto-fill campi vuoti del contatto (best-effort)
      let contact_updated: string[] = [];
      if (contactId) {
        const { data: c } = await supabaseAdmin.from("marketing_contacts").select("*").eq("id", contactId).eq("company_id", PLATFORM_ADMIN_COMPANY_ID).maybeSingle();
        if (c) {
          const patch: Record<string, unknown> = {};
          if (!c.email && f.pec) patch.email = f.pec;
          if (!c.company_name && f.ragione_sociale) patch.company_name = f.ragione_sociale;
          if (!c.vat_number) patch.vat_number = piva;
          if (!c.city && f.comune) patch.city = f.comune;
          if (!c.province && f.provincia) patch.province = f.provincia;
          if (!c.address && f.indirizzo) patch.address = f.indirizzo;
          if (Object.keys(patch).length) {
            await supabaseAdmin.from("marketing_contacts").update(patch).eq("id", contactId).eq("company_id", PLATFORM_ADMIN_COMPANY_ID);
            contact_updated = Object.keys(patch);
          }
        }
      }
      return jsonResponse({ ok: true, partita_iva: piva, fields: f, contact_updated }, 200, corsH);
    }

    // ══════════ DOCUMENTI UFFICIALI: DocuEngine + Visengine (Visure Camerali) ══════════
    // Prodotti openapi.it separati dal Company. Flusso: catalogo → richiesta → poll stato.
    // Tutti gated dietro openapi_it_token (deve avere gli scope DocuEngine + Visure Camerali).
    if (
      action === "docuengine_documents" || action === "docuengine_request" || action === "docuengine_status" ||
      action === "visengine_catalog" || action === "visengine_info" || action === "visengine_request" || action === "visengine_status"
    ) {
      const openapiToken = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");
      if (!openapiToken) {
        return jsonResponse({ ok: false, error: "openapi.it non configurato: imposta openapi_it_token (con scope DocuEngine e Visure Camerali)." }, 200, corsH);
      }
      const sandbox = await openapiIsSandbox();

      // ── DocuEngine ──
      if (action === "docuengine_documents") {
        const r = await docuengineDocuments(openapiToken, sandbox);
        if (!r.ok) return jsonResponse({ ok: false, status: r.status, error: `DocuEngine: ${r.error}` }, 200, corsH);
        return jsonResponse({ ok: true, documents: r.data?.data ?? r.data }, 200, corsH);
      }
      if (action === "docuengine_request") {
        const documentId = typeof body.documentId === "string" ? body.documentId : null;
        if (!documentId) return jsonResponse({ ok: false, error: "documentId richiesto (vedi docuengine_documents)." }, 200, corsH);
        const payload: Record<string, unknown> = { documentId };
        if (body.search && typeof body.search === "object") payload.search = body.search;
        if (Array.isArray(body.selectedOptions)) payload.selectedOptions = body.selectedOptions;
        if (typeof body.notifyEmail === "string") payload.notifyEmail = body.notifyEmail;
        const r = await docuengineRequest(openapiToken, sandbox, payload);
        if (!r.ok) return jsonResponse({ ok: false, status: r.status, error: `DocuEngine: ${r.error}` }, 200, corsH);
        const rec = r.data?.data ?? r.data;
        const reqId = rec?.id ?? rec?._id ?? null;
        const { data: row } = await supabaseAdmin.from("openapi_document_requests").insert({
          provider: "docuengine", document_id: documentId,
          document_name: typeof body.documentName === "string" ? body.documentName : null,
          subject: (payload.search as any)?.value ?? (payload.search as any)?.vatCode ?? (payload.search as any)?.taxCode ?? null,
          contact_id: typeof body.contact_id === "string" ? body.contact_id : null,
          opportunity_id: typeof body.opportunity_id === "string" ? body.opportunity_id : null,
          company_id: typeof body.company_id === "string" ? body.company_id : PLATFORM_ADMIN_COMPANY_ID,
          request_id: reqId ? String(reqId) : null, state: rec?.state ?? "pending", raw: rec, created_by: userId,
        }).select("id").single();
        return jsonResponse({ ok: true, id: row?.id ?? null, request: rec, request_id: reqId, state: rec?.state ?? null }, 200, corsH);
      }
      if (action === "docuengine_status") {
        const id = typeof body.request_id === "string" ? body.request_id : null;
        if (!id) return jsonResponse({ ok: false, error: "request_id richiesto." }, 200, corsH);
        const r = await docuengineStatus(openapiToken, sandbox, id);
        if (!r.ok) return jsonResponse({ ok: false, status: r.status, error: `DocuEngine: ${r.error}` }, 200, corsH);
        const rec = r.data?.data ?? r.data;
        const done = String(rec?.state ?? "").toUpperCase() === "DONE" || !!rec?.filename || !!rec?.documents;
        const { data: reqRow } = await supabaseAdmin.from("openapi_document_requests").select("*").eq("request_id", id).eq("provider", "docuengine").maybeSingle();
        let stored: { file_path: string; mime: string; size: number } | null = null;
        let marketing_document_id: string | null = reqRow?.marketing_document_id ?? null;
        if (done) {
          // I documenti DocuEngine risiedono su Google Cloud Storage: si legge il nome
          // file da rec.documents[], poi GET /requests/{id}/documents/{file} restituisce
          // { data:[{ downloadUrl, mimeType }] } (link GCS firmato). L'endpoint /download
          // NON serve il file (torna solo il JSON dell'ordine): era il bug.
          const docs: string[] = Array.isArray(rec?.documents)
            ? rec.documents.filter((x: unknown): x is string => typeof x === "string") : [];
          const fileName = docs[0];
          const dlUrl = fileName
            ? `https://${docuengineBase(sandbox)}/requests/${encodeURIComponent(id)}/documents/${encodeURIComponent(fileName)}`
            : `https://${docuengineBase(sandbox)}/requests/${encodeURIComponent(id)}/download`;
          const dl = await openapiDownloadAndStore(supabaseAdmin, "docuengine", id, dlUrl, openapiToken);
          if (dl.ok) {
            stored = dl;
            marketing_document_id = (await linkOpenapiDocToCrm(supabaseAdmin, reqRow, dl.file_path, dl.mime, dl.size, userId)) ?? marketing_document_id;
          }
          await supabaseAdmin.from("openapi_document_requests").update({
            state: "done", raw: rec, updated_at: new Date().toISOString(),
            ...(stored ? { file_path: stored.file_path, mime: stored.mime } : {}),
            ...(marketing_document_id ? { marketing_document_id } : {}),
          }).eq("request_id", id).eq("provider", "docuengine");
        } else {
          await supabaseAdmin.from("openapi_document_requests").update({ state: rec?.state ?? "pending", raw: rec, updated_at: new Date().toISOString() }).eq("request_id", id).eq("provider", "docuengine");
        }
        return jsonResponse({ ok: true, request: rec, state: rec?.state ?? null, done, stored, marketing_document_id }, 200, corsH);
      }

      // ── Visengine / Visure Camerali ──
      if (action === "visengine_catalog") {
        const r = await visengineCatalog(openapiToken, sandbox);
        if (!r.ok) return jsonResponse({ ok: false, status: r.status, error: `Visengine: ${r.error}` }, 200, corsH);
        return jsonResponse({ ok: true, visure: r.data?.data ?? r.data }, 200, corsH);
      }
      if (action === "visengine_info") {
        const hash = typeof body.hash === "string" ? body.hash : null;
        if (!hash) return jsonResponse({ ok: false, error: "hash richiesto (vedi visengine_catalog)." }, 200, corsH);
        const r = await visengineVisuraInfo(openapiToken, sandbox, hash);
        if (!r.ok) return jsonResponse({ ok: false, status: r.status, error: `Visengine: ${r.error}` }, 200, corsH);
        return jsonResponse({ ok: true, info: r.data?.data ?? r.data }, 200, corsH);
      }
      if (action === "visengine_request") {
        // payload flessibile: hash_visura + i campi di ricerca richiesti dalla visura scelta
        const payload: Record<string, unknown> = {};
        if (typeof body.hash === "string") payload.hash_visura = body.hash;
        if (body.ricerca && typeof body.ricerca === "object") payload.ricerca = body.ricerca;
        if (body.payload && typeof body.payload === "object") Object.assign(payload, body.payload);
        if (!payload.hash_visura && !body.payload) return jsonResponse({ ok: false, error: "hash (o payload) richiesto per la visura." }, 200, corsH);
        const r = await visengineRequest(openapiToken, sandbox, payload);
        if (!r.ok) return jsonResponse({ ok: false, status: r.status, error: `Visengine: ${r.error}` }, 200, corsH);
        const rec = r.data?.data ?? r.data;
        const reqId = rec?._id ?? rec?.id ?? null;
        const { data: row } = await supabaseAdmin.from("openapi_document_requests").insert({
          provider: "visengine", document_id: typeof body.hash === "string" ? body.hash : null,
          document_name: typeof body.documentName === "string" ? body.documentName : null,
          subject: (payload.ricerca as any)?.piva ?? (payload.ricerca as any)?.cf ?? (payload.ricerca as any)?.denominazione ?? null,
          contact_id: typeof body.contact_id === "string" ? body.contact_id : null,
          opportunity_id: typeof body.opportunity_id === "string" ? body.opportunity_id : null,
          company_id: typeof body.company_id === "string" ? body.company_id : PLATFORM_ADMIN_COMPANY_ID,
          request_id: reqId ? String(reqId) : null, state: rec?.stato ?? rec?.state ?? "pending", raw: rec, created_by: userId,
        }).select("id").single();
        return jsonResponse({ ok: true, id: row?.id ?? null, request: rec, request_id: reqId, state: rec?.stato ?? rec?.state ?? null }, 200, corsH);
      }
      if (action === "visengine_status") {
        const id = typeof body.request_id === "string" ? body.request_id : null;
        if (!id) return jsonResponse({ ok: false, error: "request_id richiesto." }, 200, corsH);
        const r = await visengineStatus(openapiToken, sandbox, id);
        if (!r.ok) return jsonResponse({ ok: false, status: r.status, error: `Visengine: ${r.error}` }, 200, corsH);
        const rec = r.data?.data ?? r.data;
        const stato = String(rec?.stato ?? rec?.state ?? "").toLowerCase();
        const done = stato.includes("evasa") || stato.includes("done") || stato.includes("completat") || !!rec?.documento;
        const { data: reqRow } = await supabaseAdmin.from("openapi_document_requests").select("*").eq("request_id", id).eq("provider", "visengine").maybeSingle();
        let stored: { file_path: string; mime: string; size: number } | null = null;
        let marketing_document_id: string | null = reqRow?.marketing_document_id ?? null;
        if (done) {
          const dl = await openapiDownloadAndStore(supabaseAdmin, "visengine", id, `https://${visengineBase(sandbox)}/documento/${encodeURIComponent(id)}`, openapiToken);
          if (dl.ok) {
            stored = dl;
            marketing_document_id = (await linkOpenapiDocToCrm(supabaseAdmin, reqRow, dl.file_path, dl.mime, dl.size, userId)) ?? marketing_document_id;
          }
          await supabaseAdmin.from("openapi_document_requests").update({
            state: "done", raw: rec, updated_at: new Date().toISOString(),
            ...(stored ? { file_path: stored.file_path, mime: stored.mime } : {}),
            ...(marketing_document_id ? { marketing_document_id } : {}),
          }).eq("request_id", id).eq("provider", "visengine");
        } else {
          await supabaseAdmin.from("openapi_document_requests").update({ state: rec?.stato ?? rec?.state ?? "pending", raw: rec, updated_at: new Date().toISOString() }).eq("request_id", id).eq("provider", "visengine");
        }
        return jsonResponse({ ok: true, request: rec, state: rec?.stato ?? rec?.state ?? null, done, stored, marketing_document_id }, 200, corsH);
      }
    }

    // ════════════════════ FIND EMAIL (pattern + MX, gratis) ════════════════════
    // ═══════ CONTATTO CRM: trova email (scraping sito + guess + MX) ═══════
    if (action === "find_contact_email") {
      const contactId: string | null = typeof body.contactId === "string" ? body.contactId : null;
      if (!contactId) return errorResponse("contactId richiesto.", 400, corsH);
      const { data: c } = await supabaseAdmin.from("marketing_contacts")
        .select("id, email, website, company_name, first_name, last_name")
        .eq("id", contactId).eq("company_id", PLATFORM_ADMIN_COMPANY_ID).maybeSingle();
      if (!c) return errorResponse("Contatto non trovato.", 404, corsH);
      if (c.email) return jsonResponse({ ok: true, already: true, email: c.email }, 200, corsH);

      let domain: string | null = null;
      const siteEmails: string[] = [];
      if (c.website) {
        try { domain = new URL(c.website.startsWith("http") ? c.website : `https://${c.website}`).hostname.replace(/^www\./, ""); } catch { /* skip */ }
        const deep = c.website ? await scrapeWebsiteDeep(c.website) : null;
        if (deep?.emails?.length) siteEmails.push(...deep.emails);
      }
      let chosen: string | null = siteEmails[0] || null;
      let status = chosen ? "found" : "none";
      let candidates: string[] = siteEmails;
      if (!chosen && domain) {
        const hasMx = await domainHasMx(domain);
        if (hasMx) {
          candidates = guessEmails([c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "", domain);
          chosen = candidates[0] || null;
          status = chosen ? "guessed" : "none";
        }
      }
      if (chosen) {
        await supabaseAdmin.from("marketing_contacts").update({ email: chosen }).eq("id", contactId).eq("company_id", PLATFORM_ADMIN_COMPANY_ID);
      }
      return jsonResponse({ ok: true, email: chosen, status, candidates, domain }, 200, corsH);
    }

    // ═══════ CONTATTO CRM: verifica email (sintassi + MX, provider opz) ═══════
    if (action === "verify_contact_email") {
      const email: string | null = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ ok: true, status: "invalid_syntax", email }, 200, corsH);
      }
      const domain = email.split("@")[1];
      const hasMx = await domainHasMx(domain);
      let status = hasMx ? "mx_ok" : "no_mx";
      // Se configurato un provider di verifica (NeverBounce/ZeroBounce), affina.
      const vkey = await getPlatformSetting("email_verify_api_key", "EMAIL_VERIFY_API_KEY");
      if (hasMx && vkey) {
        const provider = (await getPlatformSetting("email_verify_provider", "EMAIL_VERIFY_PROVIDER")) || "neverbounce";
        const r = await verifyEmailProvider(email, provider, vkey);
        if (r === "valid") status = "valid";
        else if (r === "invalid") status = "invalid";
      }
      return jsonResponse({ ok: true, status, email, domain, provider_used: !!vkey }, 200, corsH);
    }

    // ═══════ CONTATTI CRM: arricchimento MASSIVO (sito+VIES+autofill) ═══════
    if (action === "enrich_contacts_batch") {
      const ids: string[] = Array.isArray(body.contactIds) ? body.contactIds.filter((x: unknown) => typeof x === "string") : [];
      if (ids.length === 0) return errorResponse("contactIds vuoto.", 400, corsH);
      if (ids.length > 100) return errorResponse("Massimo 100 contatti per lotto.", 400, corsH);
      const { data: contacts, error } = await supabaseAdmin.from("marketing_contacts")
        .select("id, email, phone, website, company_name, first_name, last_name, vat_number, city, province")
        .in("id", ids).eq("company_id", PLATFORM_ADMIN_COMPANY_ID);
      if (error) return errorResponse(error.message, 500, corsH);

      let enriched = 0, filled = 0, failed = 0;
      await poolMap(contacts || [], 4, async (c: any) => {
        try {
          const website = c.website || null;
          let piva = c.vat_number ? String(c.vat_number).replace(/\D/g, "") : null;
          const deep = website ? await scrapeWebsiteDeep(website) : null;
          if (deep?.partita_iva && !piva) piva = deep.partita_iva;
          let viesName: string | undefined;
          if (piva) { const v = await viesValidate(piva); if (v?.valid) viesName = v.name; }
          const patch: Record<string, unknown> = {};
          if (!c.email && (deep?.emails?.[0])) patch.email = deep.emails[0];
          if (!c.phone && (deep?.phones?.[0])) patch.phone = deep.phones[0];
          if (!c.vat_number && piva) patch.vat_number = piva;
          if (!c.company_name && viesName) patch.company_name = viesName;
          // segnale d'acquisto → lead_score
          if (deep) {
            const reachable = !!(patch.email || c.email || patch.phone || c.phone);
            patch.lead_score = computeIntentScore(deep.intent_signals || {}, reachable, !!website);
            patch.ai_intent_signals = deep.intent_signals || {};
          }
          if (Object.keys(patch).length) {
            await supabaseAdmin.from("marketing_contacts").update(patch).eq("id", c.id).eq("company_id", PLATFORM_ADMIN_COMPANY_ID);
            filled += (patch.email || patch.phone || patch.vat_number || patch.company_name) ? 1 : 0;
          }
          enriched++;
        } catch { failed++; }
      });
      return jsonResponse({ ok: true, enriched, filled, failed, attempted: (contacts || []).length }, 200, corsH);
    }

    if (action === "find_email") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, website, email, contact_name, business_name, email_status, enrichment")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let updated = 0;
      await poolMap(leads || [], 5, async (l: any) => {
        if (l.email && l.email_status === "found") return; // già verificata dal sito
        if (!l.website) return;
        let domain: string;
        try {
          domain = new URL(l.website.startsWith("http") ? l.website : `https://${l.website}`).hostname.replace(/^www\./, "");
        } catch { return; }

        const hasMx = await domainHasMx(domain);
        if (!hasMx) return; // dominio non riceve email → niente guess
        const candidates = guessEmails(l.contact_name || "", domain);
        const guess = candidates[0];
        if (!guess) return;

        await supabaseAdmin.from("lead_scraper_results").update({
          email: l.email || guess,
          // È un GUESS su dominio con MX valido, NON un'email verificata: etichetta
          // onesta "guessed" (prima "verified_mx" faceva inviare a indirizzi forse inesistenti).
          email_status: l.email ? l.email_status : "guessed",
          // merge: non cancellare site_excerpt/vies/firmografici già raccolti
          enrichment: { ...(l.enrichment || {}), email_candidates: candidates, mx: true },
        }).eq("id", l.id);
        updated++;
      });
      return jsonResponse({ found: updated, attempted: (leads || []).length }, 200, corsH);
    }

    // ════════════════════ FIND LINKEDIN (Google CSE) ════════════════════
    if (action === "find_linkedin") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      // Serper preferito (più economico); fallback CSE
      const serperKey = await getPlatformSetting("serper_api_key", "SERPER_API_KEY");
      const cseKey = await getPlatformSetting("google_cse_api_key", "GOOGLE_CSE_API_KEY");
      const cseCx = await getPlatformSetting("google_cse_cx", "GOOGLE_CSE_CX");
      if (!serperKey && !(cseKey && cseCx)) {
        return errorResponse("Configura serper_api_key (≈$0.30/1000) o google_cse_api_key + google_cse_cx (gratis 100/g) per cercare LinkedIn.", 400, corsH);
      }

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, city, contact_name, linkedin_url, role")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let found = 0;
      // sequenziale: rispetta la quota
      for (const l of (leads || []).filter((x: any) => !x.linkedin_url)) {
        const q = `site:linkedin.com/in/ "${l.business_name}" ${l.city || ""} (titolare OR amministratore OR CEO OR fondatore OR owner)`.trim();
        try {
          const items = serperKey ? await serperSearch(q, serperKey, 5) : await googleCseSearch(q, cseKey, cseCx);
          const hit = items.find((it) => /linkedin\.com\/in\//i.test(it.link));
          if (hit) {
            const { name, role } = parseLinkedinTitle(hit.title);
            await supabaseAdmin.from("lead_scraper_results").update({
              linkedin_url: hit.link,
              contact_name: l.contact_name || name,
              role: l.role || role,
            }).eq("id", l.id);
            found++;
          }
        } catch (e) {
          // quota esaurita o errore → interrompi per non sprecare
          if (/quota|rate|limit/i.test((e as Error).message)) break;
        }
      }
      return jsonResponse({ found, attempted: (leads || []).length }, 200, corsH);
    }

    // ════════════════════ VALIDATE VAT (VIES, gratis) ════════════════════
    if (action === "validate_vat") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, partita_iva, enrichment")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let validated = 0;
      await poolMap((leads || []).filter((l: any) => l.partita_iva), 4, async (l: any) => {
        const vies = await viesValidate(l.partita_iva);
        if (vies) {
          // La ragione sociale VIES resta in enrichment.vies: NON in contact_name
          // (è un'azienda, non un referente — push_crm la spezzerebbe in nome/cognome).
          // Merge con l'enrichment esistente, non sovrascrivere l'oggetto intero.
          await supabaseAdmin.from("lead_scraper_results").update({
            enrichment: { ...(l.enrichment || {}), vies },
          }).eq("id", l.id);
          if (vies.valid) validated++;
        }
      });
      return jsonResponse({ validated, attempted: (leads || []).filter((l: any) => l.partita_iva).length }, 200, corsH);
    }

    // ════════════════════ GENERATE OUTREACH (AI sintesi + icebreaker) ════════════════════
    if (action === "generate_outreach") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, city, website, ateco_desc, intent_signals, enrichment")
        .in("id", ids).limit(40);
      if (error) return errorResponse(error.message, 500, corsH);
      if (!leads?.length) return jsonResponse({ generated: 0 }, 200, corsH);

      const product = String(body.product || "").trim() ||
        "Edilizia in Cloud, il gestionale cloud per imprese edili (cantieri, preventivi, DDT, fatture).";

      const compact = leads.map((l: any, i: number) => ({
        i, nome: l.business_name, citta: l.city || "—",
        settore: l.ateco_desc || "—",
        sito: (l.enrichment?.site_excerpt as string | undefined)?.slice(0, 700) || (l.website ? "(sito presente)" : "—"),
        segnali: Object.keys(l.intent_signals || {}).filter((k) => l.intent_signals?.[k]).join(", ") || "—",
      }));
      const sys = "Sei un SDR esperto di vendita B2B in Italia. Per ogni azienda scrivi: (1) una sintesi di 1 frase " +
        "(cosa fa, dimensione plausibile), (2) un 'icebreaker' di 1-2 frasi per una prima email a freddo, personalizzato " +
        "sui dati reali dell'azienda, che colleghi un loro bisogno al prodotto. Tono professionale, niente fronzoli, niente promesse. Solo JSON.";
      const user = `Prodotto: ${product}\n\nAziende:\n${JSON.stringify(compact)}\n\n` +
        `Rispondi: {"results":[{"i":0,"summary":"...","icebreaker":"..."}]}`;

      let out;
      try {
        out = await aiRouterComplete({
          supabase: supabaseAdmin, taskKey: "lead_outreach",
          messages: [{ role: "system", content: sys }, { role: "user", content: user }],
          params: { temperature: 0.6, max_tokens: 1800 }, responseFormat: { type: "json_object" },
        });
      } catch (e) {
        return errorResponse(`Generazione AI fallita: ${(e as Error).message}`, 502, corsH);
      }
      let parsed: { results?: Array<{ i: number; summary: string; icebreaker: string }> } | null = null;
      try { parsed = extractJsonFromLLM(out.content); } catch { parsed = null; }

      let generated = 0;
      for (const row of parsed?.results || []) {
        const lead = leads[row.i];
        if (!lead) continue;
        await supabaseAdmin.from("lead_scraper_results").update({
          ai_summary: String(row.summary || "").slice(0, 400),
          ai_icebreaker: String(row.icebreaker || "").slice(0, 600),
        }).eq("id", lead.id);
        generated++;
      }
      return jsonResponse({ generated }, 200, corsH);
    }

    // ════════════════════ SEND OUTREACH (invio email reale + tracking) ════════════════════
    // Invia un'email a freddo ai lead selezionati via Resend (gated resend_api_key),
    // con pixel di tracciamento aperture e link cliccabili tracciati. Crea una riga
    // in lead_scraper_outreach per ciascun invio (aperture/click aggiornati dal
    // tracker pubblico lead-scraper-track).
    if (action === "send_outreach") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      // channel: "mailbox" = ruota sulle caselle Google/Outlook collegate (cold outreach,
      // protegge la reputazione del dominio transazionale); "esp" = Resend (per opt-in).
      const channel = body.channel === "mailbox" ? "mailbox" : "esp";
      // Il sito è sul .com: il .it è un dominio parcheggiato con un certificato
      // non suo, e chi cliccava da un'email vedeva l'avviso «connessione non sicura».
      const ctaUrl = (await getPlatformSetting("outreach_cta_url", "OUTREACH_CTA_URL")) || "https://www.ediliziaincloud.com";
      const trackBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/lead-scraper-track`;
      const step = Math.max(1, Math.min(10, Number(body.step) || 1));
      const subjTpl = String(body.subject || "").trim();
      const bodyTpl = String(body.body || "").trim();

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, contact_name, email, city, ateco_desc, ai_icebreaker, ai_summary")
        .in("id", ids).limit(500);
      if (error) return errorResponse(error.message, 500, corsH);
      const withEmail = (leads || []).filter((l: any) => l.email && /@/.test(l.email));
      if (!withEmail.length) return jsonResponse({ channel, sent: 0, queued: 0, suppressed: 0, failed: 0 }, 200, corsH);

      // rispetta la do-not-contact (GDPR)
      const supp = await getSuppressedEmailMap(
        supabaseAdmin, withEmail.map((l: any) => l.email), PLATFORM_ADMIN_COMPANY_ID, "marketing",
      );
      const escHtml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const render = (tpl: string, l: any) => tpl
        .replace(/\{\{\s*nome\s*\}\}/gi, l.contact_name || "")
        .replace(/\{\{\s*azienda\s*\}\}/gi, l.business_name || "")
        .replace(/\{\{\s*citta\s*\}\}/gi, l.city || "")
        .replace(/\{\{\s*settore\s*\}\}/gi, l.ateco_desc || "");
      const subjectFor = (l: any) => (subjTpl ? render(subjTpl, l) : `${l.business_name} — un'idea per la vostra impresa`).slice(0, 200);
      const textFor = (l: any) => bodyTpl
        ? render(bodyTpl, l)
        : (l.ai_icebreaker
            ? `${l.contact_name ? `Gentile ${l.contact_name},` : "Buongiorno,"}\n\n${l.ai_icebreaker}\n\nSe può essere utile le mostro Edilizia in Cloud, il gestionale per imprese edili (cantieri, preventivi, DDT, fatture).`
            : `${l.contact_name ? `Gentile ${l.contact_name},` : "Buongiorno,"}\n\nmi occupo di Edilizia in Cloud, il gestionale cloud per imprese edili (cantieri, preventivi, DDT, fatture). Vi va una breve call per capire se può esservi utile?`);
      const htmlFor = (oid: string, baseText: string) =>
        `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">` +
        escHtml(baseText).replace(/\n/g, "<br>") +
        `<br><br><a href="${trackBase}?e=${oid}&t=click&u=${encodeURIComponent(ctaUrl)}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Scopri Edilizia in Cloud</a>` +
        `<br><br><span style="font-size:12px;color:#888">Se non desidera ricevere altre email, risponda con "STOP".</span>` +
        `<img src="${trackBase}?e=${oid}&t=open" width="1" height="1" alt="" style="display:none"></div>`;

      // bersagli validi (con email, non in opt-out)
      const targets = withEmail
        .map((l: any) => ({ l, to: normalizeEmailAddress(l.email) }))
        .filter((t: any) => t.to && !supp.get(t.to));
      const suppressed = withEmail.length - targets.length;

      // ── CANALE MAILBOX: rotazione sulle caselle collegate della piattaforma ──
      if (channel === "mailbox") {
        const { data: pool } = await supabaseAdmin
          .from("email_oauth_connections")
          .select("id, user_id, email_address, provider")
          .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
          .eq("status", "active").eq("is_pec", false)
          .in("provider", ["gmail", "outlook"]).order("id");
        if (!pool || !pool.length) {
          return errorResponse("Nessuna casella dedicata della piattaforma collegata (Gmail/Outlook). Collega le caselle per l'outreach a rotazione.", 400, corsH);
        }
        const cap = Math.max(1, Math.min(500, Number(await getPlatformSetting("outreach_mailbox_daily_cap", "OUTREACH_MAILBOX_DAILY_CAP")) || 40));
        const startDay = new Date(); startDay.setUTCHours(0, 0, 0, 0);
        const remaining = new Map<string, number>();
        for (const c of pool) {
          const { count } = await supabaseAdmin.from("lead_scraper_outreach")
            .select("id", { count: "exact", head: true })
            .eq("oauth_connection_id", c.id).gte("created_at", startDay.toISOString());
          remaining.set(c.id, Math.max(0, cap - (count || 0)));
        }
        let queued = 0, failed = 0, skippedCap = 0, ri = 0;
        const perMailbox: Record<string, number> = {};
        for (const { l, to } of targets) {
          // prossima casella con capienza (round-robin)
          let chosen: any = null;
          for (let k = 0; k < pool.length; k++) {
            const c = pool[(ri + k) % pool.length];
            if ((remaining.get(c.id) || 0) > 0) { chosen = c; ri = ri + k + 1; break; }
          }
          if (!chosen) { skippedCap++; continue; }
          remaining.set(chosen.id, (remaining.get(chosen.id) || 0) - 1);
          const subject = subjectFor(l);
          const baseText = textFor(l);
          const { data: oRow } = await supabaseAdmin.from("lead_scraper_outreach").insert({
            lead_id: l.id, channel: "email", step, subject, to_addr: to, status: "sent",
            created_by: userId, oauth_connection_id: chosen.id,
          }).select("id").single();
          if (!oRow) { failed++; continue; }
          const { error: obErr } = await supabaseAdmin.from("email_outbox").insert({
            company_id: PLATFORM_ADMIN_COMPANY_ID, user_id: chosen.user_id || userId,
            oauth_connection_id: chosen.id, to_emails: [to], subject,
            body_html: htmlFor(oRow.id, baseText), body_text: baseText, status: "queued",
          });
          if (obErr) {
            await supabaseAdmin.from("lead_scraper_outreach").update({ status: "failed", meta: { error: obErr.message } }).eq("id", oRow.id);
            failed++; continue;
          }
          perMailbox[chosen.email_address] = (perMailbox[chosen.email_address] || 0) + 1;
          queued++;
        }
        return jsonResponse({
          channel: "mailbox", queued, failed, suppressed, skipped_capacity: skippedCap,
          mailboxes: pool.length, cap_per_mailbox: cap, perMailbox, attempted: targets.length,
        }, 200, corsH);
      }

      // ── CANALE ESP (Resend): per liste opt-in / dominio dedicato ──
      const resendKey = await getPlatformSetting("resend_api_key", "RESEND_API_KEY");
      if (!resendKey) return errorResponse("Configura resend_api_key, oppure usa channel=mailbox per inviare dalle caselle Google/Outlook collegate.", 400, corsH);
      const fromAddr = (await getPlatformSetting("outreach_from", "OUTREACH_FROM")) ||
        "Edilizia in Cloud <noreply@ediliziaincloud.it>";
      let sent = 0, failed = 0;
      await poolMap(targets, 4, async ({ l, to }: any) => {
        const subject = subjectFor(l);
        const { data: oRow, error: oErr } = await supabaseAdmin.from("lead_scraper_outreach").insert({
          lead_id: l.id, channel: "email", step, subject, to_addr: to, status: "sent", created_by: userId,
        }).select("id").single();
        if (oErr || !oRow) { failed++; return; }
        const html = htmlFor(oRow.id, textFor(l));
        try {
          const res = await fetchWithTimeout("https://api.resend.com/emails", {
            method: "POST", timeoutMs: 12000,
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: fromAddr, to: [to], subject, html }),
          });
          if (res.ok) {
            const j = await res.json().catch(() => ({}));
            await supabaseAdmin.from("lead_scraper_outreach").update({ message_id: j?.id || null }).eq("id", oRow.id);
            sent++;
          } else {
            const txt = await res.text().catch(() => "");
            await supabaseAdmin.from("lead_scraper_outreach").update({ status: "failed", meta: { error: txt.slice(0, 300) } }).eq("id", oRow.id);
            failed++;
          }
        } catch (e) {
          await supabaseAdmin.from("lead_scraper_outreach").update({ status: "failed", meta: { error: (e as Error).message } }).eq("id", oRow.id);
          failed++;
        }
      });
      return jsonResponse({ channel: "esp", sent, failed, suppressed, attempted: targets.length }, 200, corsH);
    }

    // ════════════════════ SUPPRESS (GDPR do-not-contact) ════════════════════
    if (action === "suppress") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      const emailsIn: string[] = Array.isArray(body.emails) ? body.emails : [];
      const reason = String(body.reason || "manual");

      let emails: string[] = [...emailsIn];
      if (ids.length) {
        const { data } = await supabaseAdmin.from("lead_scraper_results").select("email").in("id", ids);
        emails.push(...(data || []).map((r: any) => r.email).filter(Boolean));
      }
      emails = [...new Set(emails.map((e) => normalizeEmailAddress(e)).filter(Boolean))];
      if (emails.length === 0) return errorResponse("Nessuna email da sopprimere.", 400, corsH);

      const rows = emails.map((email) => ({
        email, email_normalized: email, reason,
        company_id: PLATFORM_ADMIN_COMPANY_ID, source: "lead_scraper", suppressed_by: userId,
      }));
      const { error } = await supabaseAdmin
        .from("email_suppressions")
        .upsert(rows, { onConflict: "company_id,email_normalized,reason", ignoreDuplicates: true });
      if (error) return errorResponse(`Errore suppression: ${error.message}`, 500, corsH);
      return jsonResponse({ suppressed: emails.length }, 200, corsH);
    }

    // ════════════════════ ENRICH LINKEDIN PROFILE (Proxycurl, premium) ════════════════════
    if (action === "enrich_linkedin_profile") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      const pcKey = await getPlatformSetting("proxycurl_api_key", "PROXYCURL_API_KEY");
      if (!pcKey) return errorResponse("Configura proxycurl_api_key per arricchire i profili LinkedIn (servizio a pagamento).", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, linkedin_url, contact_name, role, email")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let enriched = 0;
      for (const l of (leads || []).filter((x: any) => x.linkedin_url)) {
        const prof = await proxycurlProfile(l.linkedin_url, pcKey);
        if (prof) {
          await supabaseAdmin.from("lead_scraper_results").update({
            contact_name: prof.name || l.contact_name,
            role: prof.role || l.role,
            email: l.email || prof.email || null,
            email_status: l.email ? undefined : (prof.email ? "found" : undefined),
          }).eq("id", l.id);
          enriched++;
        }
      }
      return jsonResponse({ enriched, attempted: (leads || []).filter((x: any) => x.linkedin_url).length }, 200, corsH);
    }

    // ════════════════════ ENROLL SEQUENCE (loop email outreach) ════════════════════
    if (action === "enroll_sequence") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      const sequenzaId = String(body.sequenzaId || "");
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      if (!sequenzaId) return errorResponse("sequenzaId obbligatorio.", 400, corsH);

      // carica la sequenza (deve appartenere alla platform admin company)
      const { data: seq, error: seqErr } = await supabaseAdmin
        .from("sequenze").select("id, nome, step, company_id")
        .eq("id", sequenzaId).maybeSingle();
      if (seqErr || !seq) return errorResponse("Sequenza non trovata.", 404, corsH);
      if (seq.company_id !== PLATFORM_ADMIN_COMPANY_ID) return errorResponse("Sequenza non valida per quest'area.", 403, corsH);
      const firstOffset = Number((Array.isArray(seq.step) ? seq.step[0]?.offset_giorni : 0)) || 0;

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, contact_name, email, city, ateco_desc")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      const withEmail = (leads || []).filter((l: any) => l.email);
      // GDPR: niente arruolamento per email soppresse
      const suppressed = withEmail.length
        ? await getSuppressedEmailMap(supabaseAdmin, withEmail.map((l: any) => l.email), PLATFORM_ADMIN_COMPANY_ID, "marketing")
        : new Map();

      const now = Date.now();
      const prossimo = new Date(now + firstOffset * 86400000).toISOString();
      let enrolled = 0, skipped = 0;
      for (const l of withEmail) {
        if (suppressed.has(normalizeEmailAddress(l.email))) { skipped++; continue; }
        const { error: insErr } = await supabaseAdmin.from("sequenze_esecuzioni").insert({
          sequenza_id: sequenzaId,
          company_id: PLATFORM_ADMIN_COMPANY_ID,
          destinatario: l.email,
          destinatario_nome: l.contact_name || l.business_name || null,
          entita_tipo: "lead_scraper",
          entita_id: l.id,
          variabili: { nome: l.contact_name || l.business_name, azienda: l.business_name, citta: l.city, settore: l.ateco_desc },
          ancora_at: new Date(now).toISOString(),
          step_corrente: 0,
          stato: "attiva",
          prossimo_invio_at: prossimo,
          created_by: userId,
        });
        if (!insErr) enrolled++;
      }
      return jsonResponse({ enrolled, skipped, sequence: seq.nome }, 200, corsH);
    }

    // ════════════════════ ENRICH APOLLO (email/telefono decisore) ════════════════════
    if (action === "enrich_apollo") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      const apolloKey = await getPlatformSetting("apollo_api_key", "APOLLO_API_KEY");
      if (!apolloKey) return errorResponse("Configura apollo_api_key per l'arricchimento Apollo.", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, contact_name, website, email, phone, linkedin_url")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let enriched = 0;
      for (const l of (leads || [])) {
        if (l.email) continue;
        const parts = (l.contact_name || "").trim().split(/\s+/);
        let domain: string | undefined;
        try { if (l.website) domain = new URL(l.website.startsWith("http") ? l.website : `https://${l.website}`).hostname.replace(/^www\./, ""); } catch { /* */ }
        const res = await apolloEnrich({ first_name: parts[0], last_name: parts.slice(1).join(" ") || undefined, organization_name: l.business_name, domain }, apolloKey);
        if (res && (res.email || res.phone)) {
          await supabaseAdmin.from("lead_scraper_results").update({
            email: l.email || res.email || null,
            email_status: l.email ? undefined : (res.email ? "found" : undefined),
            phone: l.phone || res.phone || null,
            linkedin_url: l.linkedin_url || res.linkedin || null,
          }).eq("id", l.id);
          enriched++;
        }
      }
      return jsonResponse({ enriched, attempted: (leads || []).length }, 200, corsH);
    }

    // ════════════════════ ENRICH PDL (People Data Labs) ════════════════════
    if (action === "enrich_pdl") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      const pdlKey = await getPlatformSetting("pdl_api_key", "PDL_API_KEY");
      if (!pdlKey) return errorResponse("Configura pdl_api_key (People Data Labs — free 100/mese).", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, contact_name, email, phone")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let enriched = 0;
      await poolMap((leads || []).filter((l: any) => l.contact_name && !l.email), 4, async (l: any) => {
        const parts = String(l.contact_name).trim().split(/\s+/);
        const res = await pdlEnrich({ first_name: parts[0], last_name: parts.slice(1).join(" ") || undefined, company: l.business_name }, pdlKey);
        if (res && (res.email || res.phone)) {
          await supabaseAdmin.from("lead_scraper_results").update({
            email: l.email || res.email || null,
            email_status: l.email ? undefined : (res.email ? "found" : undefined),
            phone: l.phone || res.phone || null,
          }).eq("id", l.id);
          enriched++;
        }
      });
      return jsonResponse({ enriched, attempted: (leads || []).length }, 200, corsH);
    }

    // ════════════════════ VERIFY EMAIL (NeverBounce/ZeroBounce) ════════════════════
    if (action === "verify_email") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      const provider = (await getPlatformSetting("email_verify_provider", "EMAIL_VERIFY_PROVIDER")) || "neverbounce";
      const vkey = await getPlatformSetting("email_verify_api_key", "EMAIL_VERIFY_API_KEY");
      if (!vkey) return errorResponse("Configura email_verify_api_key (+ opz. email_verify_provider: neverbounce|zerobounce).", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results").select("id, email, email_status").in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let valid = 0, invalid = 0;
      await poolMap((leads || []).filter((l: any) => l.email), 5, async (l: any) => {
        const r = await verifyEmailProvider(l.email, provider, vkey);
        if (r === "valid") {
          await supabaseAdmin.from("lead_scraper_results").update({ email_status: "verified" }).eq("id", l.id);
          valid++;
        } else if (r === "invalid") {
          await supabaseAdmin.from("lead_scraper_results").update({ email: null, email_status: "invalid" }).eq("id", l.id);
          invalid++;
        }
      });
      return jsonResponse({ valid, invalid, attempted: (leads || []).filter((l: any) => l.email).length }, 200, corsH);
    }

    // ════════════════════ FLAG GIÀ-CLIENTI (no doppioni) ════════════════════
    if (action === "flag_existing_customers") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      const searchId = String(body.searchId || "");
      let q = supabaseAdmin.from("lead_scraper_results").select("id, business_name, partita_iva");
      if (ids.length) q = q.in("id", ids);
      else if (searchId) q = q.eq("search_id", searchId);
      else return errorResponse("Specifica searchId o resultIds.", 400, corsH);
      const { data: leads, error } = await q;
      if (error) return errorResponse(error.message, 500, corsH);

      const pivas = (leads || []).map((l: any) => l.partita_iva).filter(Boolean);
      const names = (leads || []).map((l: any) => l.business_name).filter(Boolean);
      const existPivas = new Set<string>();
      const existNames = new Set<string>();
      if (pivas.length) {
        const { data } = await supabaseAdmin.from("companies").select("vat_number").in("vat_number", pivas);
        for (const c of data || []) if (c.vat_number) existPivas.add(String(c.vat_number));
      }
      if (names.length) {
        const { data } = await supabaseAdmin.from("companies").select("name").in("name", names);
        for (const c of data || []) if (c.name) existNames.add(String(c.name).toLowerCase());
      }
      let flagged = 0;
      for (const l of leads || []) {
        const isCust = (l.partita_iva && existPivas.has(String(l.partita_iva))) ||
                       (l.business_name && existNames.has(String(l.business_name).toLowerCase()));
        if (isCust) { await supabaseAdmin.from("lead_scraper_results").update({ is_existing_customer: true }).eq("id", l.id); flagged++; }
      }
      return jsonResponse({ flagged, attempted: (leads || []).length }, 200, corsH);
    }

    // ════════════════════ BUYING SIGNALS (intent reale) ════════════════════
    if (action === "compute_buying_signals") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      const searchId = String(body.searchId || "");
      let q = supabaseAdmin.from("lead_scraper_results")
        .select("id, website, email, phone, reviews_count, intent_signals");
      if (ids.length) q = q.in("id", ids);
      else if (searchId) q = q.eq("search_id", searchId);
      else return errorResponse("Specifica searchId o resultIds.", 400, corsH);
      const { data: leads, error } = await q.limit(80);
      if (error) return errorResponse(error.message, 500, corsH);

      let scored = 0;
      await poolMap(leads || [], 4, async (l: any) => {
        const hiring = await detectHiring(l.website);
        const signals = (l.intent_signals || {}) as Record<string, boolean>;
        const reachable = !!(l.email || l.phone);
        const active_reviews = (l.reviews_count || 0) >= 20;
        let s = 35;
        if (hiring) s += 30;                         // sta assumendo → cresce
        if (signals.outdated_copyright) s += 10;     // sito vecchio → modernizza
        if (active_reviews) s += 10;                 // attiva
        if (reachable) s += 10; else s -= 10;
        const buying_score = Math.max(0, Math.min(100, s));
        await supabaseAdmin.from("lead_scraper_results").update({
          buying_score,
          buying_signals: { hiring, active_reviews, reachable },
        }).eq("id", l.id);
        scored++;
      });
      return jsonResponse({ scored, attempted: (leads || []).length }, 200, corsH);
    }

    // ════════════════════ GENERATE SEQUENCE (sequenza email AI multi-step) ════════════════════
    if (action === "generate_sequence") {
      const product = String(body.product || "").trim() ||
        "Edilizia in Cloud, il gestionale cloud per imprese edili (cantieri, preventivi, DDT, fatture).";
      const settore = String(body.settore || body.keyword || "impresa edile").trim();
      const sys = "Sei un copywriter di cold email B2B in Italia. Crea una sequenza di 3 email di follow-up " +
        "(giorno 0, giorno 3, giorno 7) per vendere il prodotto al settore indicato. Usa i placeholder " +
        "{{nome}} e {{azienda}}. Toni diversi: 1) valore+dolore, 2) prova/sociale, 3) breakup. Solo JSON.";
      const user = `Prodotto: ${product}\nSettore destinatario: ${settore}\n\n` +
        `Rispondi: {"steps":[{"offset_giorni":0,"oggetto":"...","corpo_template":"..."},{"offset_giorni":3,...},{"offset_giorni":7,...}]}`;
      let out;
      try {
        out = await aiRouterComplete({
          supabase: supabaseAdmin, taskKey: "lead_sequence",
          messages: [{ role: "system", content: sys }, { role: "user", content: user }],
          params: { temperature: 0.7, max_tokens: 2000 }, responseFormat: { type: "json_object" },
        });
      } catch (e) {
        return errorResponse(`Generazione sequenza fallita: ${(e as Error).message}`, 502, corsH);
      }
      let parsed: { steps?: Array<{ offset_giorni: number; oggetto: string; corpo_template: string }> } | null = null;
      try { parsed = extractJsonFromLLM(out.content); } catch { parsed = null; }
      const steps = (parsed?.steps || []).slice(0, 5).map((s, i) => ({
        offset_giorni: Number(s.offset_giorni ?? i * 3) || 0,
        oggetto: String(s.oggetto || "").slice(0, 200),
        corpo_template: String(s.corpo_template || "").slice(0, 4000),
        condizione_stop: "risposta",
      }));
      if (steps.length === 0) return errorResponse("L'AI non ha prodotto step validi.", 502, corsH);

      const { data: seqRow, error: seqErr } = await supabaseAdmin.from("sequenze").insert({
        company_id: PLATFORM_ADMIN_COMPANY_ID,
        nome: `AI · ${settore} · ${steps.length} step`,
        tipo: "altro",
        attiva: false,        // bozza: l'utente la approva/attiva prima di usarla
        modalita_invio: "conferma",
        step: steps,
        created_by: userId,
      }).select("id, nome").single();
      if (seqErr) return errorResponse(`Errore creazione sequenza: ${seqErr.message}`, 500, corsH);
      return jsonResponse({ sequenzaId: seqRow.id, nome: seqRow.nome, steps }, 200, corsH);
    }

    // ════════════════════ ENQUEUE SCRAPE (massivo asincrono) ════════════════════
    if (action === "enqueue_scrape") {
      const keyword = String(body.keyword || "").trim();
      const city = String(body.city || "").trim();
      const region = String(body.region || "").trim();
      const engine = body.engine === "gmaps" ? "gmaps" : "paginegialle";
      const target = Math.max(1, Math.min(20000, Number(body.target) || 1000));
      if (!keyword) return errorResponse("Parametro 'keyword' obbligatorio.", 400, corsH);
      // verifica che il worker sia configurato (altrimenti il job resterebbe in coda all'infinito)
      const internalUrl = await getPlatformSetting("internal_scraper_url", "INTERNAL_SCRAPER_URL");
      if (!internalUrl) return errorResponse("Scraper-worker non configurato (internal_scraper_url): il job massivo lo processa il worker self-host.", 400, corsH);

      const { data: job, error } = await supabaseAdmin.from("lead_scraper_jobs").insert({
        type: "scrape", status: "queued",
        params: { engine, keyword, city, region, target, withEmails: body.extractEmails !== false },
        total: target, created_by: userId,
      }).select("id, status").single();
      if (error) return errorResponse(`Errore creazione job: ${error.message}`, 500, corsH);
      return jsonResponse({ jobId: job.id, status: job.status, target }, 200, corsH);
    }

    // ════════════════════ JOB STATUS (polling avanzamento) ════════════════════
    if (action === "job_status") {
      const jobId = String(body.jobId || "");
      if (!jobId) return errorResponse("jobId obbligatorio.", 400, corsH);
      const { data: job, error } = await supabaseAdmin.from("lead_scraper_jobs")
        .select("id, status, total, processed, results_count, search_id, error, started_at, finished_at")
        .eq("id", jobId).maybeSingle();
      if (error) return errorResponse(error.message, 500, corsH);
      if (!job) return errorResponse("Job non trovato.", 404, corsH);
      return jsonResponse(job, 200, corsH);
    }

    // ════════════════════ FIND PEC (email certificata da P.IVA) ════════════════════
    if (action === "find_pec") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      const openapiToken = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");
      if (!openapiToken) return errorResponse("Configura openapi_it_token per recuperare la PEC dalla P.IVA (openapi.it).", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, partita_iva, email, email_status")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let found = 0;
      await poolMap((leads || []).filter((l: any) => l.partita_iva), 4, async (l: any) => {
        const firmo = await fetchFirmografici(l.partita_iva, openapiToken, await openapiBase());
        if (firmo?.pec) {
          await supabaseAdmin.from("lead_scraper_results").update({
            email: l.email || firmo.pec,
            email_status: l.email && l.email_status !== "pec" ? l.email_status : "pec",
            ateco: firmo.ateco || undefined,
            ateco_desc: firmo.ateco_desc || undefined,
            company_size: firmo.company_size || undefined,
            fatturato: firmo.fatturato ?? undefined,
            dipendenti: firmo.dipendenti ?? undefined,
            anno_fondazione: firmo.anno_fondazione ?? undefined,
            forma_giuridica: firmo.forma_giuridica || undefined,
          }).eq("id", l.id);
          found++;
        }
      });
      return jsonResponse({ found, attempted: (leads || []).filter((l: any) => l.partita_iva).length }, 200, corsH);
    }

    // ═══════════ ENRICH REGISTRO IMPRESE (ATECO, fatturato, dipendenti, anno) ═══════════
    // Arricchisce i firmografici reali da P.IVA via openapi.it (Registro Imprese).
    // Non richiede una PEC: utile per filtrare per dimensione/codice ATECO edilizia (41/42/43).
    if (action === "enrich_registro") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);
      const openapiToken = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");
      if (!openapiToken) return errorResponse("Configura openapi_it_token per arricchire dal Registro Imprese (openapi.it).", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, partita_iva, email, email_status")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      const withPiva = (leads || []).filter((l: any) => l.partita_iva);
      let enriched = 0, withPec = 0;
      await poolMap(withPiva, 4, async (l: any) => {
        const firmo = await fetchFirmografici(l.partita_iva, openapiToken, await openapiBase());
        if (!firmo) return;
        const patch: Record<string, unknown> = {
          ateco: firmo.ateco || undefined,
          ateco_desc: firmo.ateco_desc || undefined,
          company_size: firmo.company_size || undefined,
          fatturato: firmo.fatturato ?? undefined,
          dipendenti: firmo.dipendenti ?? undefined,
          anno_fondazione: firmo.anno_fondazione ?? undefined,
          forma_giuridica: firmo.forma_giuridica || undefined,
        };
        // se non ha email ancora, usa la PEC come email deliverable
        if (firmo.pec && !l.email) { patch.email = firmo.pec; patch.email_status = "pec"; withPec++; }
        const hasAny = Object.values(patch).some((v) => v !== undefined);
        if (hasAny) { await supabaseAdmin.from("lead_scraper_results").update(patch).eq("id", l.id); enriched++; }
      });
      return jsonResponse({ enriched, withPec, attempted: withPiva.length }, 200, corsH);
    }

    // ═══════════ IMPORT CRM (aziende già nel sistema → lista arricchibile) ═══════════
    // Pesca contatti da marketing_contacts (es. quelli con P.IVA ma senza email,
    // o senza telefono) e li trasforma in una ricerca scraper: da lì si usano
    // TUTTI gli strumenti (deep_enrich, Registro Imprese, PEC, VIES, email finder…)
    // e con sync_crm i dati trovati tornano nel contatto CRM originale.
    if (action === "import_crm") {
      const qRaw = String(body.q || "").trim();
      // sanitizza per la sintassi .or() di PostgREST (virgole/parentesi la rompono)
      const q = qRaw.replace(/[,()]/g, " ").trim();
      const missing = String(body.missing || ""); // email | phone | piva | website | ""
      const onlyWithPiva = body.onlyWithPiva === true;
      const limit = Math.max(1, Math.min(500, Number(body.limit) || 200));

      let sel = supabaseAdmin
        .from("marketing_contacts")
        .select("id, first_name, last_name, company_name, email, phone, website, address, city, province, vat_number, fatturato, source, created_at")
        .eq("company_id", PLATFORM_ADMIN_COMPANY_ID);
      if (q) sel = sel.or(`company_name.ilike.%${q}%,vat_number.ilike.%${q}%,city.ilike.%${q}%,email.ilike.%${q}%,last_name.ilike.%${q}%`);
      if (missing === "email") sel = sel.is("email", null);
      if (missing === "phone") sel = sel.is("phone", null);
      if (missing === "piva") sel = sel.is("vat_number", null);
      if (missing === "website") sel = sel.is("website", null);
      if (onlyWithPiva) sel = sel.not("vat_number", "is", null);
      const { data: contacts, error: cErr } = await sel.order("created_at", { ascending: false }).limit(limit);
      if (cErr) return errorResponse(cErr.message, 500, corsH);
      if (!contacts?.length) return jsonResponse({ searchId: null, count: 0 }, 200, corsH);

      const rows = contacts.map((c: any) => {
        const person = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
        const businessName = (c.company_name || person || "Azienda").trim();
        const piva = c.vat_number ? String(c.vat_number).replace(/\D/g, "") : null;
        return {
          source: "crm",
          business_name: businessName,
          // il referente solo se distinto dalla ragione sociale (push_crm storicamente
          // metteva il nome azienda in first_name quando non c'era una persona)
          contact_name: c.company_name && person && person.toLowerCase() !== businessName.toLowerCase() ? person : null,
          email: c.email || null,
          email_status: c.email ? "found" : null,
          phone: c.phone || null,
          website: c.website || null,
          address: c.address || null,
          city: c.city || null,
          region: c.province || null,
          partita_iva: piva && piva.length === 11 ? piva : null,
          fatturato: c.fatturato ?? null,
          country: "IT",
          crm_contact_id: c.id,
          pushed_to_crm: true, // già nel CRM: push_crm non deve ricrearlo
          dedupe_key: `crm:${c.id}`,
          raw: { crm_source: c.source || null },
        };
      });

      const missLbl: Record<string, string> = { email: "senza email", phone: "senza telefono", piva: "senza P.IVA", website: "senza sito" };
      const label = body.label || `CRM · ${[q || null, missLbl[missing] || null, onlyWithPiva ? "con P.IVA" : null].filter(Boolean).join(" · ") || "tutti"}`;
      const { data: searchRow, error: sErr } = await supabaseAdmin.from("lead_scraper_searches").insert({
        created_by: userId, source: "crm", label,
        query: { q: qRaw, missing, onlyWithPiva, limit, import: "crm" },
        status: "completed", results_count: rows.length,
      }).select("id").single();
      if (sErr) return errorResponse(`Errore salvataggio ricerca: ${sErr.message}`, 500, corsH);

      const { data: inserted, error: rErr } = await supabaseAdmin.from("lead_scraper_results")
        .upsert(rows.map((r) => ({ ...r, search_id: searchRow.id })), { onConflict: "search_id,dedupe_key", ignoreDuplicates: true })
        .select("id");
      if (rErr) return errorResponse(`Errore salvataggio lead: ${rErr.message}`, 500, corsH);

      return jsonResponse({
        searchId: searchRow.id,
        count: (inserted || []).length,
        withPiva: rows.filter((r) => r.partita_iva).length,
        withEmail: rows.filter((r) => r.email).length,
        withWebsite: rows.filter((r) => r.website).length,
      }, 200, corsH);
    }

    // ═══════════ SYNC CRM (enrichment del lead → contatto CRM, fill-empty) ═══════════
    // Per i lead collegati a un contatto (crm_contact_id) riempie SOLO i campi
    // vuoti del contatto con quanto trovato dall'enrichment. Mai sovrascrivere
    // dati già presenti nel CRM. Le email "guessed" NON vengono propagate.
    if (action === "sync_crm") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
      if (ids.length > 500) return errorResponse("Troppi lead in una sola chiamata (max 500). Usa lotti più piccoli.", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, crm_contact_id, business_name, email, email_status, phone, website, address, city, region, partita_iva, fatturato, ateco, ateco_desc, dipendenti, anno_fondazione, forma_giuridica, enrichment")
        .in("id", ids)
        .not("crm_contact_id", "is", null);
      if (error) return errorResponse(error.message, 500, corsH);
      const linked = leads || [];
      if (!linked.length) return jsonResponse({ synced: 0, attempted: 0 }, 200, corsH);

      const contactIds = [...new Set(linked.map((l: any) => l.crm_contact_id))];
      const { data: contacts, error: ctErr } = await supabaseAdmin
        .from("marketing_contacts")
        .select("id, email, phone, website, vat_number, company_name, city, province, fatturato, notes, tags")
        .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
        .in("id", contactIds);
      if (ctErr) return errorResponse(ctErr.message, 500, corsH);
      const byId = new Map((contacts || []).map((c: any) => [c.id, c]));

      let synced = 0;
      let filled_email = 0, filled_phone = 0, filled_piva = 0, filled_sito = 0, filled_fatturato = 0;
      const TRUSTED_EMAIL = new Set(["found", "pec", "verified", "verified_mx"]);
      for (const l of linked) {
        const c = byId.get(l.crm_contact_id);
        if (!c) continue;
        const patch: Record<string, unknown> = {};
        if (!c.email && l.email && TRUSTED_EMAIL.has(String(l.email_status || ""))) { patch.email = l.email; filled_email++; }
        if (!c.phone && l.phone) { patch.phone = l.phone; filled_phone++; }
        if (!c.website && l.website) { patch.website = l.website; filled_sito++; }
        if (!c.vat_number && l.partita_iva) { patch.vat_number = l.partita_iva; filled_piva++; }
        if (c.fatturato == null && l.fatturato != null) { patch.fatturato = l.fatturato; filled_fatturato++; }
        if (!c.city && l.city) patch.city = l.city;
        if (!c.province && l.region && String(l.region).trim().length <= 3) patch.province = String(l.region).trim().toUpperCase();
        const viesName = (l.enrichment as any)?.vies?.name as string | undefined;
        if (!c.company_name && (viesName || l.business_name)) patch.company_name = viesName || l.business_name;
        // ATECO/dipendenti/anno nel campo note (marketing_contacts non ha colonne dedicate)
        const noteBits = [
          l.ateco && !(c.notes || "").includes("ATECO") ? `ATECO ${l.ateco}${l.ateco_desc ? ` (${l.ateco_desc})` : ""}` : null,
          l.dipendenti != null && !(c.notes || "").includes("Dipendenti") ? `Dipendenti: ${l.dipendenti}` : null,
          l.anno_fondazione && !(c.notes || "").includes("Anno fondazione") ? `Anno fondazione: ${l.anno_fondazione}` : null,
          l.forma_giuridica && !(c.notes || "").includes("Forma:") ? `Forma: ${l.forma_giuridica}` : null,
        ].filter(Boolean);
        if (noteBits.length) patch.notes = [c.notes, `[Scraper] ${noteBits.join(" · ")}`].filter(Boolean).join("\n");
        if (l.ateco) {
          const tags = new Set<string>([...(c.tags || []), `ateco:${l.ateco}`]);
          if (tags.size !== (c.tags || []).length) patch.tags = [...tags];
        }
        if (Object.keys(patch).length === 0) continue;
        const { error: upErr } = await supabaseAdmin
          .from("marketing_contacts").update(patch)
          .eq("id", c.id).eq("company_id", PLATFORM_ADMIN_COMPANY_ID);
        if (!upErr) {
          synced++;
          // aggiorna la copia locale: più lead sullo stesso contatto non ri-riempiono
          Object.assign(c, patch);
        }
      }
      return jsonResponse({ synced, attempted: linked.length, filled_email, filled_phone, filled_piva, filled_sito, filled_fatturato }, 200, corsH);
    }

    // ═══════════ OPENAPI ENV (toggle sandbox/prod dalla UI) ═══════════
    if (action === "openapi_env") {
      const set = body.set === "prod" ? "prod" : body.set === "sandbox" ? "sandbox" : null;
      if (set) {
        const { error } = await supabaseAdmin.from("platform_settings")
          .upsert({ key: "openapi_env", value: set }, { onConflict: "key" });
        if (error) return errorResponse(error.message, 500, corsH);
        _openapiBaseCache = null; // invalida la cache così il cambio è immediato
      }
      const env = ((await getPlatformSetting("openapi_env", "OPENAPI_ENV")) || "prod").toLowerCase();
      const token = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");
      return jsonResponse({ env: env === "test" ? "sandbox" : env, hasToken: !!token }, 200, corsH);
    }

    return errorResponse(`Azione sconosciuta: ${action}`, 400, corsH);
  } catch (err) {
    // requireAuth/requireRole lanciano una Response già pronta
    if (err instanceof Response) return err;
    if (isTimeoutError(err)) return errorResponse("Timeout fonte esterna.", 504, corsH);
    return errorResponse(`Errore interno: ${(err as Error).message}`, 500, corsH);
  }
});
