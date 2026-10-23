/**
 * «Cosa fare adesso» nella scheda cliente (23/10/2026): le azioni che i dati
 * chiedono, dalla più urgente. I numeri della testata dicono che c'è un
 * problema; qui c'è il tasto per risolverlo.
 */
import type { PreventivoRow, RataRow, TicketRow } from "@/components/clients/CustomerBusinessTabs";
import { euro } from "@/lib/clienti/schedaCliente";

export type AzioneSuggerita =
  | { tipo: "sollecito"; importo: number; giorni: number; commesse: string[] }
  | { tipo: "preventivo"; id: string; numero: string | null; giorni: number; totale: number | null }
  | { tipo: "assistenza"; id: string; titolo: string | null; giorni: number };

/** Preventivi che aspettano una risposta dal cliente. */
const PREVENTIVO_IN_ATTESA = new Set(["in_corso", "inviata", "inviato", "visualizzata", "visualizzato", "sent"]);
const TICKET_CHIUSO = new Set(["risolto", "chiuso", "annullato", "preventivo_rifiutato", "closed", "resolved"]);
/** Dopo quanti giorni un preventivo senza risposta va richiamato. */
export const GIORNI_PREVENTIVO = 7;
/** Dopo quanti giorni una richiesta di assistenza aperta va guardata. */
export const GIORNI_ASSISTENZA = 3;

function giorniDa(data: string | null | undefined, oggi: string): number {
  if (!data) return 0;
  const inizio = Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10));
  const fine = Date.UTC(+oggi.slice(0, 4), +oggi.slice(5, 7) - 1, +oggi.slice(8, 10));
  return Math.max(0, Math.round((fine - inizio) / 86_400_000));
}

export function azioniSuggerite(
  dati: { rate: RataRow[]; preventivi: PreventivoRow[]; tickets: TicketRow[] },
  oggi: string,
): AzioneSuggerita[] {
  const azioni: AzioneSuggerita[] = [];

  const scadute = dati.rate.filter((r) => r.scaduta && (r.residuo ?? 0) > 0);
  if (scadute.length > 0) {
    const piuVecchia = scadute.reduce((min, r) => (r.scadenza && (!min || r.scadenza < min) ? r.scadenza : min), null as string | null);
    azioni.push({
      tipo: "sollecito",
      importo: scadute.reduce((s, r) => s + (r.residuo ?? 0), 0),
      giorni: giorniDa(piuVecchia, oggi),
      commesse: [...new Set(scadute.map((r) => r.order_code).filter((c): c is string => !!c))],
    });
  }

  const fermo = dati.preventivi
    .filter((p) => PREVENTIVO_IN_ATTESA.has(String(p.status ?? "")) && giorniDa(p.created_at?.slice(0, 10), oggi) >= GIORNI_PREVENTIVO)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
  if (fermo) {
    azioni.push({ tipo: "preventivo", id: fermo.id, numero: fermo.quote_number, giorni: giorniDa(fermo.created_at.slice(0, 10), oggi), totale: fermo.total });
  }

  const ticket = dati.tickets
    .filter((t) => !TICKET_CHIUSO.has(String(t.status ?? "")) && giorniDa(t.created_at?.slice(0, 10), oggi) >= GIORNI_ASSISTENZA)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
  if (ticket) {
    azioni.push({ tipo: "assistenza", id: ticket.id, titolo: ticket.title, giorni: giorniDa(ticket.created_at.slice(0, 10), oggi) });
  }

  return azioni;
}


/** Il testo del sollecito: cortese, con l'importo e la commessa. Lo si legge e si cambia prima di mandarlo. */
export function testoSollecito(a: Extract<AzioneSuggerita, { tipo: "sollecito" }>, cliente: string, azienda: string): { oggetto: string; testo: string } {
  const commesse = a.commesse.length ? ` (${a.commesse.length === 1 ? "commessa" : "commesse"} ${a.commesse.join(", ")})` : "";
  return {
    oggetto: `Promemoria pagamento${a.commesse.length === 1 ? ` — ${a.commesse[0]}` : ""}`,
    testo: [
      `Gentile ${cliente},`,
      `le ricordiamo che risulta ancora da saldare l'importo di ${euro(a.importo, true)}${commesse}.`,
      "Se ha già provveduto al pagamento, non tenga conto di questo messaggio e ci scusi per il disturbo.",
      `Cordiali saluti,\n${azienda}`,
    ].join("\n\n"),
  };
}
