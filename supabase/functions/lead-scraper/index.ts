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

// ── Firmografici via openapi.it (ATECO, dimensione) — gated ───────────────────
async function fetchFirmografici(piva: string, token: string): Promise<{ ateco?: string; ateco_desc?: string; company_size?: string } | null> {
  const num = piva.replace(/\D/g, "");
  if (num.length !== 11) return null;
  try {
    const res = await fetchWithTimeout(`https://company.openapi.com/IT-advanced/${num}`, {
      timeoutMs: 9000,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = await res.json();
    const rec = d?.data?.[0] || d?.data || d;
    const atecoObj = rec?.atecoClassification?.ateco || rec?.ateco || {};
    return {
      ateco: atecoObj?.code || rec?.atecoCode || undefined,
      ateco_desc: atecoObj?.description || rec?.atecoDescription || undefined,
      company_size: rec?.employees ? String(rec.employees) : (rec?.balanceSheets?.[0]?.employees ? String(rec.balanceSheets[0].employees) : undefined),
    };
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
        const cseKey = await getPlatformSetting("google_cse_api_key", "GOOGLE_CSE_API_KEY");
        const cseCx = await getPlatformSetting("google_cse_cx", "GOOGLE_CSE_CX");
        if (!cseKey || !cseCx) {
          return errorResponse(
            "Fonte LinkedIn non configurata: imposta google_cse_api_key + google_cse_cx (Google Programmable Search) in platform_settings. È gratuita fino a 100 ricerche/giorno.",
            400, corsH,
          );
        }
        const keyword = String(body.keyword || "").trim();
        const city = String(body.city || "").trim();
        if (!keyword) return errorResponse("Parametro 'keyword' obbligatorio (es. 'titolare impresa edile').", 400, corsH);
        const q = `site:linkedin.com/in/ ${keyword} ${city}`.trim();
        let items: Array<{ title: string; link: string; snippet: string }>;
        try {
          items = await googleCseSearch(q, cseKey, cseCx);
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
          l.website ? `Sito: ${l.website}` : null,
          l.partita_iva ? `P.IVA: ${l.partita_iva}` : null,
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

        // Firmografici (ATECO, dimensione) se token openapi configurato
        let ateco: string | null = null, ateco_desc: string | null = null, company_size: string | null = null;
        if (openapiToken && deep?.partita_iva) {
          const firmo = await fetchFirmografici(deep.partita_iva, openapiToken);
          if (firmo) {
            ateco = firmo.ateco || null;
            ateco_desc = firmo.ateco_desc || null;
            company_size = firmo.company_size || null;
            enrichment.firmografici = firmo;
          }
        }

        await supabaseAdmin.from("lead_scraper_results").update({
          email: bestEmail,
          phone: bestPhone,
          email_status: l.email ? l.email_status : (deep?.emails?.length ? "found" : l.email_status),
          partita_iva: deep?.partita_iva || null,
          facebook_url: deep?.facebook_url || null,
          instagram_url: deep?.instagram_url || null,
          linkedin_url: deep?.linkedin_url || null,
          contact_name: l.contact_name || viesName || null,
          ateco,
          ateco_desc,
          company_size,
          intent_signals: signals,
          intent_score,
          enriched: true,
          enrichment,
        }).eq("id", l.id);
        enriched++;
      });

      return jsonResponse({ enriched, attempted: (leads || []).length }, 200, corsH);
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
      const cseKey = await getPlatformSetting("google_cse_api_key", "GOOGLE_CSE_API_KEY");
      const cseCx = await getPlatformSetting("google_cse_cx", "GOOGLE_CSE_CX");
      if (!cseKey || !cseCx) {
        return errorResponse("Configura google_cse_api_key + google_cse_cx per cercare LinkedIn (gratis fino a 100/giorno).", 400, corsH);
      }

      const { data: leads, error } = await supabaseAdmin
        .from("lead_scraper_results")
        .select("id, business_name, city, contact_name, linkedin_url, role")
        .in("id", ids);
      if (error) return errorResponse(error.message, 500, corsH);

      let found = 0;
      // sequenziale: rispetta la quota CSE
      for (const l of (leads || []).filter((x: any) => !x.linkedin_url)) {
        const q = `site:linkedin.com/in/ "${l.business_name}" ${l.city || ""} (titolare OR amministratore OR CEO OR fondatore OR owner)`.trim();
        try {
          const items = await googleCseSearch(q, cseKey, cseCx);
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

    return errorResponse(`Azione sconosciuta: ${action}`, 400, corsH);
  } catch (err) {
    // requireAuth/requireRole lanciano una Response già pronta
    if (err instanceof Response) return err;
    if (isTimeoutError(err)) return errorResponse("Timeout fonte esterna.", 504, corsH);
    return errorResponse(`Errore interno: ${(err as Error).message}`, 500, corsH);
  }
});
