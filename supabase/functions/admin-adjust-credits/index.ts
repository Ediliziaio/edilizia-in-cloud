import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";

// FIX P2.2 + P3.3: esteso a service='render' tramite RPC dedicata
// adjust_render_credits_atomic (scrive anche render_credit_ledger).
// I wallet EUR continuano a usare adjust_credits_atomic esistente.
// 'sms' usa il wallet sms_wallet (colonna `crediti`, EUR) ma passa per la
// stessa adjust_credits_atomic (ramo dedicato che traccia anche in
// sms_wallet_transazioni). È quindi un EUR service a tutti gli effetti qui.
const EUR_SERVICES = ["email", "ai_agents", "whatsapp", "sms"] as const;
const INT_SERVICES = ["render"] as const;
const ALL_SERVICES = [...EUR_SERVICES, ...INT_SERVICES] as const;
type Service = typeof ALL_SERVICES[number];

function isMissingRpc(error: { message?: string } | null | undefined): boolean {
  return /function.*not.*found|schema cache|PGRST202|Could not find the function/i.test(error?.message ?? "");
}

async function adjustRenderCreditsDirectly(
  supabaseAdmin: any,
  companyId: string,
  delta: number,
  reason: string,
  adjustedBy: string,
) {
  const { data: row, error: readError } = await supabaseAdmin
    .from("render_credits")
    .select("balance,total_purchased,total_used")
    .eq("company_id", companyId)
    .maybeSingle();

  if (readError) throw readError;

  const balanceBefore = Number(row?.balance ?? 0);
  const balanceAfter = Math.max(0, balanceBefore + delta);
  const deltaApplied = balanceAfter - balanceBefore;
  const totalPurchased = Number(row?.total_purchased ?? 0) + Math.max(deltaApplied, 0);
  const totalUsed = Number(row?.total_used ?? 0);

  const writePayload = {
    balance: balanceAfter,
    total_purchased: totalPurchased,
    total_used: totalUsed,
    updated_at: new Date().toISOString(),
  };

  if (row) {
    const { error: updateError } = await supabaseAdmin
      .from("render_credits")
      .update(writePayload)
      .eq("company_id", companyId);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabaseAdmin
      .from("render_credits")
      .insert({ company_id: companyId, ...writePayload });
    if (insertError) throw insertError;
  }

  let ledgerId: string | null = null;
  const { data: ledger, error: ledgerError } = await supabaseAdmin
    .from("render_credit_ledger")
    .insert({
      company_id: companyId,
      delta: deltaApplied,
      balance_after: balanceAfter,
      reason: "adjust_admin",
      user_id: adjustedBy,
      metadata: {
        reason_text: reason,
        delta_requested: delta,
        fallback: "admin-adjust-credits-direct",
      },
    })
    .select("id")
    .maybeSingle();

  if (ledgerError) {
    console.warn("[admin-adjust-credits][render] direct fallback ledger insert failed:", ledgerError.message);
  } else {
    ledgerId = ledger?.id ?? null;
  }

  const { error: auditError } = await supabaseAdmin
    .from("admin_credit_adjustments")
    .insert({
      company_id: companyId,
      service: "render",
      amount_eur: deltaApplied,
      reason,
      created_by: adjustedBy,
    });

  if (auditError) {
    console.warn("[admin-adjust-credits][render] direct fallback admin audit insert failed:", auditError.message);
  }

  return {
    success: true,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    delta_applied: deltaApplied,
    ledger_id: ledgerId,
  };
}

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

      let { data, error } = await supabaseAdmin.rpc("adjust_render_credits_atomic", {
        p_company_id: company_id,
        p_delta: deltaInt,
        p_reason: reason.trim(),
        p_adjusted_by: userId,
      });

      if (error) {
        const isMissingDedicatedRpc = /adjust_render_credits_atomic/i.test(error.message) || isMissingRpc(error);

        if (isMissingDedicatedRpc) {
          console.warn("[admin-adjust-credits][render] dedicated RPC unavailable, falling back:", error.message);
          const fallback = await supabaseAdmin.rpc("adjust_credits_atomic", {
            p_company_id:  company_id,
            p_service:     "render",
            p_amount:      deltaInt,
            p_reason:      reason.trim(),
            p_adjusted_by: userId,
          });
          data = fallback.data;
          error = fallback.error;
        }

        if (error) {
          const canUseDirectFallback =
            isMissingRpc(error) ||
            /Servizio non valido|Servizio non supportato|render/i.test(error.message);

          if (canUseDirectFallback) {
            try {
              data = await adjustRenderCreditsDirectly(
                supabaseAdmin,
                company_id,
                deltaInt,
                reason.trim(),
                userId,
              );
              error = null;
            } catch (directError) {
              console.error("[admin-adjust-credits][render] direct fallback error:", directError);
              const directMessage = directError instanceof Error ? directError.message : String(directError);
              return errorResponse("Errore ricarica render: " + directMessage, 500, corsH);
            }
          } else {
            console.error("[admin-adjust-credits][render] RPC error:", error);
            return errorResponse("Errore ricarica render: " + error.message, 500, corsH);
          }
        }
      }

      const result = data as {
        success?: boolean;
        balance_before?: number;
        balance_after?: number;
        delta_applied?: number;
        ledger_id?: string;
        error?: string;
      };
      if (result?.error) {
        return errorResponse(result.error, 400, corsH);
      }
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
