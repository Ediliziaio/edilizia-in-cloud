// Listini Serramenti Avanzati — STEP 1
//
// Edge Function: serramenti-installa-catalogo
//
// Input: { company_id: string, slugs?: string[] }
//         (slugs filtra il sottoinsieme di tipologie; vuoto = installa tutte)
// Output: { ok: true, installed: number, skipped: number, errors: string[] }
//
// Installa il catalogo base di 20 tipologie serramenti in article_families
// per la company specificata. Vertical='serramentista'. Idempotente:
// salta famiglie già esistenti per (company_id, nome).
//
// Ogni famiglia è marcata via custom_field_values:
//   { catalogo_base: true, slug, categoria, ante, area_max_mq }
//
// Le icone SVG non vengono salvate in DB — restano client-side (lookup
// via slug in CATALOGO_TIPOLOGIE) per mantenere leggera la tabella.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

// ── Seed tipologie (metadata only, niente SVG) ────────────────────────────────

interface TipologiaSeed {
  slug: string;
  nome: string;
  categoria: "finestra" | "porta_balcone" | "porta_ingresso" | "scorrevole" | "fisso";
  ante: number | null;
  descrizione: string;
  modalita_prezzo_base: "pz" | "mq" | "griglia" | "misura_libera";
  unit_of_measure: string;
  area_max_mq: number | null;
  sort_order: number;
}

