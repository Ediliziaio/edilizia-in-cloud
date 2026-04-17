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

    // Aggiorna OdV: firma + approvato — atomico via guard status=in_attesa.
    // FIX: selezioniamo l'id per verificare che l'UPDATE abbia effettivamente
    // cambiato una riga; se un'altra richiesta concorrente ha già firmato,
    // l'UPDATE fa 0 righe e NON dobbiamo incrementare il totale dell'ordine.
    const { data: updatedRows, error: updateErr } = await supabaseAdmin
      .from("ordini_variazione")
      .update({
        firma_cliente: firma_data_base64,
        firmato_da: firmato_da || null,
        firmato_il: new Date().toISOString(),
        status: "approvata",
      })
      .eq("firma_token", token)
      .eq("status", "in_attesa")
      .select("id");

    if (updateErr) throw new Error(updateErr.message);
    if (!updatedRows || updatedRows.length === 0) {
      return errorResponse("OdV già processato (concorrenza)", 409);
    }

    // Aggiorna importo totale ordine se impatto_economico > 0 — atomico via RPC
    // (rimpiazzato SELECT-then-UPDATE che perdeva increment sotto concorrenza)
    if (odv.impatto_economico > 0) {
      const { error: incErr } = await supabaseAdmin.rpc(
        "increment_order_total" as never,
        { p_order_id: odv.order_id, p_delta: odv.impatto_economico }
      );
      if (incErr) {
        console.error("[firma-odv-webhook] increment_order_total error:", incErr);
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
