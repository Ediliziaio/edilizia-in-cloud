import type { jsPDF } from "jspdf";

/** Identità della voce, indipendente da numero, descrizione e ordine nell'editor. */
export const destinazioneVoceComputo = (id: string) => `computo.voce.${encodeURIComponent(id).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;

const destinazioni = new WeakMap<jsPDF, Map<string, { pagina: number; alto: number }>>();

/** Il riferimento viene registrato dopo la paginazione, sulla prima riga realmente stampata. */
export function segnaVoceComputoPdf(doc: jsPDF, id: string, y: number) {
  let mappa = destinazioni.get(doc);
  if (!mappa) {
    mappa = new Map(); destinazioni.set(doc, mappa);
    const riferimenti = mappa;
    doc.internal.events.subscribe("putCatalog", () => {
      const write = (doc.internal as jsPDF["internal"] & { write: (line: string) => void }).write;
      const voci = [...riferimenti].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([nome, d]) =>
        `(${nome}) [${doc.getPageInfo(d.pagina).objId} 0 R /XYZ null ${d.alto.toFixed(3)} null]`);
      write(`/Names << /Dests << /Names [${voci.join("\n")}] >> >>`);
    });
  }
  const nome = destinazioneVoceComputo(id);
  if (!mappa.has(nome)) mappa.set(nome, { pagina: doc.getCurrentPageInfo().pageNumber, alto: Math.max(0, doc.internal.pageSize.getHeight() - y) });
}
