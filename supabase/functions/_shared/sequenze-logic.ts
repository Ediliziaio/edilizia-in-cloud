/**
 * COPIA per Deno edge runtime di src/lib/email-ai/sequenze.ts (tenere in sync).
 * sequenze.ts — MP-EMAIL-AI-13 · logica pura sequenze in uscita
 *
 * Funzioni pure (no I/O, no Deno, no Supabase) usate sia dai test vitest sia
 * dall'edge function `email-sequenze-tick` (copia in _shared/sequenze-logic.ts).
 * Centralizza: sostituzione variabili, scheduling step, valutazione STOP,
 * limiti di invio e footer di disiscrizione. Nessun invio reale qui dentro.
 */

export interface SequenzaStep {
  offset_giorni: number;
  oggetto: string;
  corpo_template: string;
  condizione_stop?: string;
}

export type TipoSequenza =
  | "followup_preventivo"
  | "sollecito_pagamento"
  | "ricontatto_opportunita"
  | "conferma_appuntamento"
  | "altro";

export type StatoStop = "fermata_risposta" | "bounce" | "opt_out";

const MS_GIORNO = 86_400_000;

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/**
 * Sostituisce i segnaposto {{chiave}} con i valori forniti.
 * - Chiavi sconosciute o valori null/undefined → stringa vuota (mai "undefined").
 * - Tollerante a spazi: {{ nome }} ≡ {{nome}}.
 */
export function sostituisciVariabili(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

/**
 * Calcola il momento d'invio dello step `stepIndex` rispetto all'ancora.
 * Ritorna null se lo stepIndex è fuori range (sequenza conclusa).
 */
export function calcolaProssimoInvio(
  ancoraAt: Date | string,
  step: SequenzaStep[],
  stepIndex: number,
): Date | null {
  if (!Array.isArray(step) || stepIndex < 0 || stepIndex >= step.length) return null;
  const base = toDate(ancoraAt).getTime();
  const offset = Number(step[stepIndex]?.offset_giorni ?? 0);
  const giorni = Number.isFinite(offset) ? offset : 0;
  return new Date(base + giorni * MS_GIORNO);
}

/**
 * Un'esecuzione è "dovuta" se è attiva e il prossimo invio è scaduto.
 */
export function isDovuto(
  prossimoInvioAt: Date | string | null,
  stato: string,
  ora: Date = new Date(),
): boolean {
  if (stato !== "attiva") return false;
  if (!prossimoInvioAt) return false;
  return toDate(prossimoInvioAt).getTime() <= ora.getTime();
}

export interface StopContext {
  /** È arrivata una risposta dal destinatario? */
  haRisposto?: boolean;
  /** Motivo di soppressione da email_suppressions (se presente). */
  suppression?: "hard_bounce" | "spam_complaint" | "unsubscribe" | null;
  /** Disiscrizione esplicita (click sul link opt-out). */
  optOut?: boolean;
  /** L'entità collegata risulta già conclusa (es. preventivo accettato, fattura pagata). */
  obiettivoRaggiunto?: boolean;
}

/**
 * Valuta le condizioni di STOP nell'ordine di gravità reputazionale.
 * La risposta del destinatario ha precedenza assoluta (cap.2).
 * Ritorna lo stato di stop, oppure null se la sequenza può proseguire.
 */
export function valutaStop(ctx: StopContext): StatoStop | "completata" | null {
  if (ctx.haRisposto) return "fermata_risposta";
  if (ctx.suppression === "hard_bounce" || ctx.suppression === "spam_complaint") return "bounce";
  if (ctx.optOut || ctx.suppression === "unsubscribe") return "opt_out";
  if (ctx.obiettivoRaggiunto) return "completata";
  return null;
}

/**
 * Limite di invio giornaliero (protezione reputazione dominio, lega a MP-15).
 */
export function entroLimiteInvii(inviatiOggi: number, limite: number): boolean {
  if (!Number.isFinite(limite) || limite <= 0) return false;
  return inviatiOggi < limite;
}

/**
 * Le sequenze commerciali/marketing richiedono opt-out e base giuridica (cap.2).
 * I solleciti di pagamento e le conferme appuntamento sono transazionali.
 */
export function richiedeOptOut(tipo: string): boolean {
  return tipo === "ricontatto_opportunita" || tipo === "altro";
}

/**
 * Footer di disiscrizione. Per i tipi transazionali ritorna stringa vuota.
 * Il `link` è già pronto (contiene il token opt-out).
 */
export function buildOptOutFooter(tipo: string, link: string): string {
  if (!richiedeOptOut(tipo) || !link) return "";
  return `\n\n—\nNon vuoi più ricevere questi messaggi? Disiscriviti qui: ${link}`;
}

export interface AvanzaResult {
  stepCorrente: number;
  stato: "attiva" | "completata";
  prossimoInvioAt: Date | null;
}

/**
 * Avanza l'esecuzione dopo aver gestito lo step `stepIndexAppenaFatto`.
 * Se non ci sono altri step → completata. Altrimenti calcola il prossimo invio.
 * Riferimento unico per il tick (automatico) e per la RPC di conferma (SQL ne è lo specchio).
 */
export function avanzaEsecuzione(
  ancoraAt: Date | string,
  step: SequenzaStep[],
  stepIndexAppenaFatto: number,
): AvanzaResult {
  const next = stepIndexAppenaFatto + 1;
  if (!Array.isArray(step) || next >= step.length) {
    return { stepCorrente: next, stato: "completata", prossimoInvioAt: null };
  }
  return {
    stepCorrente: next,
    stato: "attiva",
    prossimoInvioAt: calcolaProssimoInvio(ancoraAt, step, next),
  };
}

/**
 * Normalizza un'email per il confronto con email_suppressions.email_normalized.
 */
export function normalizzaEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}
