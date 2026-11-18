/**
 * Il testo di ogni pagina di un PDF, letto nel browser con pdfjs (nessuna AI, nessun costo).
 * Serve a ricontrollare sul documento quello che l'AI ha letto (contrattoNelTesto.ts).
 */
export async function testoPaginePdf(dati: ArrayBuffer, maxPagine = 80): Promise<string[]> {
  const lib = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  if (typeof worker === "string" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = worker;
  const caricamento = lib.getDocument({ data: new Uint8Array(dati.slice(0)) });
  const doc = await caricamento.promise;
  const pagine: string[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPagine); p++) {
      const contenuto = await (await doc.getPage(p)).getTextContent();
      pagine.push(contenuto.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
  } finally {
    await caricamento.destroy();
  }
  return pagine;
}
