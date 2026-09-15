/**
 * Raggruppamento lato client dei badge della sidebar (email, attività).
 *
 * 15/09/2026: prima ogni badge faceva tre HEAD count=exact in parallelo a ogni
 * giro. Ora una sola richiesta: il totale arriva esatto dal count, le poche
 * righe ordinate (urgenti / scadute per prime) si contano qui. Il limite di
 * righe tiene piccola la risposta; in produzione il massimo misurato era 5
 * email urgenti e 9 attività aperte per utente, ben sotto i limiti usati.
 */

export const LIMITE_RIGHE_EMAIL = 100;
export const LIMITE_RIGHE_ATTIVITA = 200;

export interface ConteggiEmail {
  unread: number;
  urgent: number;
}

export function contaEmailNonLette(
  righe: ReadonlyArray<{ ai_priority: string | null }> | null | undefined,
  totale: number | null | undefined,
): ConteggiEmail {
  const urgent = (righe ?? []).filter((r) => r.ai_priority === "alta").length;
  return { unread: Math.max(totale ?? 0, urgent), urgent };
}

export interface ConteggiAttivita {
  total: number;
  overdue: number;
  dueToday: number;
}

/**
 * `oggi` e `domani` in formato yyyy-MM-dd (data locale). Il confronto sui primi
 * 10 caratteri riproduce il filtro PostgREST `due_date < oggi` usato prima.
 */
export function contaAttivita(
  righe: ReadonlyArray<{ due_date: string | null }> | null | undefined,
  totale: number | null | undefined,
  oggi: string,
  domani: string,
): ConteggiAttivita {
  let overdue = 0;
  let dueToday = 0;
  for (const r of righe ?? []) {
    if (!r.due_date) continue;
    const giorno = r.due_date.slice(0, 10);
    if (giorno < oggi) overdue += 1;
    else if (giorno < domani) dueToday += 1;
  }
  const righeLette = righe?.length ?? 0;
  return { total: Math.max(totale ?? 0, righeLette), overdue, dueToday };
}
