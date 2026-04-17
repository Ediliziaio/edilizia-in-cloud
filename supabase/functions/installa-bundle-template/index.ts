// Preventivatore Verticalizzato Serramentisti — FASE 10.3
//
// Edge Function: installa-bundle-template
//
// Input: { company_id: string, vertical: string }
// Output: { bundles_creati: number, voci_create: number, saltati: string[] }
//
// Installa 5 bundle template pre-configurati per il vertical "serramentista":
//   1. Bilocale standard — sostituzione 3 finestre + 1 portafinestra
//   2. Trilocale standard — sostituzione 5 finestre + 1 portafinestra
//   3. Bagno standard — 1 finestra piccola + zanzariera
//   4. Villa 8 vani — configurazione premium
//   5. Soglia balcone — porta finestra singola
//
// Idempotente: se un bundle con lo stesso nome esiste già per la company
// viene saltato. Le voci fanno lookup delle famiglie per `nome` (se assente,
// la voce viene omessa e il bundle resta creato senza quella voce).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

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
  const isSuperAdmin = Array.isArray(roles) && roles.some((r) => r.role === "super_admin");
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

// ── Template definitions ──────────────────────────────────────────────────────

interface VoceTemplate {
  family_nome: string;
  vano_label?: string;
  larghezza_mm?: number;
  altezza_mm?: number;
  quantita?: number;
  axis_selections?: Record<string, string>;
}

interface BundleTemplate {
  nome: string;
  descrizione: string;
  tipo_lavoro: "sostituzione" | "nuova" | "ristrutturazione";
  sconto_bundle_pct?: number;
  voci: VoceTemplate[];
}

const BUNDLE_TEMPLATES: BundleTemplate[] = [
  {
    nome: "Bilocale standard — sostituzione 3 finestre + 1 portafinestra",
    descrizione: "Pacchetto tipico per appartamento bilocale: 3 finestre standard + 1 portafinestra balcone.",
    tipo_lavoro: "sostituzione",
    sconto_bundle_pct: 3,
    voci: [
      { family_nome: "Finestra 1 anta", vano_label: "Camera", larghezza_mm: 800, altezza_mm: 1400, quantita: 1 },
      { family_nome: "Finestra 2 ante", vano_label: "Soggiorno", larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 },
      { family_nome: "Finestra 1 anta", vano_label: "Bagno", larghezza_mm: 600, altezza_mm: 1000, quantita: 1 },
      { family_nome: "Portafinestra 2 ante", vano_label: "Balcone", larghezza_mm: 1400, altezza_mm: 2300, quantita: 1 },
    ],
  },
  {
    nome: "Trilocale standard — sostituzione 5 finestre + 1 portafinestra",
    descrizione: "Pacchetto per trilocale: finestre in camera, cucina, bagno + portafinestra balcone.",
    tipo_lavoro: "sostituzione",
    sconto_bundle_pct: 5,
    voci: [
      { family_nome: "Finestra 1 anta", vano_label: "Camera 1", larghezza_mm: 800, altezza_mm: 1400, quantita: 1 },
      { family_nome: "Finestra 1 anta", vano_label: "Camera 2", larghezza_mm: 800, altezza_mm: 1400, quantita: 1 },
      { family_nome: "Finestra 2 ante", vano_label: "Soggiorno", larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 },
      { family_nome: "Finestra 2 ante", vano_label: "Cucina", larghezza_mm: 1000, altezza_mm: 1300, quantita: 1 },
      { family_nome: "Finestra 1 anta", vano_label: "Bagno", larghezza_mm: 600, altezza_mm: 1000, quantita: 1 },
      { family_nome: "Portafinestra 2 ante", vano_label: "Balcone", larghezza_mm: 1400, altezza_mm: 2300, quantita: 1 },
    ],
  },
  {
    nome: "Bagno standard — 1 finestra piccola + zanzariera",
    descrizione: "Pacchetto minimal per bagno: finestra piccola con zanzariera incorporata.",
    tipo_lavoro: "sostituzione",
    voci: [
      { family_nome: "Finestra 1 anta", vano_label: "Bagno", larghezza_mm: 600, altezza_mm: 1000, quantita: 1 },
      { family_nome: "Zanzariera", vano_label: "Bagno", larghezza_mm: 600, altezza_mm: 1000, quantita: 1 },
    ],
  },
  {
    nome: "Villa 8 vani — configurazione premium",
    descrizione: "Villa unifamiliare: 6 finestre + 2 portefinestre con persiane blindate e triplo vetro.",
    tipo_lavoro: "nuova",
    sconto_bundle_pct: 8,
    voci: [
      { family_nome: "Finestra 2 ante", vano_label: "Camera padronale", larghezza_mm: 1400, altezza_mm: 1500, quantita: 1 },
      { family_nome: "Finestra 2 ante", vano_label: "Camera figli 1", larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 },
      { family_nome: "Finestra 2 ante", vano_label: "Camera figli 2", larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 },
      { family_nome: "Finestra 2 ante", vano_label: "Studio", larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 },
      { family_nome: "Finestra 1 anta", vano_label: "Bagno ospiti", larghezza_mm: 600, altezza_mm: 1000, quantita: 1 },
      { family_nome: "Finestra 1 anta", vano_label: "Bagno padronale", larghezza_mm: 800, altezza_mm: 1200, quantita: 1 },
      { family_nome: "Portafinestra 2 ante", vano_label: "Salotto", larghezza_mm: 1800, altezza_mm: 2400, quantita: 1 },
      { family_nome: "Portafinestra 2 ante", vano_label: "Cucina", larghezza_mm: 1400, altezza_mm: 2300, quantita: 1 },
    ],
  },
  {
    nome: "Soglia balcone — portafinestra singola",
    descrizione: "Sostituzione veloce di una singola portafinestra balcone.",
    tipo_lavoro: "sostituzione",
    voci: [
      { family_nome: "Portafinestra 2 ante", vano_label: "Balcone", larghezza_mm: 1400, altezza_mm: 2300, quantita: 1 },
    ],
  },
];

