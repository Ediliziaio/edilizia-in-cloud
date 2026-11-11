/** Nessun messaggio o contenuto email nei log degli errori di persistenza. */
import { bloccoAiPerUtente } from "../_shared/erroriAi.ts";

export interface TriageResult {
  category: string;
  priority: string;
  summary: string;
  extracted: Record<string, unknown>;
  suggested_action: string;
}
export type TriageOutcome =
  | { state: 'saved'; result: TriageResult }
  | { state: 'failed' | 'skipped' }
  /** Carta, abbonamento o credito: il tentativo NON si consuma, si riprova fra un'ora. */
  | { state: 'blocked'; motivo: string };

/** Fra quanto si riprova un'email ferma per un blocco di carta, abbonamento o credito. */
export const ATTESA_BLOCCO_MS = 3_600_000;

/**
 * Il motivo da scrivere in `ai_error` per un blocco (11/11/2026): quello vero, non
 * «triage failed». Il credito del provider non è dell'azienda: lo si dice così.
 */
export function motivoBloccoTriage(err: unknown): string | null {
  const blocco = bloccoAiPerUtente(err);
  if (!blocco) return null;
  if (blocco.body.code === 'servizio_non_disponibile') return "triage sospeso: l'AI della piattaforma è momentaneamente ferma";
  return `triage sospeso: ${blocco.body.error}`.slice(0, 500);
}

// Unico confine strutturale condiviso con il client Edge e i fake dei test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function salvaTriage(db: any, id: string, companyId: string,
  classify: () => Promise<TriageResult | null>, now = () => new Date()): Promise<TriageOutcome> {
  const { data: attempt, error: claimError } = await db.rpc('claim_email_triage', {
    p_email_id: id, p_company_id: companyId,
  });
  if (claimError) return { state: 'failed' };
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) return { state: 'skipped' };
  const update = (values: Record<string, unknown>) => db.from('email_inbox').update(values)
    .eq('id', id).eq('company_id', companyId).eq('ai_triage_attempts', attempt)
    .is('ai_processed_at', null).select('id').maybeSingle();
  try {
    const result = await classify();
    if (result) {
      const { data, error } = await update({
        ai_category: result.category, ai_priority: result.priority,
        ai_summary: result.summary?.substring(0, 200), ai_extracted: result.extracted ?? {},
        ai_suggested_action: result.suggested_action, ai_processed_at: now().toISOString(),
        ai_error: null, status: 'triaged', ai_triage_claimed_at: null, ai_triage_retry_at: null,
      });
      if (!error && data) return { state: 'saved', result };
      // Una lease superata non può modificare né rilasciare il lavoro di un altro worker.
      if (!error && !data) return { state: 'skipped' };
    }
  } catch (err) {
    // Carta mancante, abbonamento sospeso o scaduto, credito finito (11/11/2026): non è
    // l'email, e in cinque minuti non cambia. Il tentativo torna indietro (il claim lo
    // aveva contato), il motivo resta scritto e si riprova fra un'ora: quando il blocco
    // è tolto l'email si classifica, se è ancora dentro la finestra del poller.
    const motivo = motivoBloccoTriage(err);
    if (motivo) {
      try {
        await update({
          ai_error: motivo,
          ai_triage_attempts: attempt - 1,
          ai_triage_claimed_at: null,
          ai_triage_retry_at: new Date(now().getTime() + ATTESA_BLOCCO_MS).toISOString(),
        });
      } catch { /* La lease scade comunque dopo 10 minuti. */ }
      return { state: 'blocked', motivo };
    }
    // Errore AI/rete: il tentativo resta registrato anche se il salvataggio fallisce.
  }
  try {
    await update({
      ai_error: attempt >= 3 ? 'triage failed: tentativi esauriti' : 'triage failed: nuovo tentativo pianificato',
      ai_processed_at: attempt >= 3 ? now().toISOString() : null,
      ai_triage_claimed_at: null,
      ai_triage_retry_at: attempt >= 3 ? null : new Date(now().getTime() + 300_000 * 2 ** (attempt - 1)).toISOString(),
    });
  } catch { /* Il claim persistente limita comunque i tentativi e scade dopo 10 minuti. */ }
  return { state: 'failed' };
}
