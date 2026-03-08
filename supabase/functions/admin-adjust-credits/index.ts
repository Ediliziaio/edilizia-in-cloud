import { requireAuth, requireRole } from "../_shared/auth.ts";
import { corsHeaders, secureHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsHeaders);

    const { company_id, service, amount_eur, reason } = await req.json();

    if (!company_id || !service || amount_eur == null || !reason?.trim()) {
      return errorResponse("Parametri mancanti: company_id, service, amount_eur, reason");
    }

    if (!["email", "ai_agents", "whatsapp"].includes(service)) {
      return errorResponse("Servizio non valido: " + service);
    }

    const { data, error } = await supabaseAdmin.rpc("adjust_credits_atomic", {
      p_company_id: company_id,
      p_service: service,
      p_amount: amount_eur,
      p_reason: reason.trim(),
      p_adjusted_by: userId,
    });

    if (error) {
      console.error("[admin-adjust-credits] RPC error:", error);
      return errorResponse("Errore: " + error.message, 500);
    }

    const result = data as { balance_before?: number; balance_after?: number; error?: string; success?: boolean };
    if (result?.error) {
      return errorResponse(result.error);
    }

    return jsonResponse({
      success: true,
      balance_before: result?.balance_before ?? 0,
      balance_after: result?.balance_after ?? 0,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[admin-adjust-credits] Error:", message);
    return errorResponse(message, 500);
  }
});
