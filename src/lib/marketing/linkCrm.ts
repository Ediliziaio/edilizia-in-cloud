/** Dove si apre la scheda di un contatto: `prefisso` è "/azienda/marketing" o "/admin/marketing". */
export function linkContatto(prefisso: string, contactId: string): string {
  return `${prefisso}/contatti/${encodeURIComponent(contactId)}`;
}

/** Un'opportunità non ha pagina sua: la apre la pagina Opportunità con ?apri=, che la cerca per id anche se vinta o persa. */
export function linkOpportunita(prefisso: string, opportunityId: string): string {
  return `${prefisso}/opportunita?apri=${encodeURIComponent(opportunityId)}`;
}
