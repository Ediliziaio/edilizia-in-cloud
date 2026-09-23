/**
 * A chi resta attaccata un'attività (23/09/2026).
 *
 * Fino a ieri i collegamenti dipendevano dalla CATEGORIA: un'attività creata
 * dall'opportunità con categoria «Opportunità» perdeva il contatto, e una con
 * categoria «Altro» perdeva tutto, anche quando nasceva dentro la scheda del
 * cliente. Elena (Ener Italia) ne ha creata una dall'opportunità e se l'è
 * ritrovata slegata dal contatto.
 *
 * Regola: l'attività resta attaccata a ciò da cui nasce, qualunque categoria
 * abbia. Se è legata a un'opportunità ma nessuno ha scelto il contatto, prende
 * quello dell'opportunità: così si vede anche nella scheda del cliente.
 */

export interface ScelteCollegamento {
  contactId?: string | null;
  opportunityId?: string | null;
  orderId?: string | null;
  stockItemId?: string | null;
  costId?: string | null;
  ticketId?: string | null;
}

export interface CollegamentiAttivita {
  contact_id: string | null;
  opportunity_id: string | null;
  order_id: string | null;
  stock_item_id: string | null;
  cost_id: string | null;
  ticket_id: string | null;
}

/** «none» è il valore con cui i menu dicono «nessuno»: non è un id. */
export function idScelto(valore?: string | null): string | null {
  const v = (valore ?? "").trim();
  return v && v !== "none" ? v : null;
}

export function collegamentiAttivita(
  scelte: ScelteCollegamento,
  contattoDellOpportunita?: string | null,
): CollegamentiAttivita {
  const opportunity_id = idScelto(scelte.opportunityId);
  const contact_id = idScelto(scelte.contactId) ?? (opportunity_id ? idScelto(contattoDellOpportunita) : null);
  return {
    contact_id,
    opportunity_id,
    order_id: idScelto(scelte.orderId),
    stock_item_id: idScelto(scelte.stockItemId),
    cost_id: idScelto(scelte.costId),
    ticket_id: idScelto(scelte.ticketId),
  };
}