// ── Installation ──────────────────────────────────────────────────────────────

interface InstallResult {
  bundles_creati: number;
  voci_create: number;
  saltati: string[]; // nomi bundle esistenti o voci non matchate
}

async function installBundles(
  supabase: SupabaseClient,
  companyId: string,
  vertical: string,
): Promise<InstallResult> {
  const result: InstallResult = { bundles_creati: 0, voci_create: 0, saltati: [] };

  // 1) Fetch famiglie esistenti (nome → id) per lookup voci
  const { data: fams, error: famErr } = await supabase
    .from("article_families")
    .select("id, nome")
    .eq("company_id", companyId)
    .eq("attivo", true);
  if (famErr) throw new Error(`Errore caricamento famiglie: ${famErr.message}`);

  const familyByName = new Map<string, string>(
    (fams ?? []).map((f: { id: string; nome: string }) => [f.nome, f.id]),
  );

  // 2) Bundle già presenti per dedupe
  const { data: existingBundles } = await supabase
    .from("bundle_prodotti")
    .select("nome")
    .eq("company_id", companyId);
  const existingNomi = new Set<string>(
    (existingBundles ?? []).map((b: { nome: string }) => b.nome),
  );

  // 3) Per ogni template, insert bundle_prodotti + bundle_voci
  for (const tpl of BUNDLE_TEMPLATES) {
    if (existingNomi.has(tpl.nome)) {
      result.saltati.push(`bundle-esistente:${tpl.nome}`);
      continue;
    }

    const { data: newBundle, error: insBErr } = await supabase
      .from("bundle_prodotti")
      .insert({
        company_id: companyId,
        nome: tpl.nome,
        descrizione: tpl.descrizione,
        sconto_bundle_pct: tpl.sconto_bundle_pct ?? 0,
        attivo: true,
        vertical,
        tipo_lavoro: tpl.tipo_lavoro,
        is_template: true,
      })
      .select("id")
      .single();
    if (insBErr) {
      throw new Error(`Errore insert bundle '${tpl.nome}': ${insBErr.message}`);
    }
    result.bundles_creati += 1;

    // Map voci → righe bundle_voci (salta quelle senza famiglia matchata)
    const voceRows: Array<Record<string, unknown>> = [];
    let sortOrder = 0;
    for (const v of tpl.voci) {
      const familyId = familyByName.get(v.family_nome);
      if (!familyId) {
        result.saltati.push(`voce-no-famiglia:${tpl.nome} → ${v.family_nome}`);
        continue;
      }
      voceRows.push({
        bundle_id: newBundle.id,
        family_id: familyId,
        prodotto_id: null,
        tariffa_id: null,
        axis_selections: v.axis_selections ?? {},
        larghezza_mm_default: v.larghezza_mm ?? null,
        altezza_mm_default: v.altezza_mm ?? null,
        vano_label: v.vano_label ?? null,
        quantita: v.quantita ?? 1,
        sort_order: sortOrder++,
      });
    }

    if (voceRows.length > 0) {
      const { error: insVErr } = await supabase.from("bundle_voci").insert(voceRows);
      if (insVErr) {
        throw new Error(`Errore insert voci bundle '${tpl.nome}': ${insVErr.message}`);
      }
      result.voci_create += voceRows.length;
    }
  }

  return result;
}

// ── Handler ──────────────────────────────────────────────────────────────────

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
    if (!authHeader) return json({ error: "Token di autenticazione mancante" }, 401, req);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await anonClient.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: "Token non valido" }, 401, req);
    const userId = userData.user.id;

    const body = (await req.json().catch(() => null)) as
      | { company_id?: unknown; vertical?: unknown }
      | null;
    if (!body) return json({ error: "Body JSON non valido" }, 400, req);

    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    const vertical = typeof body.vertical === "string" ? body.vertical : "serramentista";
    if (!companyId) {
      return json({ error: "Parametro mancante: company_id" }, 400, req);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await verifyAccess(admin, userId, companyId);
    const result = await installBundles(admin, companyId, vertical);

    return json({ ok: true, ...result }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    const status = message.startsWith("Non autorizzato") ? 403 : 500;
    return json({ ok: false, error: message }, status, req);
  }
});
