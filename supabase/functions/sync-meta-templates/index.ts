// MP03 — sync-meta-templates (cron ogni 6h)
// Sincronizza i template Meta Business Manager per ogni numero WhatsApp
// attivo in wa_meta_templates (per dropdown UI campagne + invio broadcast).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

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
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET") ?? "";

  // Autorizzato se: (a) JWT bearer role=service_role, (b) x-cron-secret valido.
  // Supabase edge runtime fa verify_jwt=true di default; qui extra-check
  // che il role sia service_role (no anon/authenticated).
  const roleClaim = extractJwtRole(authHeader);
  const authorized =
    roleClaim === "service_role" ||
    (internalSecret.length > 0 && cronSecret === internalSecret);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: numbers } = await supabase
    .from("ai_whatsapp_numbers")
    .select("id, company_id, waba_id, access_token_encrypted")
    .is("deleted_at", null)
    .eq("stato", "active")
    .not("waba_id", "is", null);

  let totalSynced = 0;
  const errors: Array<Record<string, unknown>> = [];

  for (const n of numbers ?? []) {
    try {
      // Nota: access_token_encrypted in MP01 è stato stored plaintext temporaneamente
      // (whatsapp-connect salva accessToken diretto). In MP4 si migrerà a decrypt.
      const token = n.access_token_encrypted;
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
