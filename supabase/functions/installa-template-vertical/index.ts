// Preventivatore Verticalizzato Serramentisti — FASE 3.3
//
// Edge Function: installa-template-vertical
//
// Input: { company_id: string, vertical: string }
// Output: { categorie_create, famiglie_create, assi_create, valori_create }
//
// Logica:
//  1. Verifica auth + permessi (utente appartiene alla company o è super_admin).
//  2. Carica vertical_category_templates del vertical → upsert in listino_categorie
//     (deduplica per (company_id, nome)).
//  3. Carica vertical_family_templates del vertical → per ogni template non già
//     presente in article_families della company, insert famiglia + espansione
//     di assi_default → article_family_axes + article_family_axis_values
//     (maggiorazione_tipo='none', valore=0).
//  4. Idempotente: chiamata multipla non duplica. I conteggi rispecchiano solo
//     ciò che è stato effettivamente creato in questa invocazione.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

// ── Tipi narrow sul payload JSONB assi_default ────────────────────────────────

interface AxisValueTemplate {
  valore: string;
  label: string;
  descrizione?: string;
  is_default?: boolean;
}

interface AxisTemplate {
  codice: string;
  nome: string;
  descrizione?: string;
  tipo: "discrete" | "boolean";
  obbligatorio?: boolean;
  valori: AxisValueTemplate[];
}

/** Type guard: narrowing da unknown a AxisTemplate[]. */
function isAxisTemplateArray(x: unknown): x is AxisTemplate[] {
  if (!Array.isArray(x)) return false;
  return x.every((it) => {
    if (!it || typeof it !== "object") return false;
    const o = it as Record<string, unknown>;
    if (typeof o.codice !== "string" || typeof o.nome !== "string") return false;
    if (o.tipo !== "discrete" && o.tipo !== "boolean") return false;
    if (!Array.isArray(o.valori)) return false;
    return (o.valori as unknown[]).every((v) => {
      if (!v || typeof v !== "object") return false;
      const vo = v as Record<string, unknown>;
      return typeof vo.valore === "string" && typeof vo.label === "string";
    });
  });
}

