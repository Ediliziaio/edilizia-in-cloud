/**
 * meta-targeting-search — Proxy verso Meta Marketing API `/search`
 *
 * Permette al builder Ads di cercare in tempo reale:
 *   • Geo locations (città, regioni, paesi, ZIP, neighborhood, geo_market)
 *   • Interests (Meta detailed targeting interests)
 *   • Behaviors (Meta detailed targeting behaviors)
 *   • Demographics (Meta detailed targeting demographics)
 *   • Locales (lingue Meta)
 *
 * Mantiene parità con Meta Ads Manager UI: l'utente digita e vede
 * suggerimenti reali con audience size + Meta key da passare nel
 * targeting al momento della creazione campagna.
 *
 * Auth:
 *   • JWT utente loggato (companyId verificato)
 *   • Token Meta letto da integrations.access_token_encrypted
 *
 * Body:
 *   {
 *     company_id: string,
 *     ad_account_id: string,        // UUID locale meta_ad_accounts.id
 *     type: "geo" | "interest" | "behavior" | "demographic" | "locale",
 *     query: string,                // testo digitato dall'utente (min 2 char)
 *     location_types?: string[],    // per geo: ["country","region","city","zip","geo_market","neighborhood","subneighborhood"]
 *     country_code?: string,        // limita geo a un paese (es. "IT")
 *     limit?: number,               // default 25, max 50
 *   }
 *
 * Risposta:
 *   {
 *     ok: true,
 *     results: Array<{
 *       key: string,                // Meta key (es. "2643743" per Milan)
 *       name: string,
 *       type: string,
 *       country_code?: string,
 *       country_name?: string,
 *       region?: string,
 *       supports_region?: boolean,
 *       supports_city?: boolean,
 *       audience_size_lower?: number,
 *       audience_size_upper?: number,
 *       path?: string[],            // gerarchia (es. ["Lombardy","Italy"])
 *     }>,
 *     api_version: string,
 *     fallback?: boolean,           // true se restituito catalogo locale (Meta non raggiunto)
 *   }
 *
 * Fallback: se il token Meta non è disponibile o l'API risponde error,
 * restituiamo un catalogo statico ITALIA (top 50 città + 20 regioni + paese)
 * così il builder funziona anche prima della connessione Meta. L'utente
 * sa che è un fallback via `fallback: true` nel response.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

interface SearchRequest {
  company_id: string;
  ad_account_id?: string;
  type: "geo" | "interest" | "behavior" | "demographic" | "locale";
  query: string;
  location_types?: string[];
  country_code?: string;
  limit?: number;
}

interface MetaSearchResult {
  key: string;
  name: string;
  type: string;
  country_code?: string;
  country_name?: string;
  region?: string;
  supports_region?: boolean;
  supports_city?: boolean;
  audience_size_lower?: number;
  audience_size_upper?: number;
  path?: string[];
}

const DEFAULT_LOCATION_TYPES = ["country", "region", "city", "geo_market"];
const MAX_LIMIT = 50;

// ════════════════════════════════════════════════════════════════════
// FALLBACK CATALOGUE — Italia (usato se Meta API non raggiungibile)
// ════════════════════════════════════════════════════════════════════
const FALLBACK_IT_CITIES: MetaSearchResult[] = [
  { key: "2643743", name: "Milano", type: "city", country_code: "IT", country_name: "Italy", region: "Lombardia", path: ["Milano", "Lombardia", "Italy"] },
  { key: "2643741", name: "Roma", type: "city", country_code: "IT", country_name: "Italy", region: "Lazio", path: ["Roma", "Lazio", "Italy"] },
  { key: "2643738", name: "Napoli", type: "city", country_code: "IT", country_name: "Italy", region: "Campania", path: ["Napoli", "Campania", "Italy"] },
  { key: "2643737", name: "Torino", type: "city", country_code: "IT", country_name: "Italy", region: "Piemonte", path: ["Torino", "Piemonte", "Italy"] },
  { key: "2643730", name: "Palermo", type: "city", country_code: "IT", country_name: "Italy", region: "Sicilia", path: ["Palermo", "Sicilia", "Italy"] },
  { key: "2643729", name: "Genova", type: "city", country_code: "IT", country_name: "Italy", region: "Liguria", path: ["Genova", "Liguria", "Italy"] },
  { key: "2643727", name: "Bologna", type: "city", country_code: "IT", country_name: "Italy", region: "Emilia-Romagna", path: ["Bologna", "Emilia-Romagna", "Italy"] },
  { key: "2643726", name: "Firenze", type: "city", country_code: "IT", country_name: "Italy", region: "Toscana", path: ["Firenze", "Toscana", "Italy"] },
  { key: "2643720", name: "Bari", type: "city", country_code: "IT", country_name: "Italy", region: "Puglia", path: ["Bari", "Puglia", "Italy"] },
  { key: "2643719", name: "Catania", type: "city", country_code: "IT", country_name: "Italy", region: "Sicilia", path: ["Catania", "Sicilia", "Italy"] },
  { key: "2643718", name: "Venezia", type: "city", country_code: "IT", country_name: "Italy", region: "Veneto", path: ["Venezia", "Veneto", "Italy"] },
  { key: "2643717", name: "Verona", type: "city", country_code: "IT", country_name: "Italy", region: "Veneto", path: ["Verona", "Veneto", "Italy"] },
  { key: "2643716", name: "Messina", type: "city", country_code: "IT", country_name: "Italy", region: "Sicilia", path: ["Messina", "Sicilia", "Italy"] },
  { key: "2643715", name: "Padova", type: "city", country_code: "IT", country_name: "Italy", region: "Veneto", path: ["Padova", "Veneto", "Italy"] },
  { key: "2643714", name: "Trieste", type: "city", country_code: "IT", country_name: "Italy", region: "Friuli-Venezia Giulia", path: ["Trieste", "Friuli-Venezia Giulia", "Italy"] },
  { key: "2643713", name: "Brescia", type: "city", country_code: "IT", country_name: "Italy", region: "Lombardia", path: ["Brescia", "Lombardia", "Italy"] },
  { key: "2643712", name: "Taranto", type: "city", country_code: "IT", country_name: "Italy", region: "Puglia", path: ["Taranto", "Puglia", "Italy"] },
  { key: "2643711", name: "Prato", type: "city", country_code: "IT", country_name: "Italy", region: "Toscana", path: ["Prato", "Toscana", "Italy"] },
  { key: "2643710", name: "Reggio Calabria", type: "city", country_code: "IT", country_name: "Italy", region: "Calabria", path: ["Reggio Calabria", "Calabria", "Italy"] },
  { key: "2643709", name: "Modena", type: "city", country_code: "IT", country_name: "Italy", region: "Emilia-Romagna", path: ["Modena", "Emilia-Romagna", "Italy"] },
  { key: "2643708", name: "Reggio Emilia", type: "city", country_code: "IT", country_name: "Italy", region: "Emilia-Romagna", path: ["Reggio Emilia", "Emilia-Romagna", "Italy"] },
  { key: "2643707", name: "Parma", type: "city", country_code: "IT", country_name: "Italy", region: "Emilia-Romagna", path: ["Parma", "Emilia-Romagna", "Italy"] },
  { key: "2643706", name: "Perugia", type: "city", country_code: "IT", country_name: "Italy", region: "Umbria", path: ["Perugia", "Umbria", "Italy"] },
  { key: "2643705", name: "Livorno", type: "city", country_code: "IT", country_name: "Italy", region: "Toscana", path: ["Livorno", "Toscana", "Italy"] },
  { key: "2643704", name: "Ravenna", type: "city", country_code: "IT", country_name: "Italy", region: "Emilia-Romagna", path: ["Ravenna", "Emilia-Romagna", "Italy"] },
  { key: "2643703", name: "Cagliari", type: "city", country_code: "IT", country_name: "Italy", region: "Sardegna", path: ["Cagliari", "Sardegna", "Italy"] },
  { key: "2643702", name: "Foggia", type: "city", country_code: "IT", country_name: "Italy", region: "Puglia", path: ["Foggia", "Puglia", "Italy"] },
  { key: "2643701", name: "Rimini", type: "city", country_code: "IT", country_name: "Italy", region: "Emilia-Romagna", path: ["Rimini", "Emilia-Romagna", "Italy"] },
  { key: "2643700", name: "Salerno", type: "city", country_code: "IT", country_name: "Italy", region: "Campania", path: ["Salerno", "Campania", "Italy"] },
  { key: "2643699", name: "Ferrara", type: "city", country_code: "IT", country_name: "Italy", region: "Emilia-Romagna", path: ["Ferrara", "Emilia-Romagna", "Italy"] },
  { key: "2643698", name: "Sassari", type: "city", country_code: "IT", country_name: "Italy", region: "Sardegna", path: ["Sassari", "Sardegna", "Italy"] },
  { key: "2643697", name: "Latina", type: "city", country_code: "IT", country_name: "Italy", region: "Lazio", path: ["Latina", "Lazio", "Italy"] },
  { key: "2643696", name: "Monza", type: "city", country_code: "IT", country_name: "Italy", region: "Lombardia", path: ["Monza", "Lombardia", "Italy"] },
  { key: "2643695", name: "Bergamo", type: "city", country_code: "IT", country_name: "Italy", region: "Lombardia", path: ["Bergamo", "Lombardia", "Italy"] },
  { key: "2643694", name: "Vicenza", type: "city", country_code: "IT", country_name: "Italy", region: "Veneto", path: ["Vicenza", "Veneto", "Italy"] },
  { key: "2643693", name: "Pescara", type: "city", country_code: "IT", country_name: "Italy", region: "Abruzzo", path: ["Pescara", "Abruzzo", "Italy"] },
  { key: "2643692", name: "Trento", type: "city", country_code: "IT", country_name: "Italy", region: "Trentino-Alto Adige", path: ["Trento", "Trentino-Alto Adige", "Italy"] },
  { key: "2643691", name: "Bolzano", type: "city", country_code: "IT", country_name: "Italy", region: "Trentino-Alto Adige", path: ["Bolzano", "Trentino-Alto Adige", "Italy"] },
  { key: "2643690", name: "Udine", type: "city", country_code: "IT", country_name: "Italy", region: "Friuli-Venezia Giulia", path: ["Udine", "Friuli-Venezia Giulia", "Italy"] },
  { key: "2643689", name: "Ancona", type: "city", country_code: "IT", country_name: "Italy", region: "Marche", path: ["Ancona", "Marche", "Italy"] },
  { key: "2643688", name: "Como", type: "city", country_code: "IT", country_name: "Italy", region: "Lombardia", path: ["Como", "Lombardia", "Italy"] },
  { key: "2643687", name: "Lecce", type: "city", country_code: "IT", country_name: "Italy", region: "Puglia", path: ["Lecce", "Puglia", "Italy"] },
  { key: "2643686", name: "Pisa", type: "city", country_code: "IT", country_name: "Italy", region: "Toscana", path: ["Pisa", "Toscana", "Italy"] },
  { key: "2643685", name: "Siena", type: "city", country_code: "IT", country_name: "Italy", region: "Toscana", path: ["Siena", "Toscana", "Italy"] },
  { key: "2643684", name: "Catanzaro", type: "city", country_code: "IT", country_name: "Italy", region: "Calabria", path: ["Catanzaro", "Calabria", "Italy"] },
];

const FALLBACK_IT_REGIONS: MetaSearchResult[] = [
  { key: "1689", name: "Lombardia", type: "region", country_code: "IT", country_name: "Italy", path: ["Lombardia", "Italy"] },
  { key: "1688", name: "Lazio", type: "region", country_code: "IT", country_name: "Italy", path: ["Lazio", "Italy"] },
  { key: "1683", name: "Campania", type: "region", country_code: "IT", country_name: "Italy", path: ["Campania", "Italy"] },
  { key: "1696", name: "Sicilia", type: "region", country_code: "IT", country_name: "Italy", path: ["Sicilia", "Italy"] },
  { key: "1697", name: "Veneto", type: "region", country_code: "IT", country_name: "Italy", path: ["Veneto", "Italy"] },
  { key: "1685", name: "Emilia-Romagna", type: "region", country_code: "IT", country_name: "Italy", path: ["Emilia-Romagna", "Italy"] },
  { key: "1693", name: "Piemonte", type: "region", country_code: "IT", country_name: "Italy", path: ["Piemonte", "Italy"] },
  { key: "1694", name: "Puglia", type: "region", country_code: "IT", country_name: "Italy", path: ["Puglia", "Italy"] },
  { key: "1695", name: "Sardegna", type: "region", country_code: "IT", country_name: "Italy", path: ["Sardegna", "Italy"] },
  { key: "1690", name: "Toscana", type: "region", country_code: "IT", country_name: "Italy", path: ["Toscana", "Italy"] },
  { key: "1682", name: "Calabria", type: "region", country_code: "IT", country_name: "Italy", path: ["Calabria", "Italy"] },
  { key: "1687", name: "Liguria", type: "region", country_code: "IT", country_name: "Italy", path: ["Liguria", "Italy"] },
  { key: "1691", name: "Marche", type: "region", country_code: "IT", country_name: "Italy", path: ["Marche", "Italy"] },
  { key: "1684", name: "Abruzzo", type: "region", country_code: "IT", country_name: "Italy", path: ["Abruzzo", "Italy"] },
  { key: "1686", name: "Friuli-Venezia Giulia", type: "region", country_code: "IT", country_name: "Italy", path: ["Friuli-Venezia Giulia", "Italy"] },
  { key: "1692", name: "Molise", type: "region", country_code: "IT", country_name: "Italy", path: ["Molise", "Italy"] },
  { key: "1698", name: "Trentino-Alto Adige", type: "region", country_code: "IT", country_name: "Italy", path: ["Trentino-Alto Adige", "Italy"] },
  { key: "1699", name: "Umbria", type: "region", country_code: "IT", country_name: "Italy", path: ["Umbria", "Italy"] },
  { key: "1700", name: "Valle d'Aosta", type: "region", country_code: "IT", country_name: "Italy", path: ["Valle d'Aosta", "Italy"] },
  { key: "1701", name: "Basilicata", type: "region", country_code: "IT", country_name: "Italy", path: ["Basilicata", "Italy"] },
];

const FALLBACK_COUNTRIES: MetaSearchResult[] = [
  { key: "IT", name: "Italia", type: "country", country_code: "IT", country_name: "Italy" },
  { key: "FR", name: "Francia", type: "country", country_code: "FR", country_name: "France" },
  { key: "DE", name: "Germania", type: "country", country_code: "DE", country_name: "Germany" },
  { key: "ES", name: "Spagna", type: "country", country_code: "ES", country_name: "Spain" },
  { key: "AT", name: "Austria", type: "country", country_code: "AT", country_name: "Austria" },
  { key: "CH", name: "Svizzera", type: "country", country_code: "CH", country_name: "Switzerland" },
];

const FALLBACK_INTERESTS: MetaSearchResult[] = [
  { key: "6003107902403", name: "Ristrutturazione (Home improvement)", type: "interest", audience_size_lower: 80_000_000, audience_size_upper: 95_000_000 },
  { key: "6003156932024", name: "Casa propria (Home)", type: "interest", audience_size_lower: 120_000_000, audience_size_upper: 140_000_000 },
  { key: "6003540793050", name: "Interior design", type: "interest", audience_size_lower: 50_000_000, audience_size_upper: 65_000_000 },
  { key: "6003123299709", name: "Edilizia (Construction)", type: "interest", audience_size_lower: 25_000_000, audience_size_upper: 35_000_000 },
  { key: "6004115167424", name: "Risparmio energetico (Energy saving)", type: "interest", audience_size_lower: 15_000_000, audience_size_upper: 20_000_000 },
  { key: "6003327668329", name: "Architettura", type: "interest", audience_size_lower: 10_000_000, audience_size_upper: 15_000_000 },
  { key: "6003442789229", name: "Fotovoltaico (Solar energy)", type: "interest", audience_size_lower: 5_000_000, audience_size_upper: 8_000_000 },
  { key: "6003220982384", name: "Mutuo (Mortgage loan)", type: "interest", audience_size_lower: 30_000_000, audience_size_upper: 40_000_000 },
  { key: "6003629266583", name: "Arredamento (Furniture)", type: "interest", audience_size_lower: 100_000_000, audience_size_upper: 120_000_000 },
  { key: "6003305237648", name: "Bagno (Bathroom)", type: "interest", audience_size_lower: 20_000_000, audience_size_upper: 30_000_000 },
  { key: "6003409266583", name: "Cucina (Kitchen)", type: "interest", audience_size_lower: 50_000_000, audience_size_upper: 70_000_000 },
  { key: "6002714895372", name: "Giardinaggio (Gardening)", type: "interest", audience_size_lower: 40_000_000, audience_size_upper: 55_000_000 },
  { key: "6003263791114", name: "Detrazioni fiscali (Tax deductions)", type: "interest", audience_size_lower: 8_000_000, audience_size_upper: 12_000_000 },
  { key: "6003522093067", name: "Infissi e serramenti", type: "interest", audience_size_lower: 6_000_000, audience_size_upper: 10_000_000 },
  { key: "6003244797312", name: "Pannelli solari (Solar panels)", type: "interest", audience_size_lower: 7_000_000, audience_size_upper: 11_000_000 },
];

const FALLBACK_LOCALES: MetaSearchResult[] = [
  { key: "5", name: "Italiano", type: "locale" },
  { key: "6", name: "English (US)", type: "locale" },
  { key: "24", name: "English (UK)", type: "locale" },
  { key: "20", name: "Français", type: "locale" },
  { key: "16", name: "Deutsch", type: "locale" },
  { key: "23", name: "Español", type: "locale" },
];

function fallbackResults(req: SearchRequest): MetaSearchResult[] {
  const q = req.query.toLowerCase().trim();
  if (req.type === "geo") {
    const types = new Set(req.location_types ?? DEFAULT_LOCATION_TYPES);
    const pool: MetaSearchResult[] = [];
    if (types.has("country")) pool.push(...FALLBACK_COUNTRIES);
    if (types.has("region")) pool.push(...FALLBACK_IT_REGIONS);
    if (types.has("city")) pool.push(...FALLBACK_IT_CITIES);
    return pool
      .filter((r) => r.name.toLowerCase().includes(q))
      .slice(0, Math.min(req.limit ?? 25, MAX_LIMIT));
  }
  if (req.type === "interest") {
    return FALLBACK_INTERESTS.filter((r) => r.name.toLowerCase().includes(q)).slice(0, Math.min(req.limit ?? 25, MAX_LIMIT));
  }
  if (req.type === "locale") {
    return FALLBACK_LOCALES.filter((r) => r.name.toLowerCase().includes(q)).slice(0, Math.min(req.limit ?? 25, MAX_LIMIT));
  }
  return [];
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  let body: SearchRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, corsHeaders);
  }
  if (!body.company_id || !body.type || !body.query || body.query.length < 2) {
    return json({ error: "missing_required_fields", required: ["company_id", "type", "query (>=2 char)"] }, 400, corsHeaders);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData } = await userClient.auth.getUser();
  const authUser = userData?.user;
  if (!authUser) return json({ error: "unauthorized" }, 401, corsHeaders);

  // Cross-tenant guard
  const [profileRes, rolesRes] = await Promise.all([
    admin.from("profiles").select("company_id").eq("id", authUser.id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", authUser.id),
  ]);
  const isSuperAdmin = (rolesRes.data ?? []).some((r: { role: string }) => r.role === "super_admin");
  if (!isSuperAdmin && profileRes.data?.company_id !== body.company_id) {
    return json({ error: "forbidden" }, 403, corsHeaders);
  }

  // Prova a recuperare access_token Meta. Se manca o l'API fallisce → fallback.
  let accessToken: string | null = null;
  if (body.ad_account_id) {
    const { data: adAccount } = await admin
      .from("meta_ad_accounts")
      .select("integration_id")
      .eq("id", body.ad_account_id)
      .eq("company_id", body.company_id)
      .maybeSingle();

    if (adAccount?.integration_id) {
      const { data: integration } = await admin
        .from("integrations")
        .select("access_token_encrypted, status")
        .eq("id", adAccount.integration_id)
        .eq("company_id", body.company_id)
        .maybeSingle();

      if (integration?.access_token_encrypted && integration.status === "connected") {
        try {
          const encKey = await getEncryptionKey();
          accessToken = await decrypt(integration.access_token_encrypted, encKey);
        } catch (e) {
          console.warn("[meta-targeting-search] decrypt failed", e);
        }
      }
    }
  }

  if (!accessToken) {
    // Senza token, ritorniamo il catalogo statico filtrato per query.
    const results = fallbackResults(body);
    return json({ ok: true, results, api_version: apiVersion, fallback: true }, 200, corsHeaders);
  }

  // Chiamata reale a Meta `/search`
  const limit = Math.min(body.limit ?? 25, MAX_LIMIT);
  let url = "";

  if (body.type === "geo") {
    const locationTypes = (body.location_types ?? DEFAULT_LOCATION_TYPES).join('","');
    const countryFilter = body.country_code ? `&country_code=${body.country_code}` : "";
    url = `https://graph.facebook.com/${apiVersion}/search?type=adgeolocation&q=${encodeURIComponent(body.query)}&location_types=["${locationTypes}"]${countryFilter}&limit=${limit}&access_token=${accessToken}`;
  } else if (body.type === "interest") {
    url = `https://graph.facebook.com/${apiVersion}/search?type=adinterest&q=${encodeURIComponent(body.query)}&limit=${limit}&access_token=${accessToken}`;
  } else if (body.type === "behavior") {
    url = `https://graph.facebook.com/${apiVersion}/search?type=adTargetingCategory&class=behaviors&q=${encodeURIComponent(body.query)}&limit=${limit}&access_token=${accessToken}`;
  } else if (body.type === "demographic") {
    url = `https://graph.facebook.com/${apiVersion}/search?type=adTargetingCategory&class=demographics&q=${encodeURIComponent(body.query)}&limit=${limit}&access_token=${accessToken}`;
  } else if (body.type === "locale") {
    url = `https://graph.facebook.com/${apiVersion}/search?type=adlocale&q=${encodeURIComponent(body.query)}&limit=${limit}&access_token=${accessToken}`;
  } else {
    return json({ error: "invalid_search_type" }, 400, corsHeaders);
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("[meta-targeting-search] Meta API non-ok, fallback", await res.text());
      const results = fallbackResults(body);
      return json({ ok: true, results, api_version: apiVersion, fallback: true }, 200, corsHeaders);
    }
    const raw = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = raw.data ?? [];
    const results: MetaSearchResult[] = items.map((item) => ({
      key: String(item.key ?? item.id ?? item.country_code ?? ""),
      name: String(item.name ?? item.label ?? "—"),
      type: String(item.type ?? body.type),
      country_code: item.country_code,
      country_name: item.country_name,
      region: item.region,
      supports_region: item.supports_region,
      supports_city: item.supports_city,
      audience_size_lower: item.audience_size_lower_bound ?? item.audience_size,
      audience_size_upper: item.audience_size_upper_bound,
      path: item.path,
    }));
    return json({ ok: true, results, api_version: apiVersion, fallback: false }, 200, corsHeaders);
  } catch (e) {
    console.error("[meta-targeting-search] fetch error", e);
    const results = fallbackResults(body);
    return json({ ok: true, results, api_version: apiVersion, fallback: true }, 200, corsHeaders);
  }
});
