import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type DisegnaPagina = (pagina: number) => Promise<{ canvas: HTMLCanvasElement; pagine: number }>;

export async function conPaginePdf<T>(file: Blob, latoMassimo: number, usaPagine: (disegna: DisegnaPagina) => Promise<T>): Promise<T> {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const caricamento = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs-wasm/`,
  });
  try {
    const documento = await caricamento.promise;
    return await usaPagine(async (pagina) => {
      const numero = Math.min(Math.max(1, pagina), documento.numPages);
      const foglio = await documento.getPage(numero);
      try {
        const base = foglio.getViewport({ scale: 1 });
        const viewport = foglio.getViewport({ scale: latoMassimo / Math.max(base.width, base.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const contesto = canvas.getContext("2d");
        if (!contesto) throw new Error("PDF non disegnato.");
        contesto.fillStyle = "#ffffff";
        contesto.fillRect(0, 0, canvas.width, canvas.height);
        await foglio.render({ canvasContext: contesto, viewport, canvas }).promise;
        return { canvas, pagine: documento.numPages };
      } finally {
        foglio.cleanup();
      }
    });
  } finally {
    await caricamento.destroy();
  }
}
