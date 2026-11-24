/**
 * Quando un modulo caricato al volo fallisce, Vite emette `vite:preloadError`. Ricaricare serve solo se nel
 * frattempo è uscita una versione nuova (i file con l'hash vecchio non ci sono più). Se la versione è la stessa,
 * il modulo è rotto su questo browser (24/11/2026: pdfjs-dist 6 su Safari 17.3) e ricaricare fa solo perdere il
 * lavoro in corso: prima un documento caricato nella commessa non veniva mai registrato.
 * Safari dà lo stesso messaggio («Importing a module script failed») per i due casi, quindi si guarda il server.
 */

/** Lo script principale dell'app (`/assets/index-<hash>.js`) dentro un HTML. */
export function scriptPrincipale(html: string): string | null {
  const m = html.match(/<script[^>]*type=["']module["'][^>]*src=["']([^"']*\/assets[^\/"']*\/index-[^"']+\.js)["']/i)
    ?? html.match(/src=["']([^"']*\/assets[^\/"']*\/index-[^"']+\.js)["'][^>]*type=["']module["']/i);
  return m ? m[1] : null;
}

/** true se il server ha un index.html con uno script principale diverso da quello di questa pagina. */
export async function deployNuovo(
  fetchFn: typeof fetch = fetch,
  attuale: string | null = typeof document !== "undefined" ? scriptPrincipale(document.documentElement.outerHTML) : null,
): Promise<boolean> {
  // In sviluppo (niente hash) o se non si capisce: si mantiene il comportamento di prima, si ricarica.
  if (!attuale) return true;
  try {
    const risposta = await fetchFn(`/?__v=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
    if (!risposta.ok) return false;
    const online = scriptPrincipale(await risposta.text());
    return !!online && online !== attuale;
  } catch {
    // Senza rete ricaricare non aiuta.
    return false;
  }
}
