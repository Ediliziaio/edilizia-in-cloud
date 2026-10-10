/**
 * Chi è collegato adesso.
 *
 * L'elenco utenti diceva «Online» a chiunque avesse una sessione con
 * `is_active = true`. Ma una sessione resta «attiva» finché qualcuno non esce o
 * non la chiude: il 09/10/2026 erano 131, nessuna con un segno di vita negli
 * ultimi 15 minuti, 100 ferme da più di un giorno e 20 da più di 30. Nell'elenco
 * 76 persone risultavano «Online».
 *
 * Adesso «collegato» vuol dire: sessione aperta E vista attiva di recente
 * (`user_sessions.last_active_at`). Chi non ha un segno di vita recente non è
 * «online»: si mostra quando l'app l'ha visto l'ultima volta.
 *
 * Nota: `last_active_at` si aggiorna quando l'app si apre (registra_sessione_app)
 * e quando arriva un battito (track-user-session, action «heartbeat»); oggi
 * nessun client manda il battito. Finché non lo manda, «collegato adesso» vale
 * per chi ha aperto l'app da poco, non per chi la tiene aperta da ore.
 *
 * Modulo puro: nessun React, nessun Supabase.
 */

/** Oltre questi minuti senza segni di vita non si è più «collegati adesso». */
export const FINESTRA_COLLEGATO_MINUTI = 10;

export interface SessionePerPresenza {
  user_id: string;
  is_active?: boolean | null;
  last_active_at?: string | null;
}

/** Da quando si guarda: gli estremi ISO per chiedere al database solo le sessioni recenti. */
export function sogliaCollegato(adesso: Date = new Date()): string {
  return new Date(adesso.getTime() - FINESTRA_COLLEGATO_MINUTI * 60_000).toISOString();
}

/** Questa sessione è aperta e l'app l'ha vista attiva da poco? */
export function sessioneCollegata(sessione: Pick<SessionePerPresenza, "is_active" | "last_active_at">, adesso: Date = new Date()): boolean {
  if (sessione.is_active === false) return false;
  if (!sessione.last_active_at) return false;
  const visto = new Date(sessione.last_active_at).getTime();
  if (Number.isNaN(visto)) return false;
  return visto >= adesso.getTime() - FINESTRA_COLLEGATO_MINUTI * 60_000;
}

/** Le persone (non le sessioni: una persona può averne tre) collegate adesso. */
export function personeCollegate(sessioni: readonly SessionePerPresenza[], adesso: Date = new Date()): Set<string> {
  const persone = new Set<string>();
  for (const s of sessioni) {
    if (s.user_id && sessioneCollegata(s, adesso)) persone.add(s.user_id);
  }
  return persone;
}

/**
 * L'ultima volta che l'app ha visto la persona: la più recente fra l'ultimo
 * accesso e l'attività di una sua sessione. `last_login_at` da solo può essere
 * di mesi fa per chi tiene la sessione aperta e usa l'app ogni giorno.
 */
export function ultimoSegnoDiVita(
  ultimoAccesso: string | null | undefined,
  sessioni: readonly Pick<SessionePerPresenza, "last_active_at">[],
): string | null {
  let migliore: number | null = null;
  let valore: string | null = null;
  for (const candidato of [ultimoAccesso, ...sessioni.map((s) => s.last_active_at)]) {
    if (!candidato) continue;
    const t = new Date(candidato).getTime();
    if (Number.isNaN(t)) continue;
    if (migliore === null || t > migliore) {
      migliore = t;
      valore = candidato;
    }
  }
  return valore;
}

/** Il motivo con cui è stata chiusa una sessione, in italiano: le righe vecchie lo hanno in inglese. */
const MOTIVI_IN_ITALIANO: Record<string, string> = {
  "Revoked by admin": "Chiusa dall'amministratore",
  "Revocata da admin": "Chiusa dall'amministratore",
  "All sessions revoked by admin": "Tutte le sessioni chiuse dall'amministratore",
};
export const motivoChiusuraLeggibile = (motivo: string): string => MOTIVI_IN_ITALIANO[motivo.trim()] ?? motivo;

