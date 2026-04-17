// Preventivatore Verticalizzato Serramentisti — FASE 6.2
//
// Edge Function: installa-tariffe-vertical
//
// Input: { company_id: string, vertical: string }
// Output: { ok: true, tariffe_create: number, tariffe_skippate: number }
//
// Installa le tariffe-template del vertical scelto in
// public.tariffe_aziendali. Prezzi inizializzati a 0 — l'azienda li
// compila dopo. Idempotente: skip se esiste già una tariffa con stesso
// (company_id, nome). Struttura speculare a `installa-template-vertical`.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface TariffaSeed {
  nome: string;
  tipo: string; // matches extended tariffe_aziendali_tipo_check
  unita_fatturazione: string; // matches tariffe_aziendali_unita_fatturazione_check
  is_default?: boolean;
  descrizione?: string;
}

/** Catalogo seed tariffe per vertical. Prezzi e costo_interno lasciati a 0. */
const SEED_TARIFFE: Record<string, TariffaSeed[]> = {
  serramentista: [
    { nome: "Posa serramento standard", tipo: "posa", unita_fatturazione: "pz", is_default: true },
    { nome: "Posa serramento grande (>2mq)", tipo: "posa", unita_fatturazione: "pz" },
    { nome: "Posa persiana", tipo: "posa", unita_fatturazione: "pz" },
    { nome: "Posa zanzariera", tipo: "posa", unita_fatturazione: "pz" },
    { nome: "Smontaggio serramento esistente", tipo: "smaltimento", unita_fatturazione: "pz" },
    { nome: "Smaltimento infisso vecchio", tipo: "smaltimento", unita_fatturazione: "pz" },
    { nome: "Trasporto materiali", tipo: "trasporto", unita_fatturazione: "a_corpo" },
    { nome: "Sovrapprezzo km aggiuntivi", tipo: "trasporto", unita_fatturazione: "km" },
    { nome: "Tiro al piano", tipo: "tiro_piano", unita_fatturazione: "piano" },
    { nome: "Ponteggio piccolo", tipo: "ponteggio", unita_fatturazione: "a_corpo" },
    { nome: "Lattoneria complementare", tipo: "lattoneria", unita_fatturazione: "ml" },
    { nome: "Sigillatura silicone", tipo: "sigillatura", unita_fatturazione: "ml" },
    { nome: "Manodopera posatore (giornata)", tipo: "manodopera", unita_fatturazione: "gg" },
    { nome: "Manodopera posatore (ora)", tipo: "manodopera", unita_fatturazione: "h" },
    { nome: "Contorno coprifilo", tipo: "contorno", unita_fatturazione: "ml" },
    { nome: "Falso telaio / controtelaio", tipo: "falso_telaio", unita_fatturazione: "pz" },
    { nome: "Sopralluogo tecnico", tipo: "sopralluogo", unita_fatturazione: "a_corpo" },
  ],
};

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
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isSuperAdmin =
    Array.isArray(roles) && roles.some((r) => r.role === "super_admin");
  if (isSuperAdmin) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.company_id === companyId) return;

  const { data: mca } = await supabase
    .from("multi_company_access")
    .select("id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (mca) return;

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

async function installTariffe(
  supabase: SupabaseClient,
  companyId: string,
  vertical: string,
): Promise<{ tariffe_create: number; tariffe_skippate: number }> {
  const seed = SEED_TARIFFE[vertical];
  if (!seed) {
    throw new Error(`Nessun seed tariffe configurato per vertical '${vertical}'`);
  }

  // Tariffe già esistenti per questa company (dedup per nome)
  const { data: existing, error: existErr } = await supabase
    .from("tariffe_aziendali")
    .select("id, nome")
    .eq("company_id", companyId);
  if (existErr) {
    throw new Error(`Errore caricamento tariffe esistenti: ${existErr.message}`);
  }
  const existingNomi = new Set<string>((existing ?? []).map((t) => t.nome));

  let create = 0;
  let skip = 0;

  for (let i = 0; i < seed.length; i++) {
    const t = seed[i];
    if (existingNomi.has(t.nome)) {
      skip += 1;
      continue;
    }
    const { error: insErr } = await supabase.from("tariffe_aziendali").insert({
      company_id: companyId,
      tipo: t.tipo,
      nome: t.nome,
      descrizione: t.descrizione ?? null,
      // Backward-compat: la vecchia colonna `unita` è NOT NULL con default 'pz'.
      // Impostiamo unita al valore più vicino tra i legacy ammessi (pz/mq/ml/h/piano/km/mc/fisso),
      // mentre la source-of-truth resta unita_fatturazione (FASE 6).
      unita: legacyUnitaFrom(t.unita_fatturazione),
      unita_fatturazione: t.unita_fatturazione,
      prezzo_costo: 0,
      prezzo_vendita: 0,
      costo_interno: 0,
      vertical_associato: vertical,
      attiva: true,
      attivo: true,
      sort_order: i * 10,
    });
    if (insErr) {
      throw new Error(`Errore insert tariffa '${t.nome}': ${insErr.message}`);
    }
    create += 1;
  }

  return { tariffe_create: create, tariffe_skippate: skip };
}

/** Mappa unita_fatturazione nuova → legacy `unita` CHECK compatibile. */
function legacyUnitaFrom(u: string): string {
  switch (u) {
    case "pz":
    case "mq":
    case "ml":
    case "mc":
    case "h":
    case "km":
    case "piano":
      return u;
    case "a_corpo":
      return "fisso";
    case "gg":
      return "h"; // approssimazione: il legacy non ha gg
    case "kg":
      return "pz"; // approssimazione
    default:
      return "pz";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json({ error: "Metodo non supportato" }, 405, req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const body = (await req.json().catch(() => null)) as
      | { company_id?: unknown; vertical?: unknown }
      | null;
    if (!body) return json({ error: "Body JSON non valido" }, 400, req);

    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    const vertical = typeof body.vertical === "string" ? body.vertical : "";
    if (!companyId || !vertical) {
      return json({ error: "Parametri mancanti: company_id, vertical" }, 400, req);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await verifyAccess(admin, userId, companyId);
    const counts = await installTariffe(admin, companyId, vertical);

    return json({ ok: true, ...counts }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    const status = message.startsWith("Non autorizzato") ? 403 : 500;
    return json({ error: message }, status, req);
  }
});
