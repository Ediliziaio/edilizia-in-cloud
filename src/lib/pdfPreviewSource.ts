/**
 * Keep the original Blob alongside its download URL. Canvas previews must not
 * fetch(blob:): production CSP blocks that request and slow lazy imports can
 * outlive URL revocation. Taking the Blob synchronously gives each reader its
 * own lifetime without changing CSP or exposing a storage URL.
 */
const sources = new Map<string, Blob>();

export function createPdfPreviewUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  sources.set(url, blob);
  return url;
}

export function revokePdfPreviewUrl(url: string): void {
  sources.delete(url);
  URL.revokeObjectURL(url);
}

/**
 * Il PDF dell'anteprima come file, per caricarlo o mandarlo. Si prende dalla memoria, senza `fetch(blob:)`: la
 * sicurezza del sito (connect-src) lo vieta, e il browser risponde «Load failed» (Safari) o «Failed to fetch» (Chrome).
 * Per «Invia per la firma» dei preventivatori edili fu il motivo dell'errore «Invio non riuscito».
 */
export async function readPdfPreviewBlob(url: string): Promise<Blob> {
  const blob = sources.get(url);
  if (blob) return blob;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PDF non disponibile (${response.status})`);
  return response.blob();
}

export function readPdfPreview(url: string): Promise<ArrayBuffer> {
  const blob = sources.get(url);
  if (blob) return blob.arrayBuffer();
  // Compatibility for HTTP sources and callers outside the preview renderers.
  return fetch(url).then(response => {
    if (!response.ok) throw new Error(`PDF non disponibile (${response.status})`);
    return response.arrayBuffer();
  });
}
