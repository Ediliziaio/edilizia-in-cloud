const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const idComputoValido = (id: string) => UUID.test(id);
export const percorsoComputoCommessa = (orderId: string, computoId: string) => `/azienda/ordini/${encodeURIComponent(orderId)}?tab=articoli&computo=${encodeURIComponent(computoId)}`;
export function idComputoNativo(source: unknown): string | null {
  const id = typeof source === "string" && source.startsWith("modulo:computo:") ? source.slice("modulo:computo:".length) : "";
  return UUID.test(id) ? id : null;
}
export const percorsoComputoNativo = (id: string) => `/azienda/marketing/preventivi/computo?bozza=${encodeURIComponent(id)}&esistente=1`;
export const percorsoNuovoComputoDallaPianta = (id: string, livelloId: string, propostaId?: string, contactId?: string | null) =>
  `/azienda/marketing/preventivi/computo?${new URLSearchParams({
    fase: "3", pianta: id, livello: livelloId, ...(propostaId ? { proposta: propostaId } : {}), ...(contactId ? { contact_id: contactId } : {}),
  })}`;
