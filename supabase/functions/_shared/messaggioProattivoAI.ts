/**
 * Livello AqI opzionale per i messaggi che il bot manda per primo (report del
 * mattino, cose del giorno all'operaio, avvisi): a partire dai DATI VERI e dal
 * testo base già composto, l'AqI scrive un messaggio più curato e prioritizzato.
 *
 * Regole di sicurezza: usa solo i dati forniti (niente invenzioni), mantiene
 * tutti i fatti concreti (indirizzi, importi, nomi, orari) e, a QUALSIASI errore
 * o risposta vuota, torna al testo base deterministico. Il costo passa dal
 * router AqI (ai_model_config per task, addebito e ledger già gestiti lì).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;
import { aiRouterPrompt } from "./aiRouter.ts";

const SISTEMA = [
  "Sei l'assistente operativo di un'impresa edile e scrivi UN messaggio WhatsApp a una persona dell'azienda.",
  "Regole ferree:",
  "- Usa SOLO i dati forniti. Non inventare numeri, nomi, importi, date o fatti.",
  "- Italiano semplice e diretto, tono cordiale ma sbrigativo: è WhatsApp, non un'email.",
  "- Righe corte. Per il grassetto usa *asterischi singoli* (stile WhatsApp). Pochissime emoji, solo se aiutano davvero.",
  "- Mantieni TUTTI i dati concreti del testo base (indirizzi, importi, nomi, orari): puoi riordinarli e renderli più chiari, mai perderli o alterarli.",
  "- Niente firme, niente 'ecco il tuo report', niente domande. Dai solo il messaggio, pronto da inviare.",
].join("\n");

export interface OpzioniMessaggioAI {
  supabase: SupabaseLike;
  /** task_kind in ai_model_config (es. "bot_report_mattino", "bot_operativo_operaio"). */
  taskKey: string;
  companyId: string;
  /** Istruzioni specifiche per questo tipo di messaggio. */
  istruzioni: string;
  /** Dati strutturati da cui attingere. */
  dati: unknown;
  /** Testo base già pronto: guida per l'AqI e fallback sicuro. */
  testoBase: string;
  maxTokens?: number;
}

/** Ritorna il testo migliorato dall'AqI, o il testo base se qualcosa va storto. */
export async function messaggioProattivoAI(o: OpzioniMessaggioAI): Promise<string> {
  try {
    const r = await aiRouterPrompt({
      supabase: o.supabase,
      taskKey: o.taskKey,
      systemPrompt: `${SISTEMA}\n\n${o.istruzioni}`,
      userPrompt: [
        `Dati (JSON):\n${JSON.stringify(o.dati)}`,
        "",
        "Testo base già pronto — miglioralo senza perdere nessun dato:",
        o.testoBase,
      ].join("\n"),
      params: { max_tokens: o.maxTokens ?? 600, temperature: 0.4 },
      companyId: o.companyId,
    });
    const testo = (r?.content ?? "").trim();
    return testo.length >= 10 ? testo : o.testoBase;
  } catch (_e) {
    return o.testoBase;
  }
}
