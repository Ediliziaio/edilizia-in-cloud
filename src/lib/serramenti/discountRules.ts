/**
 * discountRules — client-side mirror della logica SQL `compute_max_discount`.
 *
 * Replica in TS le regole di matching/binding del backend in modo che
 * StepEconomia (serramenti) possa valutare in tempo reale quale regola di
 * sconto scatta e mostrare il verdetto all'utente prima del salvataggio.
 *
 * Allineato a:
 *  - supabase/migrations/20261023120000_preventivi_v2_foundations.sql
 *  - src/pages/azienda/settings/SettingsScontistica.tsx (DiscountSimulator)
 *
 * Regola di binding: tra tutte le regole matchanti vince la PIÙ RESTRITTIVA:
 *  - sconto_max = min(sconto_max_pct di tutte le matchanti)
 *  - approva_oltre = min dei non-null (se nessuno → null)
 *  - margine_min = max(margine_min_pct di tutte le matchanti)
 *
 * Fallback (nessuna regola matchante): sconto max 10%, no approvazione.
 */

import type { DiscountRule } from "@/hooks/useDiscountRules";

export interface DiscountEvalContext {
  /** Importo preventivo (subtotal/imponibile pre-sconto, IVA esclusa). */
  importo: number;
  /** Commerciale assegnato al preventivo. null per serramenti senza salesperson. */
  salespersonId?: string | null;
  /** Tag/categoria del cliente (es. ["vip","gold"]). */
  clientTags?: string[];
  /** Tipo lavoro (es. "serramenti"). Filtra regole con tipo_lavoro specifico. */
  tipoLavoro?: string | null;
}

export interface DiscountEvalResult {
  /** Regole effettivamente matchanti il contesto. */
  matchingRules: DiscountRule[];
  /** Sconto max % consentito (binding). */
  scontoMaxPct: number;
  /** Soglia % oltre la quale serve approvazione admin. null = mai. */
  approvaOltrePct: number | null;
  /** Margine % minimo da preservare post-sconto. */
  margineMinPct: number;
  /** true se nessuna regola matcha (default 10%). */
  isFallback: boolean;
  /** Regola "principale" (priority più bassa tra le matchanti, o null se fallback). */
  primaryRule: DiscountRule | null;
}

const FALLBACK_SCONTO_PCT = 10;

export function evaluateDiscountRules(
  rules: DiscountRule[],
  ctx: DiscountEvalContext,
): DiscountEvalResult {
  const active = rules.filter((r) => r.is_active);
  const tags = (ctx.clientTags ?? []).map((t) => t.toLowerCase());
  const tipo = (ctx.tipoLavoro ?? "").trim().toLowerCase();

  const matching = active.filter((r) => {
    // Fascia importo
    const imMin = r.importo_min ?? 0;
    const imMax = r.importo_max ?? Infinity;
    if (ctx.importo < imMin || ctx.importo > imMax) return false;

    // Tipo lavoro: se la regola specifica un tipo, deve coincidere
    if (r.tipo_lavoro && r.tipo_lavoro.trim()) {
      if (r.tipo_lavoro.toLowerCase() !== tipo) return false;
    }

    // Scope
    if (r.scope === "per_commerciale") {
      if (!ctx.salespersonId) return false;
      if (r.salesperson_id !== ctx.salespersonId) return false;
    }
    if (r.scope === "per_cliente_cat") {
      if (!r.client_category) return false;
      if (!tags.includes(r.client_category.toLowerCase())) return false;
    }
    // "globale" passa sempre

    return true;
  });

  if (matching.length === 0) {
    return {
      matchingRules: [],
      scontoMaxPct: FALLBACK_SCONTO_PCT,
      approvaOltrePct: null,
      margineMinPct: 0,
      isFallback: true,
      primaryRule: null,
    };
  }

  const scontoMaxPct = Math.min(...matching.map((r) => r.sconto_max_pct));
  const approvaCandidates = matching
    .map((r) => r.approva_oltre_pct)
    .filter((v): v is number => v != null);
  const approvaOltrePct = approvaCandidates.length > 0 ? Math.min(...approvaCandidates) : null;
  const margineMinPct = Math.max(...matching.map((r) => r.margine_min_pct));

  // Primary = quella con priority più bassa (valutata "prima"). Usata per
  // salvare un singolo `discount_rule_id` sul progetto a scopo audit/PDF.
  const primaryRule = [...matching].sort((a, b) => a.priority - b.priority)[0];

  return {
    matchingRules: matching,
    scontoMaxPct,
    approvaOltrePct,
    margineMinPct,
    isFallback: false,
    primaryRule,
  };
}

export type DiscountVerdict = "ok" | "approve" | "blocked";

/**
 * Classifica uno sconto richiesto rispetto al binding:
 *  - "ok": sotto soglia approvazione (o entro max se approva = null)
 *  - "approve": tra approva_oltre e sconto_max → serve OK admin
 *  - "blocked": sopra sconto_max → non applicabile senza override admin
 */
export function classifyDiscount(
  scontoPct: number,
  evalResult: Pick<DiscountEvalResult, "scontoMaxPct" | "approvaOltrePct">,
): DiscountVerdict {
  if (scontoPct > evalResult.scontoMaxPct) return "blocked";
  if (evalResult.approvaOltrePct != null && scontoPct > evalResult.approvaOltrePct) return "approve";
  return "ok";
}
