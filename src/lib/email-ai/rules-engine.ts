/**
 * MP-EMAIL-AI-05 — I tipi delle regole di instradamento delle email.
 *
 * Le regole le scrive la pagina delle regole (EmailRulesSettings, via hooks.ts) in
 * email_regole; le valuta ed esegue solo il server, nella cascata L1
 * (supabase/functions/_shared/email-ai-cascade.ts: valutaRegole e
 * applicaEffettiRegola), provata da src/test/logic/emailRegole.test.ts. Fino al
 * 26/09/2026 qui c'era anche una copia del valutatore che nessuno eseguiva, con
 * azioni (etichetta, notifica, salta AI) che il server ignorava.
 *
 * Precedenza (MP-05 §4): le regole sono valutate per `priorita` crescente
 * (più basso = prima); a parità, la più specifica (più condizioni). La prima
 * che corrisponde vince.
 */

// ─── Tipi regola ──────────────────────────────────────────────────────────────

export type CampoCondizione =
  | "indirizzo"      // from_email completo
  | "dominio"        // dominio mittente
  | "destinatario"   // to/cc
  | "oggetto"        // subject
  | "corpo"          // snippet/body
  | "allegato"       // ha allegato / tipo
  | "casella";       // casella ricevente (to_email)

export type OperatoreCondizione =
  | "e"              // uguaglianza esatta (case-insensitive)
  | "contiene"
  | "termina_con"
  | "inizia_con"
  | "regex";

export interface Condizione {
  campo: CampoCondizione;
  operatore: OperatoreCondizione;
  valore: string;
}

/**
 * Le azioni che il server esegue: categoria e collega_entita decidono la
 * classificazione; priorita (alta, media, bassa) va in ai_priority e l'AI non la
 * cambia; silenzia segna l'email come letta; marca_da_fare la contrassegna con la
 * stella.
 */
export type TipoAzione =
  | "categoria"
  | "collega_entita"
  | "priorita"
  | "silenzia"
  | "marca_da_fare";

export interface Azione {
  tipo: TipoAzione;
  valore?: unknown; // categoria string | {tipo, id} | priorità "alta" | "media" | "bassa"
}
