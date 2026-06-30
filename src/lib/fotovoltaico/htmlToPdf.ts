// ─────────────────────────────────────────────────────────────────────────────
// htmlToPdf — converte l'HTML del preventivo FV (documento A4 self-contained,
// immagini base64 + grafici SVG inline) in un file .pdf scaricato dal browser.
// Usa html2canvas + jsPDF (già dipendenze del progetto), import dinamico per
// non appesantire il bundle iniziale. Ogni `.page` del template = 1 pagina A4.
//
// FONT: il template usa i Google Fonts Outfit/Inter Tight via <link>. html2canvas
// clona il documento in un iframe sandbox e NON fa in tempo a caricare i woff2
// esterni → ripiega su un serif di sistema (font sbagliato + spazi collassati).
// Fix a triplo presidio: (1) inlina i woff2 come @font-face base64; (2) registra
// i FontFace nel documento principale + iframe; (3) re-inietta i @font-face nel
// clone via onclone. Trade-off noto: pagine come immagini (testo non selezionabile).
// ─────────────────────────────────────────────────────────────────────────────

const A4_W_MM = 210;
const A4_H_MM = 297;
const A4_W_PX = 794; // larghezza A4 @96dpi per dimensionare l'iframe di rendering

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Scarica i Google Fonts referenziati nel documento e ne restituisce il CSS
 * @font-face con i woff2 inlinati come data-URI base64 (subset latin, che copre
 * l'italiano accentato). Aggiorna anche l'iframe rimuovendo il <link> esterno.
 * Ritorna "" se non ci sono Google Fonts o il fetch fallisce.
 */
async function inlineGoogleFonts(doc: Document): Promise<string> {
  const links = Array.from(
    doc.querySelectorAll<HTMLLinkElement>('link[href*="fonts.googleapis.com"]'),
  );
  let allCss = "";
  await Promise.all(
    links.map(async (link) => {
      try {
        const css = await (await fetch(link.href)).text();
        const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
        const latin = blocks.filter(
          (b) => !/unicode-range/.test(b) || /U\+0000/.test(b),
        );
        let inlined = latin.join("\n");
        const urls = Array.from(
          new Set(
            [...inlined.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(
              (m) => m[1],
            ),
          ),
        );
        await Promise.all(
          urls.map(async (u) => {
            try {
              const blob = await (await fetch(u)).blob();
              const dataUri = await new Promise<string>((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result as string);
                r.onerror = rej;
                r.readAsDataURL(blob);
              });
              inlined = inlined.split(u).join(dataUri);
            } catch {
              /* mantieni l'url originale per questo woff2 */
            }
          }),
        );
        const style = doc.createElement("style");
        style.textContent = inlined;
        doc.head?.appendChild(style);
        link.remove();
        allCss += inlined + "\n";
      } catch {
        /* lascia il <link>: si userà comunque il fallback */
      }
    }),
  );
  return allCss;
}

/**
 * Registra i @font-face (base64) come FontFace caricati nel documento principale
 * e nell'iframe, così il rendering canvas di html2canvas trova i font pronti.
 */
async function registerFonts(css: string, iframeDoc: Document): Promise<void> {
  if (!css || typeof FontFace === "undefined") return;
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  const jobs: Promise<void>[] = [];
  for (const b of blocks) {
    const fam = (b.match(/font-family:\s*['"]?([^;'"}]+)/) ?? [])[1]?.trim();
    const weight = (b.match(/font-weight:\s*([\d ]+)/) ?? [])[1]?.trim() || "400";
    const src = (b.match(/url\((data:[^)]+)\)/) ?? [])[1];
    if (!fam || !src) continue;
    try {
      const face = new FontFace(fam, `url(${src})`, { weight });
      jobs.push(
        face.load().then((loaded) => {
          try {
            (document as Document).fonts.add(loaded);
          } catch {
            /* noop */
          }
          try {
            iframeDoc.fonts.add(loaded);
          } catch {
            /* noop */
          }
        }),
      );
    } catch {
      /* descrittore non valido: salta */
    }
  }
  await Promise.allSettled(jobs);
}

/**
 * Renderizza l'HTML in un iframe off-screen, cattura ogni pagina A4 e produce
 * un PDF multipagina scaricato come `${filename}.pdf`.
 *
 * @throws se html2canvas/jsPDF falliscono o l'HTML non è renderizzabile.
 */
export async function scaricaPreventivoComePdf(
  html: string,
  filename: string,
): Promise<void> {
  const [{ default: html2canvas }, jspdf] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const JsPDF = jspdf.jsPDF;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${A4_W_PX}px`;
  iframe.style.height = "1123px";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Impossibile creare il documento di rendering.");
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise<void>((resolve) => {
      if (doc.readyState === "complete") resolve();
      else iframe.addEventListener("load", () => resolve(), { once: true });
    });

    // Font: inlina + registra (vedi nota in testa al file).
    const fontCss = await inlineGoogleFonts(doc);
    await registerFonts(fontCss, doc);
    try {
      await doc.fonts?.ready;
    } catch {
      /* fonts API non disponibile */
    }
    await wait(350);

    const win = iframe.contentWindow!;
    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".page"));
    const targets = pages.length > 0 ? pages : [doc.body];

    const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: A4_W_PX,
        windowHeight: el.scrollHeight || 1123,
        // @ts-expect-error: opzione runtime supportata, non nei typings
        window: win,
        onclone: (clonedDoc: Document) => {
          // Re-inietta i @font-face base64 nel clone di html2canvas.
          if (fontCss) {
            const s = clonedDoc.createElement("style");
            s.textContent = fontCss;
            clonedDoc.head?.appendChild(s);
          }
        },
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      if (i > 0) pdf.addPage();
      if (pages.length > 0) {
        pdf.addImage(imgData, "JPEG", 0, 0, A4_W_MM, A4_H_MM, undefined, "FAST");
      } else {
        const h = (canvas.height * A4_W_MM) / canvas.width;
        pdf.addImage(imgData, "JPEG", 0, 0, A4_W_MM, h, undefined, "FAST");
      }
    }

    const safe = filename.replace(/[^\w.\-]+/g, "_").replace(/\.pdf$/i, "");
    pdf.save(`${safe}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
