import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdapter, mapInvoiceToProviderData } from "../_shared/billingAdapter.ts";

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
    const { invoice_id, action, provider: preferredProvider } = await req.json();

    // Recupera fattura con righe
    const { data: invoice } = await supabase
      .from("invoices").select("*, invoice_lines(*)").eq("id", invoice_id).single();
    if (!invoice) return json({ error: "Invoice not found" }, 404);

    // Recupera integrazione: prima quella preferita/primaria, poi qualsiasi attiva, poi standalone
    let query = supabase.from("billing_integrations").select("*")
      .eq("company_id", invoice.company_id).eq("is_active", true);
    if (preferredProvider) query = query.eq("provider", preferredProvider);
    else query = query.eq("is_primary", true);

    let { data: integration } = await query.maybeSingle();
    if (!integration && !preferredProvider) {
      const { data: fallback } = await supabase
        .from("billing_integrations").select("*")
        .eq("company_id", invoice.company_id).eq("is_active", true).limit(1).maybeSingle();
      integration = fallback;
    }
    const activeIntegration = integration || { provider: "standalone" } as Record<string, unknown>;

    // Refresh token FIC se scaduto
    if (activeIntegration.provider === "fattureincloud" && activeIntegration.token_expires_at) {
      const exp = new Date(activeIntegration.token_expires_at as string);
      if (exp < new Date(Date.now() + 5 * 60 * 1000)) {
        const r = await fetch("https://api.fattureincloud.it/v2/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: Deno.env.get("FIC_CLIENT_ID") || "",
            client_secret: Deno.env.get("FIC_CLIENT_SECRET") || "",
            refresh_token: activeIntegration.refresh_token as string,
          }),
        });
        if (r.ok) {
          const td = await r.json();
          activeIntegration.access_token = td.access_token;
          await supabase.from("billing_integrations").update({
            access_token: td.access_token,
            token_expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString(),
          }).eq("id", activeIntegration.id);
        }
      }
    }

    let adapter;
    try { adapter = createAdapter(activeIntegration as { provider: string; access_token?: string | null; api_key?: string | null; company_external_id?: string | null }); }
    catch (e) { return json({ error: String(e) }, 400); }

    const logSync = async (act: string, status: string, response: unknown, err?: string) => {
      await supabase.from("billing_sync_log").insert({
        company_id: invoice.company_id,
        invoice_id: invoice.id,
        provider: activeIntegration.provider as string,
        direction: "push",
        action: act,
        status,
        response_payload: response as Record<string, unknown>,
        error_message: err || null,
      });
    };

    // ── push_to_provider
    if (action === "push_to_provider") {
      const result = await adapter.pushInvoice(mapInvoiceToProviderData(invoice));
      await logSync("create", result.success ? "success" : "error", result.rawResponse, result.error);

      if (!result.success) return json({ error: result.error }, 400);

      await supabase.from("invoices").update({
        external_id: result.externalId,
        external_provider: activeIntegration.provider as string,
        external_sync_at: new Date().toISOString(),
        external_status: result.externalStatus,
        status: "sent",
      }).eq("id", invoice.id);

      return json({ success: true, external_id: result.externalId });
    }

    // ── fetch_status
    if (action === "fetch_status") {
      if (!invoice.external_id) return json({ error: "Invoice not synced yet" }, 400);
      const result = await adapter.fetchStatus(invoice.external_id);
      if (result.success) {
        await supabase.from("invoices").update({
          external_status: result.externalStatus,
          status: result.internalStatus,
          external_sdi_id: result.sdiId,
        }).eq("id", invoice.id);
      }
      return json(result);
    }

    // ── cancel
    if (action === "cancel") {
      const result = await adapter.cancelInvoice(invoice.external_id || "");
      await logSync("cancel", result.success ? "success" : "error", null, result.error);
      if (result.success) {
        await supabase.from("invoices").update({ status: "cancelled" }).eq("id", invoice.id);
      }
      return json(result);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("billing-sync error:", e);
    return json({ error: String(e) }, 500);
  }
});
