// ─────────────────────────────────────────────────────────────────────────────
// htmlToPdf — "Scarica PDF" del preventivo FV via STAMPA NATIVA del browser.
//
// Storia: prima qui c'era una pipeline html2canvas + jsPDF che fotografava le
// pagine in JPEG. Risultato: PDF DIVERSO dall'anteprima (gradienti/backdrop-filter
// persi, letter-spacing sbagliato, font in fallback se i woff2 non arrivavano in
// tempo, pagine oltre 297mm schiacciate, testo raster non selezionabile).
//
// Ora: l'HTML (che ha già `@page A4` + `print-color-adjust: exact`, pensato per
// la stampa) viene caricato in un iframe nascosto e stampato col motore NATIVO
// del browser → il PDF salvato è identico all'anteprima per definizione, testo
// vettoriale selezionabile. L'utente sceglie "Salva come PDF" nel dialog; il
// titolo del documento diventa il nome file suggerito.
// ─────────────────────────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Apre il dialog di stampa del browser sull'HTML del preventivo (iframe
 * off-screen). Fedeltà 1:1 con l'anteprima: stesso motore di rendering.
 *
 * L'iframe resta montato finché il dialog è aperto (rimuoverlo prima rompe la
 * stampa su alcuni browser): cleanup su `afterprint` con fallback a 3 minuti.
 *
 * @param html    documento self-contained del preventivo (da storage fv-progetti)
 * @param titolo  nome file suggerito dal browser per "Salva come PDF"
 */
export async function stampaPreventivoNativo(
  html: string,
  titolo: string,
): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  };

  try {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) throw new Error("Impossibile preparare la stampa.");

    doc.open();
    doc.write(html);
    doc.close();

    await new Promise<void>((resolve) => {
      if (doc.readyState === "complete") resolve();
      else iframe.addEventListener("load", () => resolve(), { once: true });
    });

    // Nome file suggerito nel dialog "Salva come PDF".
    doc.title = titolo.replace(/[^\w.\- ]+/g, "_");

    // Aspetta font (Google Fonts via <link> caricano normalmente nell'iframe
    // nativo) e immagini prima di stampare, per non stampare placeholder.
    try {
      await doc.fonts?.ready;
    } catch {
      /* Fonts API non disponibile */
    }
    const imgs = Array.from(doc.images ?? []);
    await Promise.allSettled(
      imgs
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise<void>((res) => {
              img.addEventListener("load", () => res(), { once: true });
              img.addEventListener("error", () => res(), { once: true });
            }),
        ),
    );
    await wait(150);

    win.addEventListener("afterprint", cleanup, { once: true });
    win.focus();
    win.print();

    // Fallback: alcuni browser non emettono afterprint sull'iframe.
    setTimeout(cleanup, 180_000);
  } catch (e) {
    cleanup();
    throw e;
  }
}
