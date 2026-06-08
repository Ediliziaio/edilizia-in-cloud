// MP03 — sync-meta-templates (cron ogni 6h)
// Sincronizza i template Meta Business Manager per ogni numero WhatsApp
// attivo in wa_meta_templates (per dropdown UI campagne + invio broadcast).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";

const META_API_VERSION = "v22.0";

function extractJwtRole(authHeader: string): string | null {
  if (!authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.substring(7);
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  // Accetta entrambi i nomi header usati nel progetto (x-cron-secret diretto e
  // x-internal-cron-secret inviato da public.silvio_invoke_edge).
  const cronSecret =
    req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-cron-secret") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET") ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Due modi di autorizzazione:
  //  (a) CRON / service_role → sincronizza TUTTI i numeri attivi.
  //  (b) Utente admin loggato (UI "Sincronizza da Meta") → sincronizza SOLO la
  //      propria azienda (e opzionalmente un singolo numero/WABA via
  //      wa_number_id, così non si mischiano template tra WABA diverse).
  const roleClaim = extractJwtRole(authHeader);
  const isServiceRole = roleClaim === "service_role";
  const isCron = internalSecret.length > 0 && cronSecret === internalSecret;

  let companyFilter: string | null = null;
  let numberFilter: string | null = null;

  if (!isServiceRole && !isCron) {
    // Percorso utente: valida il JWT e i permessi admin sull'azienda richiesta.
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.substring(7);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { company_id?: string; wa_number_id?: string } = {};
    try { body = await req.json(); } catch { /* body opzionale */ }
    if (!body.company_id) {
      return new Response(JSON.stringify({ error: "company_id richiesto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      await assertMetaCompanyAdminAccess(supabase, user.id, body.company_id);
    } catch (e) {
      return new Response(JSON.stringify({ error: getErrorMessage(e) }), {
        status: getErrorStatus(e),
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    companyFilter = body.company_id;
    numberFilter = body.wa_number_id ?? null;
  }

  let numbersQuery = supabase
    .from("ai_whatsapp_numbers")
    .select("id, company_id, waba_id, access_token_encrypted")
    .is("deleted_at", null)
    .eq("stato", "active")
    .not("waba_id", "is", null);
  if (companyFilter) numbersQuery = numbersQuery.eq("company_id", companyFilter);
  if (numberFilter) numbersQuery = numbersQuery.eq("id", numberFilter);

  const { data: numbers } = await numbersQuery;

  let totalSynced = 0;
  const errors: Array<Record<string, unknown>> = [];

  for (const n of numbers ?? []) {
    try {
      const token = await decryptMaybeEncrypted(n.access_token_encrypted, getEncryptionKey());
      if (!token) continue;

      const url = `https://graph.facebook.com/${META_API_VERSION}/${n.waba_id}/message_templates?fields=name,language,status,category,components&limit=100`;
      const resp = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (!resp.ok) {
        errors.push({
          wa_number_id: n.id,
          status: resp.status,
          error: (await resp.text()).substring(0, 200),
        });
        continue;
      }

      const json = await resp.json() as { data?: Array<{
        name: string; language: string; status: string; category: string;
        components?: Array<{ type: string; text?: string }>;
      }>; };

      for (const tpl of json.data ?? []) {
        const bodyComp = (tpl.components ?? []).find((c) => c.type === "BODY");
        const bodyText = bodyComp?.text ?? "";
        const varMatches = Array.from(bodyText.matchAll(/\{\{(\d+)\}\}/g));
        const variablesCount = new Set(varMatches.map((m) => m[1])).size;

        await supabase.from("wa_meta_templates").upsert({
          company_id: n.company_id,
          wa_number_id: n.id,
          template_name: tpl.name,
          template_language: tpl.language,
          category: tpl.category,
          status: tpl.status,
          components_json: tpl.components,
          variables_count: variablesCount,
          synced_at: new Date().toISOString(),
        }, { onConflict: "wa_number_id,template_name,template_language" });

        totalSynced++;
      }
    } catch (e) {
      errors.push({ wa_number_id: n.id, error: String(e).substring(0, 200) });
    }
  }

  return new Response(
    JSON.stringify({
      synced: totalSynced,
      errors: errors.length,
      error_details: errors.slice(0, 10),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
