/** I sopralluoghi nelle Vendite: ordine e indirizzo del nuovo (piano sopralluoghi, lotto 3). */

export interface RilievoVendita {
  id: string;
  code: string | null;
  status: string;
  tipo: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  opportunity_id: string | null;
  order_id: string | null;
  estimate_id: string | null;
  created_at: string;
}

/** Prima quelli dell'opportunità, poi gli altri del contatto; dentro, i più recenti in cima. */
export function ordinaRilieviVendita(righe: RilievoVendita[], opportunityId: string | null | undefined): RilievoVendita[] {
  const peso = (r: RilievoVendita) => (opportunityId && r.opportunity_id === opportunityId ? 0 : 1);
  return [...righe].sort((a, b) => peso(a) - peso(b) || b.created_at.localeCompare(a.created_at));
}

export function percorsoNuovoSopralluogo(contactId: string | null | undefined, opportunityId: string | null | undefined, tipo: "commerciale" | "tecnico") {
  const p = new URLSearchParams();
  if (contactId) p.set("contact", contactId);
  if (opportunityId) p.set("opportunity", opportunityId);
  p.set("tipo", tipo);
  return `/azienda/sopralluoghi/nuovo?${p.toString()}`;
}
