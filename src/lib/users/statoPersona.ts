/**
 * Lo stato di una persona nell'elenco utenti: bloccata, collegata adesso, mai
 * entrata… con le parole che si leggono nell'elenco e nel filtro «Stato».
 *
 * Prima «Online» voleva dire «ha una sessione con is_active = true», e una
 * sessione resta così finché qualcuno non la chiude: il 09/10/2026 nessuna delle
 * 131 «attive» aveva un segno di vita negli ultimi 15 minuti, e nell'elenco 76
 * persone risultavano «Online». Ora conta il segno di vita recente
 * (@/lib/users/collegamento).
 *
 * Modulo puro: nessun React, nessun Supabase.
 */

export type ChiaveStato = "blocked" | "locked" | "online" | "never" | "inactive";

export interface DatiStatoPersona {
  /** Accesso bloccato da un amministratore. */
  is_blocked: boolean;
  /** Bloccata dal sistema per password sbagliate fino a questo momento. */
  locked_until: string | null;
  /** Ha una sessione con un segno di vita negli ultimi minuti. */
  collegato_adesso: boolean;
  /** L'ultima volta che l'app l'ha vista (accesso o attività di una sessione). */
  ultimo_segno_di_vita: string | null;
}

/** Le parole di ogni stato, per il filtro e per i riepiloghi. */
export const ETICHETTE_STATO: Record<ChiaveStato, string> = {
  online: "Collegati adesso",
  blocked: "Accesso bloccato",
  locked: "Bloccati per password sbagliate",
  never: "Mai connessi",
  inactive: "Non collegati",
};

function bloccataDalSistema(lockedUntil: string | null, adesso: Date): boolean {
  if (!lockedUntil) return false;
  const fino = new Date(lockedUntil).getTime();
  return Number.isFinite(fino) && fino > adesso.getTime();
}

/** In quale stato sta la persona, nell'ordine in cui conta per chi guarda l'elenco. */
export function chiaveStato(persona: DatiStatoPersona, adesso: Date = new Date()): ChiaveStato {
  if (persona.is_blocked) return "blocked";
  if (bloccataDalSistema(persona.locked_until, adesso)) return "locked";
  if (persona.collegato_adesso) return "online";
  if (!persona.ultimo_segno_di_vita) return "never";
  return "inactive";
}

function dueCifre(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * «Bloccato fino alle 14:30 (password sbagliate)», oppure con il giorno se il
 * blocco finisce un altro giorno. Prima era «Bloccato temporaneo»: si confondeva
 * con «Accesso bloccato», che è un'altra cosa (lo fa l'amministratore).
 *
 * `breve` toglie «(password sbagliate)»: su telefono la frase intera spingeva il
 * nome della persona fuori dalla riga («M.»).
 */
export function etichettaBloccoTemporaneo(lockedUntil: string, adesso: Date = new Date(), breve = false): string {
  const fino = new Date(lockedUntil);
  if (Number.isNaN(fino.getTime())) return breve ? "Bloccato" : "Bloccato per password sbagliate";
  const ora = `${dueCifre(fino.getHours())}:${dueCifre(fino.getMinutes())}`;
  const stessoGiorno =
    fino.getFullYear() === adesso.getFullYear() &&
    fino.getMonth() === adesso.getMonth() &&
    fino.getDate() === adesso.getDate();
  const quando = stessoGiorno
    ? `alle ${ora}`
    : `al ${dueCifre(fino.getDate())}/${dueCifre(fino.getMonth() + 1)} alle ${ora}`;
  return breve ? `Bloccato fino ${quando}` : `Bloccato fino ${quando} (password sbagliate)`;
}
