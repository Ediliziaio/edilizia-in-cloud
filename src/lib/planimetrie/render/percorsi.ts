/**
 * Planimetrie è uno spazio autonomo, collegato ai render delle sue stanze.
 *
 * Un solo posto per gli ingressi che portano ad altre fasi: «Disegna» apre l'editor
 * (fase 2, `RenderPlanimetriaNuova` e `RenderPlanimetriaModifica`), «Carica PDF o foto» e
 * «Descrivi a parole» la generazione con l'AI (fase 3) e poi l'editor.
 */
export type ModoNuovaPianta = "disegno" | "documento" | "testo" | "sopralluogo";

const BASE = "/azienda/planimetrie";
const BASE_LEGACY = "/azienda/render/planimetrie";

/** Mantiene preferiti, PDF e link già inviati, compresi piano, variante e stanza. */
export function percorsoPlanimetriaAttuale(pathname: string, search = "", hash = ""): string {
  const path = pathname === BASE_LEGACY || pathname.startsWith(`${BASE_LEGACY}/`) ? BASE + pathname.slice(BASE_LEGACY.length) : BASE;
  return `${path}${search}${hash}`;
}

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
  renderStanza: (id: string, localeId: string, scelta: { livelloId: string; ambito: string; materialiAmbito?: string }) =>
    `${BASE}/${id}/stanza/${encodeURIComponent(localeId)}?livello=${encodeURIComponent(scelta.livelloId)}&ambito=${encodeURIComponent(scelta.ambito)}${scelta.materialiAmbito && scelta.materialiAmbito !== scelta.ambito ? `&materiali_ambito=${encodeURIComponent(scelta.materialiAmbito)}` : ""}`,
};
