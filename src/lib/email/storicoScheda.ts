/**
 * Le email scritte dalla scheda di un cliente o di un committente fanno parte
 * della sua storia: le vede chiunque apra la scheda, anche se sono partite da
 * una casella personale, e lo stesso vale per le risposte. Il resto della
 * casella personale resta privato (vedi la migrazione 20280926021000).
 *
 * Si segnano solo dopo l'invio riuscito: la vista dello storico non guarda se
 * la spedizione è fallita, e un'email mai partita risulterebbe mandata.
 */
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

export async function segnaNelloStoricoScheda(outboxId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("email_outbox").update({ origine: "conversazioni" }).eq("id", outboxId);
  // L'email è partita: se non si riesce a segnarla, non è un invio fallito.
  if (error) logger.error("segnaNelloStoricoScheda", error);
}

export interface EmailDellaCasella {
  id?: string | null;
  subject?: string | null;
  received_at?: string | null;
}

export interface MessaggioStorico {
  canale: string;
  direzione: string;
  controparte?: string | null;
  oggetto: string | null;
  testo: string | null;
  ts: string;
  ref_id: string;
}

const STESSA_SPEDIZIONE_MS = 15 * 60_000;
const oggettoPulito = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Lo storico condiviso, meno ciò che chi guarda ha già dalla propria casella:
 * la stessa email ricevuta, e la copia di quella che ha mandato lui.
 */
export function storicoSenzaDoppioni<T extends MessaggioStorico>(messaggi: T[], casella: EmailDellaCasella[]): T[] {
  const ids = new Set(casella.map((e) => e.id).filter(Boolean));
  const ricevute = new Set<string>();
  return messaggi.filter((m) => {
    if (m.canale !== "email") return true;
    if (ids.has(m.ref_id)) return false;
    if (m.direzione !== "out") {
      // La stessa risposta arrivata a due colleghi con la casella collegata è una riga per ciascuno.
      const chiave = `${(m.controparte ?? "").toLowerCase()}|${oggettoPulito(m.oggetto)}|${m.ts}`;
      if (ricevute.has(chiave)) return false;
      ricevute.add(chiave);
      return true;
    }
    const quando = new Date(m.ts).getTime();
    return !casella.some((e) =>
      oggettoPulito(e.subject) === oggettoPulito(m.oggetto) &&
      Math.abs(new Date(e.received_at ?? 0).getTime() - quando) < STESSA_SPEDIZIONE_MS);
  });
}