function json(data: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// ── Permessi ───────────────────────────────────────────────────────────────────

async function verifyAccess(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<void> {
  // 1. super_admin (bypass)
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

  // 4. active_impersonations (super admin impersonating)
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

// ── Installazione ──────────────────────────────────────────────────────────────

interface InstallCounts {
  categorie_create: number;
  famiglie_create: number;
  assi_create: number;
  valori_create: number;
}

async function installTemplates(
  supabase: SupabaseClient,
  companyId: string,
  vertical: string,
): Promise<InstallCounts> {
  const counts: InstallCounts = {
    categorie_create: 0,
    famiglie_create: 0,
    assi_create: 0,
    valori_create: 0,
  };

  // ── 1. CATEGORIE ────────────────────────────────────────────────────────────
  const { data: catTemplates, error: catErr } = await supabase
    .from("vertical_category_templates")
    .select("id, nome, icona, margine_target_percentuale, sort_order")
    .eq("vertical", vertical)
    .eq("attivo", true);
  if (catErr) throw new Error(`Errore caricamento categorie template: ${catErr.message}`);

  // Categorie già esistenti in listino_categorie per questa company
  const { data: existingCats } = await supabase
    .from("listino_categorie")
    .select("id, nome")
    .eq("company_id", companyId);

  const existingCatByNome = new Map<string, string>(
    (existingCats ?? []).map((c) => [c.nome, c.id]),
  );

  // Mappa template_categoria_id → listino_categoria_id (per FK nelle famiglie)
  const templateToCompanyCatId = new Map<string, string>();

  for (const tc of catTemplates ?? []) {
    const existingId = existingCatByNome.get(tc.nome);
    if (existingId) {
      templateToCompanyCatId.set(tc.id, existingId);
      continue;
    }
    const { data: inserted, error: insErr } = await supabase
      .from("listino_categorie")
      .insert({
        company_id: companyId,
        nome: tc.nome,
        icona: tc.icona ?? "Package",
        margine_target_percentuale: tc.margine_target_percentuale ?? 25,
        sort_order: tc.sort_order ?? 0,
      })
      .select("id")
      .single();
    if (insErr) {
      throw new Error(`Errore insert categoria '${tc.nome}': ${insErr.message}`);
    }
    templateToCompanyCatId.set(tc.id, inserted.id);
    counts.categorie_create += 1;
  }

  // ── 2. FAMIGLIE ─────────────────────────────────────────────────────────────
  const { data: famTemplates, error: famErr } = await supabase
    .from("vertical_family_templates")
    .select(
      "id, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order",
    )
    .eq("vertical", vertical)
    .eq("attivo", true);
  if (famErr) throw new Error(`Errore caricamento famiglie template: ${famErr.message}`);

  // Famiglie già esistenti per questa company (dedup per nome)
  const { data: existingFams } = await supabase
    .from("article_families")
    .select("id, nome")
    .eq("company_id", companyId);
  const existingFamByNome = new Set<string>((existingFams ?? []).map((f) => f.nome));

  for (const tf of famTemplates ?? []) {
    if (existingFamByNome.has(tf.nome)) continue;

    const categoriaId = tf.categoria_template_id
      ? templateToCompanyCatId.get(tf.categoria_template_id) ?? null
      : null;

    const { data: newFam, error: famInsErr } = await supabase
      .from("article_families")
      .insert({
        company_id: companyId,
        vertical,
        categoria_id: categoriaId,
        nome: tf.nome,
        descrizione: tf.descrizione,
        modalita_prezzo_base: tf.modalita_prezzo_base,
        unit_of_measure: tf.unit_of_measure ?? "pz",
        griglia_asse_x_label: tf.griglia_asse_x_label ?? "Larghezza (mm)",
        griglia_asse_y_label: tf.griglia_asse_y_label ?? "Altezza (mm)",
        sort_order: tf.sort_order ?? 0,
        // prezzi esplicitamente a 0: l'azienda li compilerà
        prezzo_base_vendita: 0,
        prezzo_base_acquisto: 0,
      })
      .select("id")
      .single();
    if (famInsErr) {
      throw new Error(`Errore insert famiglia '${tf.nome}': ${famInsErr.message}`);
    }
    counts.famiglie_create += 1;

    // Espansione assi_default → article_family_axes + article_family_axis_values
    const assiRaw: unknown = tf.assi_default ?? [];
    if (!isAxisTemplateArray(assiRaw)) {
      // Template malformato → salta gli assi, ma famiglia resta creata
      continue;
    }

    for (let axIdx = 0; axIdx < assiRaw.length; axIdx++) {
      const ax = assiRaw[axIdx];
      const { data: newAx, error: axErr } = await supabase
        .from("article_family_axes")
        .insert({
          family_id: newFam.id,
          company_id: companyId,
          nome: ax.nome,
          codice: ax.codice,
          descrizione: ax.descrizione ?? null,
          tipo: ax.tipo,
          obbligatorio: ax.obbligatorio ?? true,
          sort_order: axIdx * 10,
        })
        .select("id")
        .single();
      if (axErr) {
        throw new Error(
          `Errore insert asse '${ax.codice}' famiglia '${tf.nome}': ${axErr.message}`,
        );
      }
      counts.assi_create += 1;

      // Valori asse
      const valoriRows = ax.valori.map((v, vIdx) => ({
        axis_id: newAx.id,
        company_id: companyId,
        valore: v.valore,
        label: v.label,
        descrizione: v.descrizione ?? null,
        is_default: Boolean(v.is_default),
        maggiorazione_tipo: "none" as const,
        maggiorazione_valore: 0,
        maggiorazione_acquisto: 0,
        sort_order: vIdx * 10,
        attivo: true,
      }));

      if (valoriRows.length > 0) {
        const { error: valErr } = await supabase
          .from("article_family_axis_values")
          .insert(valoriRows);
        if (valErr) {
          throw new Error(
            `Errore insert valori asse '${ax.codice}' famiglia '${tf.nome}': ${valErr.message}`,
          );
        }
        counts.valori_create += valoriRows.length;
      }
    }
  }

  return counts;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Autenticazione: l'utente deve presentare un JWT valido
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

    // 2. Parsing body
    const body = await req.json().catch(() => null) as
      | { company_id?: unknown; vertical?: unknown }
      | null;
    if (!body) return json({ error: "Body JSON non valido" }, 400, req);

    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    const vertical = typeof body.vertical === "string" ? body.vertical : "";
    if (!companyId || !vertical) {
      return json({ error: "Parametri mancanti: company_id, vertical" }, 400, req);
    }

    // 3. Client service-role per bypassare RLS durante l'installazione
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 4. Autorizzazione
    await verifyAccess(admin, userId, companyId);

    // 5. Installazione
    const counts = await installTemplates(admin, companyId, vertical);

    return json({ ok: true, ...counts }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    const status = message.startsWith("Non autorizzato") ? 403 : 500;
    return json({ error: message }, status, req);
  }
});
