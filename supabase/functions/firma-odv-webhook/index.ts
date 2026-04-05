import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { token, firma_data_base64, firmato_da } = await req.json();

    if (!token) return errorResponse("token richiesto");
    if (!firma_data_base64) return errorResponse("firma_data_base64 richiesta");

    // Trova OdV tramite firma_token
    const { data: odv, error: odvErr } = await supabaseAdmin
      .from("ordini_variazione")
      .select("id, order_id, impatto_economico, numero_odv, company_id, status")
      .eq("firma_token", token)
      .maybeSingle();

    if (odvErr || !odv) return errorResponse("OdV non trovato o token non valido", 404);
    if (odv.status !== "in_attesa") return errorResponse("OdV già processato", 409);

    // Aggiorna OdV: firma + approvato
    const { error: updateErr } = await supabaseAdmin
      .from("ordini_variazione")
      .update({
        firma_cliente: firma_data_base64,
        firmato_da: firmato_da || null,
        firmato_il: new Date().toISOString(),
        status: "approvata",
      })
      .eq("firma_token", token)
      .eq("status", "in_attesa");

    if (updateErr) throw new Error(updateErr.message);

    // Aggiorna importo totale ordine se impatto_economico > 0
    if (odv.impatto_economico > 0) {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("total_amount")
        .eq("id", odv.order_id)
        .single();

      if (order) {
        const nuovoTotale = (order.total_amount ?? 0) + odv.impatto_economico;
        await supabaseAdmin
          .from("orders")
          .update({ total_amount: nuovoTotale })
          .eq("id", odv.order_id);
      }
    }

    // Crea activity log
    await supabaseAdmin
      .from("company_activity_log")
      .insert({
        company_id: odv.company_id,
        action_type: "odv_signed",
        description: `OdV #${odv.numero_odv} firmato da ${firmato_da || "cliente"}`,
        metadata: { odv_id: odv.id, order_id: odv.order_id },
      })
      .then(() => null)
      .catch(() => null); // non bloccare se activity log fallisce

    return jsonResponse({ success: true, odv_id: odv.id });
  } catch (err: any) {
    console.error("[firma-odv-webhook]", err);
    return errorResponse(err.message || "Errore interno", 500);
  }
});
