import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdapter } from "../_shared/billingAdapter.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { invoice_id, provider: preferredProvider } = await req.json();

    // Recupera fattura
    const { data: invoice } = await supabase
      .from("invoices").select("*").eq("id", invoice_id).single();
    if (!invoice) return json({ error: "Invoice not found" }, 404);
    if (!invoice.external_id) return json({ error: "Invoice not synced yet" }, 400);

    // Recupera integrazione attiva
    let query = supabase.from("billing_integrations").select("*")
      .eq("company_id", invoice.company_id).eq("is_active", true);
    if (preferredProvider) query = query.eq("provider", preferredProvider);
    else query = query.eq("is_primary", true);

    let { data: integration } = await query.maybeSingle();
    if (!integration && !preferredProvider) {
      // Fix #9: Deterministic fallback — oldest integration first
      const { data: fallback } = await supabase
        .from("billing_integrations").select("*")
        .eq("company_id", invoice.company_id).eq("is_active", true)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      integration = fallback;
    }
    if (!integration) return json({ error: "No active integration found" }, 400);

    // Refresh token FIC se scaduto
    if (integration.provider === "fattureincloud" && integration.token_expires_at) {
      const exp = new Date(integration.token_expires_at as string);
      if (exp < new Date(Date.now() + 5 * 60 * 1000)) {
        const r = await fetch("https://api.fattureincloud.it/v2/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: Deno.env.get("FIC_CLIENT_ID") || "",
            client_secret: Deno.env.get("FIC_CLIENT_SECRET") || "",
            refresh_token: integration.refresh_token as string,
          }),
        });
        if (r.ok) {
          const td = await r.json();
          integration.access_token = td.access_token;
          await supabase.from("billing_integrations").update({
            access_token: td.access_token,
            token_expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString(),
          }).eq("id", integration.id);
        }
      }
    }

    let adapter;
    try {
      adapter = createAdapter(integration as { provider: string; access_token?: string | null; api_key?: string | null; company_external_id?: string | null });
    } catch (e) {
      return json({ error: String(e) }, 400);
    }

    // Solo fetch_status — verifica stato fattura importata
    const result = await adapter.fetchStatus(invoice.external_id);

    await supabase.from("billing_sync_log").insert({
      company_id: invoice.company_id,
      invoice_id: invoice.id,
      provider: integration.provider as string,
      direction: "pull",
      action: "fetch_status",
      status: result.success ? "success" : "error",
      response_payload: result as unknown as Record<string, unknown>,
      error_message: result.error || null,
    });

    if (result.success) {
      await supabase.from("invoices").update({
        external_status: result.externalStatus,
        status: result.internalStatus,
        external_sdi_id: result.sdiId,
        last_synced_at: new Date().toISOString(),
      }).eq("id", invoice.id);
    }

    return json(result);
  } catch (e) {
    console.error("billing-sync error:", e);
    return json({ error: String(e) }, 500);
  }
});
