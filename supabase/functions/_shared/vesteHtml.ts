/**
 * La veste propria dell'azienda (personalizzazioneDocumenti) nei documenti HTML che il browser stampa da sé, a
 * contenuto che scorre: verbale SAL e giornale dei lavori (10/11/2026).
 *
 * A differenza di fvHtmlTemplate, qui le pagine non sono disegnate a mano: le taglia la stampa. Quindi:
 * - le righe del piè stanno in un elemento `position: fixed; bottom: 0`, che Chrome ripete in fondo a ogni foglio;
 * - lo spazio sotto il contenuto lo tiene il `tfoot` di una tabella che avvolge tutto il documento (`apri`/`chiudi`),
 *   ripetuto anche lui su ogni foglio: senza, l'ultima riga di testo finirebbe sotto il piè;
 * - il numero di pagina va nel margine del foglio (`@bottom-center`), l'unico posto dove la stampa lo conosce.
 *
 * Per chi non ha un piè proprio `vesteHtml` è tutta stringa vuota: il piè lo dà `piedeSocietarioCss`, quello dello
 * stile unico (stileDocumenti.ts): righe societarie centrate e «Pag. n / m» sotto, nel margine di ogni foglio.
 * Modulo puro, senza import esterni: lo usano edge e test.
 */
import { misurePiede, personalizzazioneDocumento, urlFontPiede } from "./personalizzazioneDocumenti.ts";
import { accentoDocumento, colore as coloreStile, pagina } from "./stileDocumenti.ts";

export interface VesteHtml {
  attiva: boolean;
  /** Da mettere in fondo allo <style> del documento: vince sulle regole di prima. */
  css: string;
  /** Dopo <body>: il piè e l'apertura della tabella che tiene lo spazio. */
  apri: string;
  /** Prima di </body>. */
  chiudi: string;
  /** Lo stile dell'<img> del logo grande; null = il logo di sempre. */
  stileLogo: string | null;
}

const VUOTA: VesteHtml = Object.freeze({ attiva: false, css: "", apri: "", chiudi: "", stileLogo: null });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `larghezzaUtileMm`: la larghezza del foglio meno i margini di @page del documento. */
export function vesteHtml(companyId: string | null | undefined, larghezzaUtileMm: number): VesteHtml {
  const v = personalizzazioneDocumento(companyId);
  const m = misurePiede(v, (larghezzaUtileMm * 72) / 25.4);
  if (!v.piedeRighe?.length || !m) return VUOTA;
  const font = `'${v.piedeFont ?? "EB Garamond"}', 'Times New Roman', serif`;
  const colore = v.piedeColore ?? "#1C1650";
  const righe = v.piedeRighe.map((r) => `<div class="${r.titolo ? "titolo" : "riga"}">${r.parti.map((p) =>
    p.colore || p.sottolineato
      ? `<span style="${p.colore ? `color:${p.colore};` : ""}${p.sottolineato ? "text-decoration:underline;" : ""}">${esc(p.testo)}</span>`
      : esc(p.testo)).join("")}</div>`).join("");
  const spazio = Math.ceil(m.altezza + 8);
  const css = `
    @font-face { font-family: '${v.piedeFont}'; src: url('${urlFontPiede()}') format('truetype'); }
    @page {
      margin-bottom: ${m.cimaPaginaDalFondo}pt;
      @bottom-center { content: "Pag. " counter(page) " / " counter(pages); font-family: ${font}; font-size: ${m.corpoPagina}pt; color: ${colore}; vertical-align: top; padding-top: 1pt; }
    }
    .piede-proprio { text-align: center; font-family: ${font}; color: ${colore}; font-weight: 400; margin-top: 24px; }
    .piede-proprio .titolo { font-size: ${m.corpoTitolo}pt; line-height: 1.15; white-space: pre; }
    .piede-proprio .riga { font-size: ${m.corpo}pt; line-height: 1.25; white-space: pre; }
    table.impaginato { width: 100%; border-collapse: collapse; border: 0; }
    table.impaginato > tbody > tr > td, table.impaginato > tfoot > tr > td { padding: 0; border: 0; overflow-wrap: normal; }
    .piede-spazio { height: ${spazio}pt; }
    @media screen { .piede-spazio { display: none; } }
    @media print { .piede-proprio { position: fixed; left: 0; right: 0; bottom: 0; margin: 0; } }`;
  return {
    attiva: true,
    css,
    // Il piè dopo la tabella: in stampa è fisso in fondo a ogni foglio; sullo schermo chiude il documento.
    apri: `<table class="impaginato"><tfoot><tr><td><div class="piede-spazio"></div></td></tr></tfoot><tbody><tr><td>`,
    chiudi: `</td></tr></tbody></table><div class="piede-proprio">${righe}</div>`,
    stileLogo: v.logoAltezza && v.logoLarghezzaMax
      ? `height:${v.logoAltezza}pt;width:auto;max-width:${v.logoLarghezzaMax}pt;object-fit:contain;`
      : null,
  };
}

/** Una stringa CSS (`content`) sicura dentro uno <style>: niente virgolette, barre o «</style>» che escano. */
const stringaCss = (t: string) => `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\3C ").replace(/\s+/g, " ").trim()}"`;

const CORPO_PIEDE = 7;
const INTERLINEA_PIEDE = 1.35;

/**
 * Il piè dello stile unico per chi non ha una veste propria (10/11/2026): le righe societarie centrate, 7 pt
 * `testoTenue`, e sotto «Pag. n / m». Sta nel margine basso del foglio (@bottom-center), che la stampa ripete su
 * ogni pagina; il margine si allarga quanto serve alle righe. Da mettere dopo le altre regole @page del documento.
 */
export function piedeSocietarioCss(righe: Array<string | null | undefined>): string {
  const testi = righe.map((r) => (r ?? "").trim()).filter(Boolean);
  const contenuto = [...testi.map(stringaCss), `"Pag. " counter(page) " / " counter(pages)`].join(` "\\A " `);
  const margine = Math.max(pagina.margineLaterale, Math.ceil((testi.length + 1) * CORPO_PIEDE * INTERLINEA_PIEDE + 18));
  return `
    @page {
      margin-bottom: ${margine}pt;
      @bottom-center { content: ${contenuto}; white-space: pre-wrap; text-align: center; vertical-align: middle; font-family: Helvetica, Arial, sans-serif; font-size: ${CORPO_PIEDE}pt; line-height: ${INTERLINEA_PIEDE}; color: ${coloreStile.testoTenue}; }
    }`;
}

/**
 * L'accento del documento (stileDocumenti.accentoDocumento): il colore della veste (Vulcano: il blu del piè), poi
 * quello dell'azienda (anagrafica, poi il marchio scelto in «Brand & Azienda»), poi il predefinito.
 */
export function accentoHtml(companyId: string | null | undefined, ...coloriAzienda: Array<string | null | undefined>): string {
  const coloreAzienda = coloriAzienda.map((c) => (c ?? "").trim()).find((c) => /^#[0-9a-f]{6}$/i.test(c)) ?? null;
  return accentoDocumento({ coloreVeste: personalizzazioneDocumento(companyId).piedeColore, coloreAzienda });
}
