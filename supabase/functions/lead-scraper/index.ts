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
      } catch (_e) {
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
    } catch {
      // timeout / DNS / TLS → passa al candidato successivo
      continue;
    }
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

interface DeepEnrich {
  emails: string[];
  phones: string[];
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
  const domain = base.hostname.replace(/^www\./, "");
  const pages = [base.href, `${base.origin}/contatti`, `${base.origin}/chi-siamo`, `${base.origin}/azienda`];
  let combined = "";
  let homepageUrl = "";
  for (const url of pages) {
    try {
      const res = await fetchWithTimeout(url, {
        timeoutMs: 6000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EiC-LeadBot/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (!homepageUrl) homepageUrl = res.url || url;
      combined += "\n" + html;
      if (combined.length > 400_000) break; // safety cap
    } catch {
      continue;
    }
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

  // telefoni
  const phones = new Set<string>();
  for (const m of combined.matchAll(PHONE_RE)) {
    const p = cleanPhone(m[0]);
    if (p.replace(/^\+39/, "").length >= 6) phones.add(p);
  }

  // P.IVA — prima con label, poi fallback se ne esiste una sola sulla pagina
  let piva: string | null = null;
  const labelled = combined.match(PIVA_LABEL_RE);
  if (labelled) piva = labelled[1];
  else {
    const all = new Set<string>();
    for (const m of combined.matchAll(PIVA_ANY_RE)) all.add(m[1]);
    if (all.size === 1) piva = [...all][0];
  }

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
    phones: [...phones],
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
  const d = await res.json();
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
  const d = await res.json();
  if (res.status >= 400) throw new Error(`Apollo: ${d.error || d.message || res.status}`);
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
Deno.serve(async (req) => {
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
                  return { ...b, region: b.region || region || null, dedupe_key: dk, categories: [kw] };
                });
                await supabaseAdmin.rpc("scraped_companies_upsert", { p_rows: rows });
                scrapedNew = rows.length;
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
          const gridSize = Math.max(2, Math.min(5, Number(body.gridSize) || 3)); // NxN
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

      for (const s of scored) {
        await supabaseAdmin
          .from("lead_scraper_results")
          .update({ ai_score: s.ai_score, ai_label: s.ai_label, ai_reason: s.ai_reason })
          .eq("id", s.id);
      }
      return jsonResponse({ qualified: scored.length, results: scored }, 200, corsH);
    }

    // ════════════════════════════ PUSH CRM ════════════════════════════
    if (action === "push_crm") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
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

      let pushed = 0, skipped = 0, suppressed = 0, duplicates = 0, opportunities = 0;
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
            province: l.region || null,
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
        }
      }
      return jsonResponse({ pushed, skipped, suppressed, duplicates, opportunities }, 200, corsH);
    }

    // ════════════════════ DEEP ENRICH (sito → tutto, gratis) ════════════════════
    if (action === "deep_enrich") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      const doVies = body.vies !== false;
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);

      // firmografici opzionali (ATECO/dimensione) — gated dietro openapi.it
      const openapiToken = await getPlatformSetting("openapi_it_token", "OPENAPI_IT_TOKEN");

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, website, phone, email, email_status, contact_name")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let enriched = 0;
      await poolMap(leads || [], 4, async (l: any) => {
        const hasWebsite = !!l.website;
        const deep = hasWebsite ? await scrapeWebsiteDeep(l.website) : null;

        const signals: Record<string, boolean> = deep?.intent_signals || {};
        if (!hasWebsite) signals.no_website = true;

        const bestEmail = l.email || deep?.emails?.[0] || null;
        const bestPhone = l.phone || deep?.phones?.[0] || null;
        const reachable = !!(bestEmail || bestPhone);
        const intent_score = computeIntentScore(signals, reachable, hasWebsite);

        const enrichment: Record<string, unknown> = {};
        if (deep?.phones?.length) enrichment.phones = deep.phones;
        if (deep?.emails?.length) enrichment.emails = deep.emails;
        if (deep?.excerpt) enrichment.site_excerpt = deep.excerpt;

        // VIES sulla P.IVA trovata
        let viesName: string | undefined;
        if (doVies && deep?.partita_iva) {
          const vies = await viesValidate(deep.partita_iva);
          if (vies) {
            enrichment.vies = vies;
            if (vies.valid && vies.name) viesName = vies.name;
          }
        }

        // Firmografici (ATECO, dimensione, fatturato, dipendenti, anno) + PEC se token openapi configurato
        let ateco: string | null = null, ateco_desc: string | null = null, company_size: string | null = null;
        let fatturato: number | null = null, dipendenti: number | null = null;
        let anno_fondazione: number | null = null, forma_giuridica: string | null = null;
        let pecEmail: string | null = null;
        if (openapiToken && deep?.partita_iva) {
          const firmo = await fetchFirmografici(deep.partita_iva, openapiToken, await openapiBase());
          if (firmo) {
            ateco = firmo.ateco || null;
            ateco_desc = firmo.ateco_desc || null;
            company_size = firmo.company_size || null;
            fatturato = firmo.fatturato ?? null;
            dipendenti = firmo.dipendenti ?? null;
            anno_fondazione = firmo.anno_fondazione ?? null;
            forma_giuridica = firmo.forma_giuridica || null;
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
          partita_iva: deep?.partita_iva || null,
          facebook_url: deep?.facebook_url || null,
          instagram_url: deep?.instagram_url || null,
          linkedin_url: deep?.linkedin_url || null,
          contact_name: l.contact_name || viesName || null,
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
        result.facebook_url = deep.facebook_url;
        result.instagram_url = deep.instagram_url;
        result.linkedin_url = deep.linkedin_url;
        result.intent_signals = deep.intent_signals;
        result.site_excerpt = deep.excerpt;
        if (deep.partita_iva && !piva) piva = deep.partita_iva;
      }
      result.partita_iva = piva;

      // 2) VIES (gratis): valida P.IVA → ragione sociale + indirizzo ufficiali
      if (doVies && piva) {
        const vies = await viesValidate(piva);
        if (vies) result.vies = vies;
      }

      // 3) Firmografici + PEC (opzionale, openapi.it solo se token configurato)
      if (openapiToken && piva) {
        const firmo = await fetchFirmografici(piva, openapiToken, await openapiBase());
        if (firmo) result.firmografici = firmo;
      }

      // 4) Opzionale: riempi i campi vuoti del contatto CRM
      if (contactId) {
        const { data: c } = await supabaseAdmin
          .from("marketing_contacts").select("*")
          .eq("id", contactId).eq("company_id", PLATFORM_ADMIN_COMPANY_ID).maybeSingle();
        if (c) {
          const firmo = (result.firmografici || {}) as Record<string, unknown>;
          const viesName = (result.vies as { name?: string } | undefined)?.name;
          const bestEmail = c.email || deep?.emails?.[0] || (firmo.pec as string | undefined) || null;
          const bestPhone = c.phone || deep?.phones?.[0] || null;
          const patch: Record<string, unknown> = {};
          if (!c.email && bestEmail) patch.email = bestEmail;
          if (!c.phone && bestPhone) patch.phone = bestPhone;
          if (!c.website && website) patch.website = website;
          if (!c.vat_number && piva) patch.vat_number = piva;
          if (!c.company_name && (businessName || viesName)) patch.company_name = businessName || viesName;
          if (Object.keys(patch).length) {
            await supabaseAdmin.from("marketing_contacts").update(patch).eq("id", contactId);
            result.contact_updated = Object.keys(patch);
          }
        }
      }

      return jsonResponse(result, 200, corsH);
    }

    // ════════════════════ FIND EMAIL (pattern + MX, gratis) ════════════════════
    if (action === "find_email") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, website, email, contact_name, business_name, email_status")
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
          email_status: l.email ? l.email_status : "verified_mx",
          enrichment: { email_candidates: candidates, mx: true },
        }).eq("id", l.id);
        updated++;
      });
      return jsonResponse({ found: updated, attempted: (leads || []).length }, 200, corsH);
    }

    // ════════════════════ FIND LINKEDIN (Google CSE) ════════════════════
    if (action === "find_linkedin") {
      const ids: string[] = Array.isArray(body.resultIds) ? body.resultIds : [];
      if (ids.length === 0) return errorResponse("resultIds vuoto.", 400, corsH);
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
      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, partita_iva, contact_name")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let validated = 0;
      await poolMap((leads || []).filter((l: any) => l.partita_iva), 4, async (l: any) => {
        const vies = await viesValidate(l.partita_iva);
        if (vies) {
          await supabaseAdmin.from("lead_scraper_results").update({
            enrichment: { vies },
            contact_name: l.contact_name || (vies.valid ? vies.name : null) || null,
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
      // channel: "mailbox" = ruota sulle caselle Google/Outlook collegate (cold outreach,
      // protegge la reputazione del dominio transazionale); "esp" = Resend (per opt-in).
      const channel = body.channel === "mailbox" ? "mailbox" : "esp";
      const ctaUrl = (await getPlatformSetting("outreach_cta_url", "OUTREACH_CTA_URL")) || "https://www.ediliziaincloud.it";
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
