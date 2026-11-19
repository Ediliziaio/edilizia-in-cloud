import type { FormatoVerbaleSal } from "./formatiVerbaleSal";

type BloccoPdf = Record<string, unknown>;
type FormatoScaricabile = Exclude<FormatoVerbaleSal, "sintetico">;

const INCHIOSTRO = "#182437";
const TESTO_TENUE = "#526174";
const LINEA = "#DCE3ED";
const FONDO = "#F2F5F9";
const testo = (n: Element | null | undefined) => n?.textContent?.replace(/\s+/g, " ").trim() ?? "";

function tabellaSal(tabella: HTMLTableElement, accento: string): BloccoPdf {
  const lavorazioni = tabella.classList.contains("sal-lavorazioni");
  const colonne = tabella.rows[0]?.cells.length ?? 2;
  const quantitaCumulativa = lavorazioni && !!tabella.querySelector(".voce-dettaglio .qta");
  const larghezze = lavorazioni
    ? colonne === 8
      ? quantitaCumulativa ? [13, "*", 57, 54, 25, 31, 54, 51, 55] : [14, "*", 61, 28, 35, 63, 58, 58]
      : colonne === 4 ? [16, "*", 92, 93]
      : quantitaCumulativa ? [16, "*", 72, 76, 73, 82] : [16, "*", 78, 74, 83]
    : ["*", 87];
  const body = Array.from(tabella.rows, (riga) => {
    const intestazione = riga.parentElement?.tagName === "THEAD";
    const fase = riga.classList.contains("riga-fase");
    const totale = riga.classList.contains("totale");
    return Array.from(riga.cells).flatMap((cella, i) => {
      const qta = cella.querySelector(".voce-dettaglio .qta");
      const nome = qta ? testo(cella.querySelector(".voce-dettaglio > span"))
        : cella.querySelector(":scope > .nota")
          ? Array.from(cella.childNodes, (n) => n.textContent?.trim()).filter(Boolean).join(" · ")
          : testo(cella);
      const blocco = {
        text: nome,
        colSpan: cella.colSpan,
        alignment: lavorazioni && i === 0 && cella.colSpan === 1 ? "center"
          : cella.classList.contains("num") || (intestazione && i > 1) ? "right" : "left",
        bold: intestazione || fase || totale || riga.classList.contains("forte") || cella.classList.contains("quota"),
        color: intestazione ? "#FFFFFF" : cella.classList.contains("quota") ? accento : INCHIOSTRO,
        fillColor: intestazione ? accento : fase || totale ? FONDO : undefined,
        fontSize: lavorazioni && colonne === 8 ? 8 : 8.5,
      };
      const celle: BloccoPdf[] = [blocco, ...Array.from({ length: cella.colSpan - 1 }, () => ({}))];
      if (quantitaCumulativa && i === 1) {
        celle.push({ ...blocco, text: intestazione ? "Quantità a oggi" : testo(qta), color: intestazione ? "#FFFFFF" : TESTO_TENUE, alignment: "right" });
      }
      return celle;
    });
  });
  return {
    unbreakable: !lavorazioni,
    table: { widths: larghezze, body, headerRows: tabella.tHead?.rows.length ?? 0, dontBreakRows: true },
    layout: {
      vLineWidth: () => 0, hLineWidth: () => 0.45, hLineColor: () => LINEA,
      paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3,
    },
  };
}

