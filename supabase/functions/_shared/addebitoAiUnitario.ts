/**
 * Addebito di un'unità AI che non si misura a token (un video, un'immagine, un
 * minuto di voce) — 15/11/2026, docs/ai-addebiti-censimento.md.
 *
 * Stesso registro del router (`charge_ai_call` → `ai_call_ledger`): una
 * chiamata senza token con un costo si addebita col ricarico del tier
 * (`ai_pricing_tiers.markup_pct`) e il pavimento `min_markup_multiplier`, come
 * ogni altra. Nessun prezzo nuovo: il costo è quello del provider (o la stima
 * dichiarata nel codice), la tariffa è quella configurata.
 *
 *   1. `controllaCreditoUnitario` PRIMA della chiamata: a credito finito il
 *      provider non parte.
 *   2. `addebitaUnitario` DOPO, con una chiave che identifica la chiamata al
 *      provider (l'id della previsione, del job): un retry non addebita due volte.
 */

// deno-lint-ignore no-explicit-any
type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

export const TIER_MEDIA = "t2_vision";

const fx = () => Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92");

export async function controllaCreditoUnitario(
  db: Db,
  args: { companyId: string; costoUsdStimato: number; tierKey?: string },
): Promise<{ ok: boolean; messaggio?: string }> {
  // Stima prudente: il pavimento del ricarico è 3× il costo.
  const stimaEur = Math.max(0, args.costoUsdStimato) * fx() * 3;
  const { data, error } = await db.rpc("precheck_ai_credit", {
    p_company_id: args.companyId,
    p_estimated_cost_eur: stimaEur,
    p_tier_key: args.tierKey ?? TIER_MEDIA,
    p_tokens_in: null,
    p_tokens_out: null,
  });
  if (error) return { ok: false, messaggio: "Verifica del credito AI non disponibile: riprova tra poco." };
  if (data?.ok) return { ok: true };
  return {
    ok: false,
    messaggio: data?.message || "Credito AI esaurito: ricarica il borsellino per usare questa funzione.",
  };
}

export async function addebitaUnitario(
  db: Db,
  args: {
    chiave: string;
    companyId: string;
    userId: string | null;
    taskKey: string;
    modello: string;
    costoUsd: number;
    tierKey?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; ledgerId?: string; replay?: boolean; errore?: string }> {
  const { data, error } = await db.rpc("charge_ai_call", {
    p_idempotency_key: args.chiave,
    p_company_id: args.companyId,
    p_user_id: args.userId,
    p_task_key: args.taskKey,
    p_tier_key: args.tierKey ?? TIER_MEDIA,
    p_model_used: args.modello,
    p_used_primary: true,
    p_fallback_index: 0,
    p_persona_key: null,
    p_tokens_in: 0,
    p_tokens_out: 0,
    p_cost_real_usd: Math.max(0, args.costoUsd),
    p_fx_usd_to_eur: fx(),
    p_status: "success",
    p_error_message: null,
    p_duration_ms: null,
    p_metadata: { ...(args.metadata ?? {}), unita: "unitaria" },
  });
  if (error || data?.success !== true) {
    return { ok: false, errore: error?.message ?? "charge_ai_call senza esito" };
  }
  return { ok: true, ledgerId: data.ledger_id, replay: data.idempotent_replay === true };
}
