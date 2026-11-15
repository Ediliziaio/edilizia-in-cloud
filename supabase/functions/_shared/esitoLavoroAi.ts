/**
 * Esito di un lavoro automatico: chiuso senza AI, con AI, col dato già presente
 * o lasciato all'utente (15/11/2026, docs/ai-addebiti-censimento.md §5).
 *
 * Serve a misurare quanto lavoro si chiude senza pagare l'AI: lo legge
 * `metriche_ai_azienda` e lo mostra la pagina «Consumo AI del team». Un lavoro
 * è una riga (azienda + flusso + chiave): rielaborarlo aggiorna l'esito e somma
 * le chiamate. Best-effort: un errore qui non ferma mai il lavoro.
 */

export type EsitoLavoroAi = "senza_ai" | "con_ai" | "dato_gia_presente" | "eccezione";

export interface EsitoLavoroArgs {
  companyId: string;
  /** Nome del flusso, stabile nel tempo (es. "fattura_classifica"). */
  flusso: string;
  /** Identità del lavoro (id del documento, impronta del file). */
  chiave: string;
  esito: EsitoLavoroAi;
  chiamateAi?: number;
  motivo?: string | null;
}

// deno-lint-ignore no-explicit-any
type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: any }> };

export async function registraEsitoLavoroAi(db: Db, args: EsitoLavoroArgs): Promise<boolean> {
  if (!args.companyId || !args.flusso || !args.chiave) return false;
  try {
    const { error } = await db.rpc("registra_esito_lavoro_ai", {
      p_company_id: args.companyId,
      p_flusso: args.flusso,
      p_chiave: args.chiave,
      p_esito: args.esito,
      p_chiamate_ai: Math.max(0, Math.floor(args.chiamateAi ?? 0)),
      p_motivo: args.motivo ?? null,
    });
    if (error) {
      console.warn(`[esitoLavoroAi] ${args.flusso}: ${error.message ?? error}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[esitoLavoroAi] ${args.flusso}:`, (e as Error)?.message ?? e);
    return false;
  }
}

/** Esito di una chiamata del router: dalla cache vale come dato già presente. */
export function esitoDaRisultatoRouter(r: { modelUsed?: string | null; prechargeReason?: string | null }): EsitoLavoroAi {
  return r.prechargeReason === "cache_hit" || r.modelUsed === "cache" ? "dato_gia_presente" : "con_ai";
}
