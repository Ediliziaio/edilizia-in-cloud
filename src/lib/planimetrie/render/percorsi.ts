/**
 * Planimetrie nella sezione Render AI (fase 5b): gli indirizzi delle pagine.
 *
 * Un solo posto per gli ingressi che portano ad altre fasi: «Disegna» apre l'editor
 * (fase 2, `RenderPlanimetriaNuova` e `RenderPlanimetriaModifica`), «Carica PDF o foto» e
 * «Descrivi a parole» la generazione con l'AI (fase 3) e poi l'editor.
 */
export type ModoNuovaPianta = "disegno" | "documento" | "testo";

const BASE = "/azienda/render/planimetrie";

export const percorsiPlanimetrie = {
  elenco: BASE,
  pianta: (id: string) => `${BASE}/${id}`,
  /** Editor della fase 2 sulla pianta già creata. */
  modifica: (id: string) => `${BASE}/${id}/modifica`,
  /** Nuova pianta: disegno libero, da un PDF o una foto, da una descrizione. */
  nuova: (modo: ModoNuovaPianta, per?: { commessa: string; titolo: string; torna: string }) => {
    const q = new URLSearchParams({ da: modo });
    if (per) { q.set("commessa", per.commessa); q.set("titolo", per.titolo); q.set("torna", per.torna); }
    return `${BASE}/nuova?${q.toString()}`;
  },
  /** Render di una stanza della pianta. */
  renderStanza: (id: string, localeId: string, scelta: { livelloId: string; ambito: string }) =>
    `${BASE}/${id}/stanza/${encodeURIComponent(localeId)}?livello=${encodeURIComponent(scelta.livelloId)}&ambito=${encodeURIComponent(scelta.ambito)}`,
};