const CATALOGO_TIPOLOGIE: TipologiaSeed[] = [
  // FINESTRE (6)
  { slug: "finestra-1-anta", nome: "Finestra 1 anta", categoria: "finestra", ante: 1, descrizione: "Finestra ad anta singola a battente. Apertura laterale.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 2.25, sort_order: 10 },
  { slug: "finestra-2-ante", nome: "Finestra 2 ante", categoria: "finestra", ante: 2, descrizione: "Finestra a due ante a battente.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 4.5, sort_order: 20 },
  { slug: "finestra-3-ante", nome: "Finestra 3 ante", categoria: "finestra", ante: 3, descrizione: "Finestra a tre ante a battente.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 6.75, sort_order: 30 },
  { slug: "finestra-vasistas", nome: "Finestra vasistas", categoria: "finestra", ante: null, descrizione: "Finestra con apertura a vasistas (ribalta verso l'interno).", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 2.25, sort_order: 40 },
  { slug: "finestra-arco", nome: "Finestra ad arco", categoria: "finestra", ante: null, descrizione: "Finestra con parte superiore ad arco.", modalita_prezzo_base: "misura_libera", unit_of_measure: "pz", area_max_mq: null, sort_order: 50 },
  { slug: "velux-tetto", nome: "Finestra per tetto (Velux)", categoria: "finestra", ante: 1, descrizione: "Finestra inclinata per tetto, tipo Velux.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 2.0, sort_order: 60 },
  // FISSI (2)
  { slug: "fisso-nel-telaio", nome: "Fisso nel telaio", categoria: "fisso", ante: null, descrizione: "Vetrata fissa senza apertura (solo telaio + vetro).", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: null, sort_order: 70 },
  { slug: "fisso-nell-anta", nome: "Fisso nell'anta", categoria: "fisso", ante: null, descrizione: "Elemento fisso integrato in anta (parte non apribile).", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 2.25, sort_order: 80 },
  // PORTE BALCONE (4)
  { slug: "porta-balcone-1-anta", nome: "Porta balcone 1 anta", categoria: "porta_balcone", ante: 1, descrizione: "Portafinestra ad anta singola per balcone/terrazzo.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 3.0, sort_order: 90 },
  { slug: "porta-balcone-2-ante", nome: "Porta balcone 2 ante", categoria: "porta_balcone", ante: 2, descrizione: "Portafinestra a due ante per balcone/terrazzo.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 6.0, sort_order: 100 },
  { slug: "porta-balcone-3-ante", nome: "Porta balcone 3 ante", categoria: "porta_balcone", ante: 3, descrizione: "Portafinestra a tre ante.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 9.0, sort_order: 110 },
  { slug: "porta-balcone-serratura-passante", nome: "Porta balcone con serratura passante", categoria: "porta_balcone", ante: 2, descrizione: "Portafinestra con serratura passante (apertura da entrambi i lati).", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 6.0, sort_order: 120 },
  // PORTE INGRESSO (3)
  { slug: "porta-ingresso-1-anta", nome: "Porta d'ingresso 1 anta", categoria: "porta_ingresso", ante: 1, descrizione: "Porta d'ingresso singola con serratura di sicurezza.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 2.5, sort_order: 130 },
  { slug: "porta-ingresso-2-ante", nome: "Porta d'ingresso 2 ante", categoria: "porta_ingresso", ante: 2, descrizione: "Porta d'ingresso doppia.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 5.0, sort_order: 140 },
  { slug: "portoncino-blindato", nome: "Portoncino blindato", categoria: "porta_ingresso", ante: 1, descrizione: "Porta blindata di sicurezza con pannello coibentato.", modalita_prezzo_base: "pz", unit_of_measure: "pz", area_max_mq: 2.5, sort_order: 150 },
  // SCORREVOLI (3)
  { slug: "scorrevole-2-ante", nome: "Scorrevole 2 ante", categoria: "scorrevole", ante: 2, descrizione: "Finestra/porta scorrevole a 2 ante (tipo Smart Slide).", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 6.0, sort_order: 160 },
  { slug: "alzante-scorrevole", nome: "Alzante scorrevole", categoria: "scorrevole", ante: 2, descrizione: "Porta-finestra alzante scorrevole di grandi dimensioni.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 12.0, sort_order: 170 },
  { slug: "traslante-scorrevole", nome: "Traslante scorrevole", categoria: "scorrevole", ante: 2, descrizione: "Sistema scorrevole traslante con fissa/anta.", modalita_prezzo_base: "griglia", unit_of_measure: "pz", area_max_mq: 8.0, sort_order: 180 },
  // ACCESSORI (3)
  { slug: "persiana", nome: "Persiana", categoria: "finestra", ante: 1, descrizione: "Persiana esterna in alluminio/pvc/legno.", modalita_prezzo_base: "mq", unit_of_measure: "pz", area_max_mq: null, sort_order: 190 },
  { slug: "zanzariera", nome: "Zanzariera", categoria: "finestra", ante: null, descrizione: "Zanzariera a rullo o fissa.", modalita_prezzo_base: "mq", unit_of_measure: "pz", area_max_mq: null, sort_order: 200 },
  { slug: "tapparella", nome: "Tapparella (avvolgibile)", categoria: "finestra", ante: null, descrizione: "Tapparella avvolgibile motorizzata o manuale.", modalita_prezzo_base: "mq", unit_of_measure: "pz", area_max_mq: null, sort_order: 210 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function json(data: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function verifyAccess(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<void> {
  // 1. super_admin bypass
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isSuperAdmin = Array.isArray(roles) && roles.some((r) => r.role === "super_admin");
  if (isSuperAdmin) return;

  // 2. profiles.company_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.company_id === companyId) return;

  // 3. multi_company_access
  const { data: mca } = await supabase
    .from("multi_company_access")
    .select("id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (mca) return;

  // 4. active_impersonations (admin in impersonation)
  const { data: imp } = await supabase
    .from("active_impersonations")
    .select("id")
    .eq("admin_user_id", userId)
    .eq("target_company_id", companyId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (imp) return;

  throw new Error("Non autorizzato: accesso negato a questa azienda");
}

interface InstallResult {
  installed: number;
  skipped: number;
  errors: string[];
}

async function installCatalogo(
  supabase: SupabaseClient,
  companyId: string,
  filterSlugs: string[] | null,
): Promise<InstallResult> {
  const result: InstallResult = { installed: 0, skipped: 0, errors: [] };

  const catalog = filterSlugs && filterSlugs.length > 0
    ? CATALOGO_TIPOLOGIE.filter((t) => filterSlugs.includes(t.slug))
    : CATALOGO_TIPOLOGIE;

  if (catalog.length === 0) {
    return result;
  }

  // Famiglie già esistenti per la company (dedup per nome)
  const { data: existing, error: existErr } = await supabase
    .from("article_families")
    .select("nome")
    .eq("company_id", companyId)
    .eq("vertical", "serramentista");
  if (existErr) {
    throw new Error(`Errore lettura famiglie esistenti: ${existErr.message}`);
  }
  const existingNomi = new Set((existing ?? []).map((f: { nome: string }) => f.nome));

  // P1-5: bulk insert in una singola roundtrip invece di 20 sequenziali.
  // Prima l'installer chiamava .insert() dentro un for loop: con 20
  // tipologie e latency tipica Supabase ~150ms l'operazione durava 3-5s,
  // oltre 10s su cold start / rete lenta.
  const toInsert = catalog
    .filter((tip) => !existingNomi.has(tip.nome))
    .map((tip) => ({
      company_id: companyId,
      vertical: "serramentista",
      nome: tip.nome,
      descrizione: tip.descrizione,
      modalita_prezzo_base: tip.modalita_prezzo_base,
      unit_of_measure: tip.unit_of_measure,
      griglia_asse_x_label: "Larghezza (mm)",
      griglia_asse_y_label: "Altezza (mm)",
      prezzo_base_vendita: 0,
      prezzo_base_acquisto: 0,
      sort_order: tip.sort_order,
      attivo: true,
      custom_field_values: {
        catalogo_base: true,
        source: "catalogo_20_tipologie",
        slug: tip.slug,
        categoria: tip.categoria,
        ante: tip.ante,
        area_max_mq: tip.area_max_mq,
      },
    }));

  result.skipped = catalog.length - toInsert.length;

  if (toInsert.length === 0) {
    return result;
  }

  const { data: inserted, error: bulkErr } = await supabase
    .from("article_families")
    .insert(toInsert)
    .select("id, nome");

  if (bulkErr) {
    // Fallback diagnostico: se il bulk fallisce (es. un singolo record
    // viola un constraint), riproviamo uno per uno così il messaggio di
    // errore puntuale finisce in result.errors[] per la UI.
    for (const row of toInsert) {
      const { error: singleErr } = await supabase
        .from("article_families")
        .insert(row);
      if (singleErr) {
        result.errors.push(`${row.nome}: ${singleErr.message}`);
      } else {
        result.installed += 1;
      }
    }
  } else {
    result.installed = inserted?.length ?? toInsert.length;
  }

  return result;
}

// ── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json({ error: "Metodo non supportato" }, 405, req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: "Configurazione server incompleta" }, 500, req);
    }

    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Token di autenticazione mancante" }, 401, req);
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await anonClient.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return json({ error: "Token non valido" }, 401, req);
    }
    const userId = userData.user.id;

    // 2. Body parsing
    const body = (await req.json().catch(() => null)) as
      | { company_id?: unknown; slugs?: unknown }
      | null;
    if (!body) return json({ error: "Body JSON non valido" }, 400, req);

    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    if (!companyId) {
      return json({ error: "Parametro mancante: company_id" }, 400, req);
    }
    const slugs = Array.isArray(body.slugs)
      ? body.slugs.filter((s): s is string => typeof s === "string")
      : null;

    // 3. Service-role client (bypass RLS per installazione)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 4. Authorization
    await verifyAccess(admin, userId, companyId);

    // 5. Installazione
    const result = await installCatalogo(admin, companyId, slugs);

    return json({ ok: true, ...result }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    const status = message.startsWith("Non autorizzato") ? 403 : 500;
    return json({ error: message }, status, req);
  }
});
