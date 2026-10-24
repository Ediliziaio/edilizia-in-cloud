// Tetti per giro del poller della posta (email-poll-inbox).
//
// Il worker edge lavora con un budget di CPU ridotto: un giro che prova a
// scaricare e analizzare troppo in una sola invocazione lo esaurisce e il
// runtime chiude il worker prima che la funzione riesca a salvare il progresso
// con email_oauth_mark_sync. Al giro dopo `last_synced_at` è ancora quello di
// prima, quindi si ricomincia esattamente lo stesso lavoro: la casella non
// avanza mai.
//
// La cura, in linea con _shared/rispostaRapidaCron.ts: tenere OGNI giro piccolo
// e certo di finire. La lista delle caselle da sincronizzare è ordinata dalle
// più indietro (email_oauth_list_due_for_poll, ORDER BY last_synced_at ASC),
// quindi lavorare poche caselle per giro significa toccarle tutte a rotazione su
// più giri — il poll gira ogni pochi minuti. Un primo giro riuscito fa avanzare
// `last_synced_at`: dal giro dopo ogni casella ha solo i messaggi nuovi e il
// lavoro torna leggero.
//
// I numeri stanno qui, isolati e senza dipendenze, così sono anche verificabili
// da un test.

export const LIMITI_POLL = {
  /** Caselle avviate al massimo in un giro (prima: 50). Le altre, più indietro, al giro dopo. */
  casellePerGiro: 15,

  /** Messaggi in arrivo per casella Gmail, giro incrementale (prima: 200). */
  gmailIncrementale: 20,
  /** Primo allineamento di una casella Gmail appena collegata (prima: 1000). */
  gmailPrimoGiro: 20,
  /** Messaggi inviati per casella Gmail, giro incrementale (prima: 100). */
  gmailInviateIncrementale: 10,
  /** Inviati al primo allineamento di una casella Gmail (prima: 500). */
  gmailInviatePrimoGiro: 10,

  /** Messaggi IMAP per casella in un giro (prima: 50). Allineato a outreach-imap-poll. */
  imapPerGiro: 5,

  /** Allegati documentali materializzati nel bucket in un giro (prima: 40). */
  allegatiPerGiro: 12,

  /**
   * Riconciliazione dello stato letto/non-letto su Gmail: pagine da 500 ID
   * scaricate (prima: 8 = 4000 ID) e righe locali candidate (prima: 3000). È un
   * allineamento best-effort: tenerlo contenuto lascia CPU al lavoro principale.
   */
  reconcilePagine: 2,
  reconcileCandidati: 500,

  /**
   * Tempo d'orologio oltre il quale, servita almeno una casella, non se ne avvia
   * un'altra in questo giro. Il worker viene chiuso intorno ai 4-5 secondi: ci si
   * ferma prima, con margine. Il resto del tempo è attesa di rete (CPU quasi
   * zero), quindi questa è una soglia prudente, non il budget di CPU vero.
   */
  budgetGiroMs: 3500,

  /**
   * Giri consecutivi su una casella IMAP con il cursore fermo allo stesso UID,
   * oltre i quali si salta il messaggio che blocca (se ne leggono solo le
   * intestazioni). Un giro che muore prima di salvare non lascia errori né
   * avanzamento: l'unico segno è questo contatore, scritto PRIMA di scaricare.
   */
  imapTentativiPrimaDiSaltare: 2,
} as const;

/**
 * Segno lasciato su una casella IMAP prima di scaricare: da quale UID, quante
 * volte di fila e il `last_synced_at` visto in quel momento.
 */
export type StalloImap = { da_uid: number; volte: number; sync_visto: string | null };

/**
 * Il contatore del giro che sta per partire. Ogni esito normale di un giro
 * (riuscito o con un errore) aggiorna `last_synced_at` (email_oauth_mark_sync):
 * solo la morte del worker lo lascia com'era. Quindi il contatore sale SOLO se
 * il cursore E il `last_synced_at` sono quelli del tentativo precedente, cioè
 * se quel giro non è mai arrivato in fondo; altrimenti riparte da 1. Un login
 * rifiutato o un server lento non contano: la casella non va saltata per quello.
 */
export function prossimoStalloImap(
  precedente: unknown,
  ultimoUid: number,
  lastSyncedAt: string | null,
): StalloImap {
  const p = precedente as Partial<StalloImap> | null | undefined;
  const nonFinito =
    p != null &&
    typeof p === "object" &&
    Number(p.da_uid) === ultimoUid &&
    (p.sync_visto ?? null) === (lastSyncedAt ?? null) &&
    Number.isFinite(Number(p.volte));
  return { da_uid: ultimoUid, volte: nonFinito ? Number(p!.volte) + 1 : 1, sync_visto: lastSyncedAt ?? null };
}

/** Vero se questo giro deve saltare il messaggio che blocca la casella. */
export function devoSaltareMessaggio(stallo: StalloImap): boolean {
  return stallo.volte > LIMITI_POLL.imapTentativiPrimaDiSaltare;
}

/**
 * Vero se conviene chiudere il giro qui: si è già servita almeno una casella e
 * il budget di tempo è esaurito. Le caselle non servite sono le più indietro
 * (lista ordinata per last_synced_at) e il giro successivo riparte da quelle.
 *
 * Non ferma mai prima della prima casella (`caselleServite >= 1`): un giro
 * elabora sempre qualcosa, così nessuna casella resta indietro per sempre.
 */
export function fermaIlGiro(inizioMs: number, oraMs: number, caselleServite: number): boolean {
  return caselleServite >= 1 && (oraMs - inizioMs) >= LIMITI_POLL.budgetGiroMs;
}