function bloccoSal(elemento: HTMLElement, accento: string): BloccoPdf | null {
  if (elemento.tagName === "TABLE") return tabellaSal(elemento as HTMLTableElement, accento);
  const contenuto = testo(elemento);
  if (!contenuto || contenuto.startsWith("Barra: in grigio")) return null;
  if (elemento.matches("p, .etichetta, .numero, .nota, .doc-sezione, .riferimenti") || !elemento.children.length) {
    const numero = elemento.classList.contains("numero");
    const etichetta = elemento.classList.contains("etichetta");
    const nota = elemento.matches(".nota, .riferimenti");
    return {
      text: contenuto, color: etichetta || nota ? TESTO_TENUE : INCHIOSTRO,
      bold: numero || elemento.classList.contains("doc-sezione") || contenuto.startsWith("BOZZA -"),
      fontSize: numero ? 14 : etichetta || nota ? 8 : 9,
      margin: [0, 0, 0, elemento.tagName === "P" ? 6 : 2],
    };
  }
  const figli = Array.from(elemento.children, (e) => bloccoSal(e as HTMLElement, accento)).filter(Boolean);
  // La scheda del committente può contenere il nome prima del nodo con l'indirizzo.
  const direttamente = Array.from(elemento.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent?.trim()).filter(Boolean).join(" ");
  if (direttamente) figli.unshift({ text: direttamente, margin: [0, 0, 0, 2] });
  if (elemento.style.breakInside === "avoid") {
    return {
      unbreakable: true,
      columns: Array.from(elemento.children, (r) => ({
        stack: [
          { text: testo(r.firstElementChild).toUpperCase(), fontSize: 8, color: TESTO_TENUE },
          { text: testo(r.lastElementChild), fontSize: 7.5, color: TESTO_TENUE, margin: [0, 20, 0, 0] },
        ],
      })),
      columnGap: 12,
    };
  }
  const corpo = elemento.style.display === "flex" && figli.length > 1
    ? { columns: figli, columnGap: 10 } : { stack: figli };
  if (!elemento.classList.contains("doc-riquadro")) return corpo;
  return {
    table: { widths: ["*"], body: [[{ ...corpo, fillColor: FONDO }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 7, paddingBottom: () => 5, paddingLeft: () => 8 },
  };
}

function righePiede(doc: Document, css: string) {
  const proprio = Array.from(doc.querySelectorAll(".piede-proprio > div"), testo).filter(Boolean);
  if (proprio.length) return proprio;
  const fonti = css.match(/@bottom-center\s*\{\s*content:\s*([^;]+);/)?.[1] ?? "";
  return Array.from(fonti.matchAll(/"((?:\\.|[^"\\])*)"/g), ([, riga]) => riga)
    .filter(riga => riga !== "\\A " && riga !== "Pag. " && riga !== " / ")
    .map(riga => riga.replace(/\\(3C |["\\])/g, (_, carattere: string) => carattere === "3C " ? "<" : carattere));
}

async function caricaLogo(src: string | null) {
  if (!src) return null;
  const compatibile = /^data:image\/(png|jpeg);base64,/i;
  if (compatibile.test(src)) return src;
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const response = await fetch(src, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(2500) });
    if (!response.ok || !/^image\/(png|jpeg)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" && compatibile.test(reader.result) ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Impagina il verbale validato dall'app come PDF con testo selezionabile e intestazioni ripetute. */
export async function generaVerbaleSalScaricabile(html: string, formato: FormatoScaricabile): Promise<Uint8Array> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const pagina = doc.querySelector(".page");
  const tabella = pagina?.querySelector<HTMLTableElement>(".sal-lavorazioni");
  const testata = pagina?.querySelector(".doc-testata");
  if (!pagina || !testata || !tabella?.rows.length) throw new Error("Il verbale non contiene una tabella SAL valida.");

  const css = doc.querySelector("style")?.textContent ?? "";
  const accento = css.match(/--accent:\s*(#[\dA-Fa-f]{6})(?=\s*[;}])/)?.[1] ?? "#243C63";
  const piede = righePiede(doc, css);
  const [modulo, font, logo] = await Promise.all([
    import("pdfmake/build/pdfmake.min.js"), import("pdfmake/build/vfs_fonts.js"),
    caricaLogo(testata.querySelector(".logo img")?.getAttribute("src") ?? null),
  ]);
  modulo.default.addVirtualFileSystem(font.default);
  const titolo = testo(testata.querySelector("h1"));
  const sottotitolo = testo(testata.querySelector(".sotto")) + (formato === "completo" ? " · Cumulativo" : "");
  const content: BloccoPdf[] = [{
    columns: [
      logo ? { image: logo, fit: [155, 42] } : { text: testo(testata.querySelector(".logo")) || piede[0] || "", fontSize: 13, bold: true },
      { stack: [{ text: titolo, fontSize: 16, bold: true }, { text: sottotitolo, margin: [0, 4, 0, 0] }, { text: testo(testata.querySelector(".doc-etichetta")), color: accento, fontSize: 8, margin: [0, 3, 0, 0] }], alignment: "right", width: "64%" },
    ],
    columnGap: 12, margin: [0, 0, 0, 8],
  }, {
    canvas: [{ type: "line", x1: 0, x2: 523, y1: 0, y2: 0, lineWidth: 1.2, lineColor: accento }], margin: [0, 0, 0, 10],
  }];
  for (const e of Array.from(pagina.children)) {
    if (e === testata || e.classList.contains("riferimenti")) continue;
    const blocco = bloccoSal(e as HTMLElement, accento);
    if (blocco) content.push({ stack: [blocco], margin: [0, 0, 0, 7] });
  }
  const definizione = {
    pageSize: "A4", pageMargins: [36, 34, 36, Math.max(35, 23 + 9 * piede.length)],
    info: { title: doc.title, subject: sottotitolo }, defaultStyle: { font: "Roboto", fontSize: 9, color: INCHIOSTRO },
    content,
    footer: (pagina: number, pagine: number) => ({
      text: [...piede, `Pag. ${pagina} / ${pagine}`].join("\n"), color: TESTO_TENUE, fontSize: 7, alignment: "center", margin: [36, 5, 36, 0],
    }),
  };
  return modulo.default.createPdf(definizione as never).getBuffer();
}
