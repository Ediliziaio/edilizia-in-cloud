/**
 * Planimetrie nella sezione Render AI (fase 5b): gli indirizzi delle pagine.
 *
 * Un solo posto per gli ingressi che portano ad altre fasi: «Disegna» apre l'editor
 * (fase 2), «Carica PDF o foto» e «Descrivi a parole» la generazione con l'AI (fase 3).
 * Finché quelle pagine non sono collegate, gli ingressi portano a
 * `RenderPlanimetriaIngresso`, che lo dice in chiaro. Chi unisce i rami cambia solo qui
 * (e le rotte in src/routes/companyRoutes.tsx).
 */
export type ModoNuovaPianta = "disegno" | "documento" | "testo";

const BASE = "/azienda/render/planimetrie";

export const percorsiPlanimetrie = {
  elenco: BASE,
  pianta: (id: string) => `${BASE}/${id}`,
  /** Editor della fase 2 sulla pianta già creata. */
  modifica: (id: string) => `${BASE}/${id}/modifica`,
  /** Nuova pianta: disegno libero, da un PDF o una foto, da una descrizione. */
  nuova: (modo: ModoNuovaPianta) => `${BASE}/nuova?da=${modo}`,
  /** Render di una stanza della pianta. */
  renderStanza: (id: string, localeId: string, scelta: { livelloId: string; ambito: string }) =>
    `${BASE}/${id}/stanza/${encodeURIComponent(localeId)}?livello=${encodeURIComponent(scelta.livelloId)}&ambito=${encodeURIComponent(scelta.ambito)}`,
};
