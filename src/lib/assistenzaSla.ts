/**
 * Da quanto è ferma un'assistenza.
 *
 * Si conta dall'ULTIMO MOVIMENTO, non dall'apertura: un ticket aperto tre mesi
 * fa ma lavorato ieri non è un problema, mentre uno aperto la settimana scorsa
 * e mai più toccato lo è. Il giorno in cui l'ufficio guarda la lista vuole
 * vedere quello che sta marcendo, non quello che è semplicemente vecchio.
 *
 * Le soglie seguono la priorità: su un'urgenza un giorno di silenzio è già
 * troppo, su una richiesta a bassa priorità due settimane sono normali.
 */
import { TICKET_STATI_CHIUSI, type TicketStatus } from "@/types/tickets";

export const SOGLIE_GIORNI: Record<string, number> = {
  urgente: 1,
  alta: 3,
  normale: 7,
  media: 7,
  bassa: 14,
};

export type LivelloFermo = "ok" | "attenzione" | "critico";

export interface StatoFermo {
  giorni: number;
  livello: LivelloFermo;
  soglia: number;
  /** Frase pronta da mostrare, es. "ferma da 12 giorni". */
  etichetta: string;
}

interface TicketMinimo {
  status?: string | null;
  priority?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
}

function giorniDa(iso: string | null | undefined, adesso: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((adesso - t) / 86_400_000));
}

/**
 * Restituisce null per i ticket già chiusi: lì l'attesa non è un problema.
 * `adesso` è iniettabile per rendere il calcolo testabile senza orologio.
 */
export function calcolaFermo(t: TicketMinimo, adesso: number = Date.now()): StatoFermo | null {
  if (t.status && TICKET_STATI_CHIUSI.includes(t.status as TicketStatus)) return null;

  const ultimoMovimento = [t.last_message_at, t.updated_at, t.created_at]
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => b - a)[0];

  const giorni = ultimoMovimento
    ? Math.max(0, Math.floor((adesso - ultimoMovimento) / 86_400_000))
    : giorniDa(t.created_at, adesso);

  const soglia = SOGLIE_GIORNI[t.priority ?? "normale"] ?? 7;
  const livello: LivelloFermo =
    giorni >= soglia * 2 ? "critico" : giorni >= soglia ? "attenzione" : "ok";

  const etichetta =
    giorni === 0 ? "aggiornata oggi"
    : giorni === 1 ? "ferma da 1 giorno"
    : `ferma da ${giorni} giorni`;

  return { giorni, livello, soglia, etichetta };
}

export const CLASSI_FERMO: Record<LivelloFermo, string> = {
  ok: "text-muted-foreground",
  attenzione: "text-amber-600 font-semibold",
  critico: "text-red-600 font-semibold",
};
