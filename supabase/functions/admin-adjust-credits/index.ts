import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";

// FIX P2.2 + P3.3: esteso a service='render' tramite RPC dedicata
// adjust_render_credits_atomic (scrive anche render_credit_ledger).
// I wallet EUR continuano a usare adjust_credits_atomic esistente.
const EUR_SERVICES = ["email", "ai_agents", "whatsapp"] as const;
const INT_SERVICES = ["render"] as const;
const ALL_SERVICES = [...EUR_SERVICES, ...INT_SERVICES] as const;
type Service = typeof ALL_SERVICES[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    const body = await req.json();
    const {
      company_id,
      service,
      amount_eur,   // EUR delta (per email/ai_agents/whatsapp)
      amount,       // integer delta (per render) — alias accettato
      reason,
    } = body as {
      company_id?: string;
      service?: string;
      amount_eur?: number;
      amount?: number;
      reason?: string;
    };

    if (!company_id || !service || !reason?.trim()) {
      return errorResponse(
        "Parametri mancanti: company_id, service, amount/amount_eur, reason",
        400,
        corsH,
      );
    }

    if (!ALL_SERVICES.includes(service as Service)) {
      return errorResponse("Servizio non valido: " + service, 400, corsH);
    }

    // ── Branch render (INT delta) ───────────────────────────────────────────
    if ((INT_SERVICES as readonly string[]).includes(service)) {
      const delta = amount ?? amount_eur ?? null;
      if (delta == null || !Number.isFinite(delta) || Number.isNaN(delta)) {
        return errorResponse("Parametro 'amount' (intero) mancante per service=render", 400, corsH);
      }
      const deltaInt = Math.trunc(Number(delta));
      if (deltaInt === 0) {
        return errorResponse("L'importo deve essere diverso da zero", 400, corsH);
      }

      const { data, error } = await supabaseAdmin.rpc("adjust_render_credits_atomic", {
        p_company_id: company_id,
        p_delta: deltaInt,
        p_reason: reason.trim(),
        p_adjusted_by: userId,
      });

      if (error) {
        console.error("[admin-adjust-credits][render] RPC error:", error);
        return errorResponse("Errore ricarica render: " + error.message, 500, corsH);
      }

      const result = data as {
        success?: boolean;
        balance_before?: number;
        balance_after?: number;
        delta_applied?: number;
        ledger_id?: string;
      };
      return jsonResponse({
        success:        true,
        service:        "render",
        balance_before: result?.balance_before ?? 0,
        balance_after:  result?.balance_after ?? 0,
        delta_applied:  result?.delta_applied ?? 0,
        ledger_id:      result?.ledger_id ?? null,
      }, 200, corsH);
    }

    // ── Branch EUR (comportamento legacy, inalterato) ───────────────────────
    if (amount_eur == null) {
      return errorResponse("Parametro 'amount_eur' mancante", 400, corsH);
    }

    const { data, error } = await supabaseAdmin.rpc("adjust_credits_atomic", {
      p_company_id:   company_id,
      p_service:      service,
      p_amount:       amount_eur,
      p_reason:       reason.trim(),
      p_adjusted_by:  userId,
    });

    if (error) {
      console.error("[admin-adjust-credits][eur] RPC error:", error);
      return errorResponse("Errore: " + error.message, 500, corsH);
    }

    const result = data as {
      balance_before?: number;
      balance_after?: number;
      error?: string;
      success?: boolean;
    };
    if (result?.error) {
      return errorResponse(result.error, 400, corsH);
    }

    return jsonResponse({
      success:        true,
      service,
      balance_before: result?.balance_before ?? 0,
      balance_after:  result?.balance_after ?? 0,
    }, 200, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[admin-adjust-credits] Error:", message);
    return errorResponse(message, 500, corsH);
  }
});
