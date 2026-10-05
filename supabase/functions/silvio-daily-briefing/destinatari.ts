/**
 * Chi riceve il briefing mattutino di Silvio (cron `silvio_briefing_morning`,
 * ogni giorno alle 05:32 UTC, modo `all_companies`).
 *
 * IL PERCHÉ (05/10/2026)
 * Il briefing partiva per OGNI utente con la preferenza accesa, anche per le
 * aziende sospese. Sul Test Lab (sospeso, 382 utenti con il briefing attivo)
 * erano circa 30 messaggi al giorno scritti per nessuno: 0,35 $ al giorno, 4,3 $
 * in 14 giorni, il 31% della spesa AI del mese. Il limite di 30 al giorno non
 * era una scelta: il ciclo è sequenziale e la funzione scade prima di arrivare
 * in fondo, quindi se un giorno ci arrivasse la spesa salirebbe a circa 8,9 $
 * al giorno.
 *
 * Una azienda sospesa, scaduta o cessata non può usare Silvio: il briefing non
 * lo legge nessuno e costa. Gli stati sono gli stessi che l'app già considera
 * «bloccati» (`BLOCKED_STATUSES` in src/hooks/usePaymentMethodGate.ts).
 *
 * Il briefing chiesto a mano per un utente o per un'azienda (modi `user` e
 * `company`) non passa da qui: chi lo chiede lo vuole.
 *
 * Logica pura, senza Deno né rete: la usano la funzione e i test.
 */

export const STATI_SENZA_ACCESSO: ReadonlySet<string> = new Set(["suspended", "cancelled", "canceled", "expired"]);

export interface PreferenzaBriefing {
  user_id: string;
  company_id: string | null;
  last_briefing_at: string | null;
}

export interface DestinatariBriefing {
  targets: Array<{ user_id: string; company_id: string }>;
  /** Quanti utenti sono stati saltati perché la loro azienda è sospesa, scaduta o cessata. */
  saltatiPerStato: number;
}

/**
 * Chi riceve il briefing oggi. `statoAzienda` è la mappa id azienda → stato; se
 * la lettura degli stati è fallita si passa `null` e NON si filtra niente: meglio
 * un briefing in più di nessun briefing a tutti i clienti per un guasto di lettura.
 * Un'azienda che nella mappa non c'è resta tra i destinatari per lo stesso motivo.
 */
export function destinatariBriefing(
  preferenze: PreferenzaBriefing[],
  statoAzienda: Map<string, string | null> | null,
  oggi: Date,
): DestinatariBriefing {
  const targets: DestinatariBriefing["targets"] = [];
  let saltatiPerStato = 0;
  for (const p of preferenze) {
    if (!p.company_id) continue;
    // Già mandato oggi: non si ripete.
    if (p.last_briefing_at && new Date(p.last_briefing_at).toDateString() === oggi.toDateString()) continue;
    const stato = statoAzienda?.get(p.company_id);
    if (stato && STATI_SENZA_ACCESSO.has(stato)) {
      saltatiPerStato++;
      continue;
    }
    targets.push({ user_id: p.user_id, company_id: p.company_id });
  }
  return { targets, saltatiPerStato };
}
