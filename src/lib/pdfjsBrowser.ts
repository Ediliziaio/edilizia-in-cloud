/** Vite in sviluppo può restituire il modulo del worker al posto dell'URL. */
export async function caricaPdfJsBrowser() {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  const indirizzo = typeof worker.default === "string" && worker.default
    ? worker.default : import.meta.env.DEV ? "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs" : null;
  if (!indirizzo) throw new Error("Il lettore PDF non si è caricato: ricarica la pagina e riprova.");
  pdfjs.GlobalWorkerOptions.workerSrc = indirizzo;
  return pdfjs;
}
