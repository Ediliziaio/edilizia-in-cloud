/**
 * Costo AI già pagato in un'altra unità (crediti render) o a carico della
 * piattaforma: si registra col suo costo vero, senza scalare il portafoglio
 * AI (15/11/2026, docs/ai-addebiti-censimento.md).
 *
 * Con l'azienda → una riga `skipped` in `ai_call_ledger`, con il motivo
 * (la vista `consumi_ai_azienda` la mostra come «non addebitato: <motivo>»).
 * Senza azienda → `platform_ai_usage_log`, marcata `interno`.
 * Best-effort: un errore qui non ferma mai il lavoro già fatto.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CostoIncluso {
  companyId: string | null | undefined;
  taskKey: string;
  modello: string;
  tokensIn: number;
  tokensOut: number;
  costoUsd: number;
  motivo: string;
  generationId?: string | null;
  metadata?: Record<string, unknown>;
}

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => { insert: (r: Record<string, unknown>) => PromiseLike<{ error: any }> } };

function clientDiServizio(): Db | null {
  const url = Deno.env.get("SUPABASE_URL");
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return url && chiave ? createClient(url, chiave) as unknown as Db : null;
}

export async function registraCostoIncluso(c: CostoIncluso, db: Db | null = clientDiServizio()): Promise<boolean> {
  if (!db) return false;
  const fx = Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92");
  try {
    if (c.companyId) {
      const suffisso = c.generationId || `${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
      const { error } = await db.from("ai_call_ledger").insert({
        idempotency_key: `${c.taskKey}_incluso_${suffisso}`,
        company_id: c.companyId,
        task_key: c.taskKey,
        tier_key: "t2_vision",
        model_used: c.modello,
        used_primary: true,
        fallback_index: 0,
        tokens_in: Math.max(0, c.tokensIn),
        tokens_out: Math.max(0, c.tokensOut),
        cost_real_usd: Math.max(0, c.costoUsd),
        cost_real_eur: Math.max(0, c.costoUsd) * fx,
        cost_billed_eur: 0,
        fx_usd_to_eur: fx,
        applied_markup_pct: 0,
        status: "skipped",
        metadata: { ...(c.metadata ?? {}), motivo: c.motivo, skip_reason: c.motivo, generation_id: c.generationId ?? null },
      });
      if (error) throw new Error(error.message ?? String(error));
    } else {
      const { error } = await db.from("platform_ai_usage_log").insert({
        operation_key: c.taskKey,
        provider: c.modello.split("/")[0] ?? "openrouter",
        model_used: c.modello,
        tokens_in: Math.max(0, c.tokensIn),
        tokens_out: Math.max(0, c.tokensOut),
        cost_real_usd: Math.max(0, c.costoUsd),
        status: "success",
        metadata: { ...(c.metadata ?? {}), interno: true, motivo: c.motivo },
      });
      if (error) throw new Error(error.message ?? String(error));
    }
    return true;
  } catch (e) {
    console.warn(`[costoAiIncluso] ${c.taskKey}:`, (e as Error)?.message ?? e);
    return false;
  }
}
