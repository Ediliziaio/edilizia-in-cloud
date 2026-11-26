import { fileInCache } from "./fileCache";
import { readPdfPreviewBlob } from "@/lib/pdfPreviewSource";

/** L'app resta aperta sotto il visualizzatore del telefono; mai navigare la WebView sul file. */
export async function apriDocumentoNativo(url: string, nome = "documento"): Promise<void> {
  const indirizzo = new URL(url);
  const protocollo = indirizzo.protocol;
  const fileLocale = indirizzo.protocol === window.location.protocol && indirizzo.host === window.location.host && indirizzo.pathname.startsWith('/_capacitor_file_/');
  if (!["https:", "http:", "blob:"].includes(protocollo) && !fileLocale) throw new Error("Indirizzo del documento non valido.");
  const { FileViewer } = await import("@capacitor/file-viewer");
  if (protocollo === "blob:" || fileLocale || !/\.[a-z0-9]{1,10}$/i.test(indirizzo.pathname)) {
    // Le anteprime conservano il Blob originale: fetch(blob:) è vietato dalla CSP di produzione.
    const path = await fileInCache(await readPdfPreviewBlob(url), nome);
    await FileViewer.openDocumentFromLocalPath({ path });
  } else {
    await FileViewer.openDocumentFromUrl({ url });
  }
}
