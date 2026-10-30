import {SEGNALI_POS,segnalePosSvg} from "./posSegnaletica.ts";
import { ICONE_POS, iconaPosSvg } from "./posIcone.ts";
import { parse } from "parse5";
import { testoPerPdf } from "./posTestoPdf.ts";
import { LAYOUT_POS_VERSIONE } from "./posRenderer.ts";

interface HtmlNode {
  nodeName: string;
  value?: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
}
export type PdfBlock = Record<string, unknown>;
const children = (n: HtmlNode) => n.childNodes || [];
const attr = (n: HtmlNode, name: string) => n.attrs?.find(a => a.name === name)?.value || "";
const classe = (n: HtmlNode, c: string) => attr(n, "class").split(/\s+/).includes(c);
function trova(n: HtmlNode, tag: string): HtmlNode | undefined {
  if (n.tagName === tag) return n;
  for (const child of children(n)) { const match = trova(child, tag); if (match) return match; }
}
/** Only our own escaped template is accepted. No CSS, URL, image or executable HTML is interpreted. */
export function testoHtmlPos(n: HtmlNode): string {
  if (n.nodeName === "#text") return testoPerPdf((n.value || "").replace(/[\t\r\n ]+/g, " "));
  if (n.tagName === "br") return "\n";
  let testo = children(n).map(testoHtmlPos).join("");
  // Explicit textual checkboxes avoid a missing glyph being mistaken for a checked box.
  if (classe(n, "casella")) testo = testo.replace(/^☒/, "[x]").replace(/^☐/, "[ ]");
  if (n.tagName === "li") testo = `\n${testo}\n`;
  if (n.tagName === "div" && classe(n, "nota")) testo = `\n${testo}`;
  return testo;
}
const testo = (n: HtmlNode) => testoHtmlPos(n).replace(/\u00a0/g, " ").trim();
function righeTabella(n: HtmlNode): HtmlNode[] {
  return children(n).flatMap(c => c.tagName === "tr" ? [c] : ["tbody", "thead", "tfoot"].includes(c.tagName || "") ? righeTabella(c) : []);
}
const celle = (r: HtmlNode) => children(r).filter(c => c.tagName === "td" || c.tagName === "th");
const span = (n: HtmlNode) => Math.max(1, Number.parseInt(attr(n, "colspan"), 10) || 1);
function tabella(n: HtmlNode): PdfBlock {
  const righe = righeTabella(n);
  if (!righe.length) throw new Error("Tabella POS senza righe");
  const colonne = Math.max(...righe.map(r => celle(r).reduce((sum, c) => sum + span(c), 0)));
  if (colonne > 8) throw new Error("Tabella POS non supportata");
  const corpo = righe.map(r => {
    const row: PdfBlock[] = [];
    for (const cella of celle(r)) {
      row.push({ text: testo(cella) || " ", colSpan: span(cella), bold: cella.tagName === "th" || classe(cella, "et"),
        fillColor: cella.tagName === "th" ? "#eaf0f7" : classe(cella, "et") ? "#f5f7fa" : "#ffffff",
        alignment: classe(cella, "num") ? "center" : "left", margin: [3, 4, 3, 4] });
      for (let i = 1; i < span(cella); i++) row.push({});
    }
    while (row.length < colonne) row.push({ text: " " });
    return row;
  });
  const widths: Array<string | number> = Array(colonne).fill("*");
  const disponibile = 515.28 - colonne * 8;
  let col = 0;
  for (const c of celle(righe[0])) {
    const pct = attr(c, "style").match(/width:\s*(\d+(?:\.\d+)?)%/);
    if (span(c) === 1 && pct) widths[col] = disponibile * Number(pct[1]) / 100;
    col += span(c);
  }
  if (colonne === 2 && righe.some(r => celle(r).some(c => classe(c, "et")))) widths[0] = 145;
  if (classe(n, "lavorazione")) { widths[0] = 25; widths[1] = 130; widths[2] = "*"; }
  return { unbreakable: classe(n, "firme") || undefined, table: { widths, headerRows: celle(righe[0]).some(c => c.tagName === "th") ? 1 : 0, body: corpo, dontBreakRows: false, heights: classe(n, "firme") ? (r: number) => r % 2 ? 45 : 18 : undefined },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "#c3cbd6", vLineColor: () => "#c3cbd6" }, margin: [0, 4, 0, 10] };
}

/**
 * Same semantic content as the browser preview, with page-aware tables and a generated index.
 * `legame`: un PDF disegnato dal browser per un'emissione dichiara nel dizionario Info a quale emissione e a quale HTML
 * appartiene (posPdfLegame.ts); quello del server, e l'anteprima, no.
 */
export function layoutPdfPos(html: string, codice: string, revisione: number, dataEmissione: string, anteprima=false, legame?: { emissioneId: string; htmlSha256: string }): {
  definizione: Record<string, unknown>; testo: string; sezioni: string[];
} {
  const root = parse(html) as unknown as HtmlNode;
  const body = trova(root, "body");
  const pagina = body && children(body).find(n => classe(n, "pagina"));
  if (!pagina) throw new Error("Modello di stampa POS non riconosciuto");
  const content: PdfBlock[] = [];
  const sezioni: string[] = [];
  // pdfmake rifà l'impaginazione dell'intero documento a ogni salto di pagina deciso da pageBreakBefore: con i titoli
  // di terzo livello nella regola un POS di 50 pagine costa il 35-55% di CPU in più (provato a freddo: 1,05 s contro
  // 0,70 s a 53 pagine, 2,05 s contro 0,96 s a 99) e le Edge Functions hanno 2 s per richiesta. Oltre i ~90 KB di
  // HTML la regola vale solo per i titoli di sezione; sotto, anche per i sottotitoli (costa pochi millisecondi).
  const documentoGrande = html.length > 90_000;
  const livelloH3 = documentoGrande ? 2 : 1;
  const livelloH4 = documentoGrande ? 3 : 2;
  let indice = false;
  let avvertenzeBozza = "";
  for (const n of children(pagina)) {
    if (n.nodeName === "#text") { if (testo(n)) throw new Error("Testo POS fuori dai blocchi riconosciuti"); continue; }
    const t = testo(n);
    if (n.tagName === "h2") {
      if (!indice) { if(avvertenzeBozza)content.push({stack:[{text:"Verifiche e avvertenze della bozza",fontSize:17,bold:true,color:"#183451",margin:[0,0,0,16]},{text:avvertenzeBozza,fontSize:9,color:"#7f1d1d",lineHeight:1.2}],pageBreak:"before"}); content.push({ toc: { title: { text: "Indice delle sezioni", fontSize: 17, bold: true, margin: [0, 0, 0, 18] } }, pageBreak: "before" }); indice = true; }
      sezioni.push(t);
      if(sezioni.length>ICONE_POS.length)throw new Error("Sezione POS non riconosciuta");
      content.push({ unbreakable:true,columns:[{svg:iconaPosSvg(ICONE_POS[sezioni.length-1].id),width:21},{text:t,fontSize:14,bold:true,color:"#183451",headlineLevel:1,tocItem:true,tocMargin:[0,5,0,5]}],columnGap:9,pageBreak:sezioni.length===1||ICONE_POS[sezioni.length-1].id==="firme"?"before":undefined,headlineLevel:1,margin:[0,16,0,10] });
    } else if (n.tagName === "div" && classe(n,"segnale-pos")) {
      const segnale=SEGNALI_POS.find(s=>s.id===attr(n,"data-segnale"));
      if(!segnale)throw new Error("Segnale POS non riconosciuto");
      const descrizione=children(n).find(c=>c.tagName==="p");
      content.push({unbreakable:true,columns:[{svg:segnalePosSvg(segnale.id),width:38},{text:descrizione?testo(descrizione):segnale.nome,fontSize:9}],columnGap:12,margin:[0,5,0,9]});
    } else if (n.tagName === "table") content.push(tabella(n));
    else if (n.tagName === "h1") content.push({ text: t, alignment: "center", bold: true, fontSize: 22, color: "#183451", margin: [0, 45, 0, 16] });
    else if (n.tagName === "h3") content.push({ text: t, fontSize: 11, bold: true, headlineLevel: livelloH3, margin: [0, 12, 0, 6] });
    else if (n.tagName === "h4") content.push({ text: t, fontSize: 10, bold: true, headlineLevel: livelloH4, margin: [0, 9, 0, 5] });
    else if (n.tagName === "ul") content.push({ ul: children(n).filter(c => c.tagName === "li").map(testo), margin: [0, 4, 0, 10] });
    else if (n.tagName === "p" || n.tagName === "div") {
      if (classe(n, "bozza")) {
        if(!anteprima) throw new Error("Non si emette una bozza come POS approvato");
        avvertenzeBozza=t;
        content.push({text:"BOZZA - ANTEPRIMA NON APPROVATA. Verifiche e avvertenze nella pagina dedicata.",fontSize:9,bold:true,color:"#991b1b",margin:[0,0,0,12]});
        continue;
      }
      if (t) content.push({ text: t.replace("Il presente documento è composto da n. ______ pagine.", "La numerazione completa del documento è riportata nel piè di pagina."),
        alignment: classe(n, "sottotitolo") ? "center" : "left", fontSize: classe(n, "nota") ? 8 : 9.5, margin: [0, 3, 0, 9], color: classe(n, "nota") ? "#42566d" : "#192330" });
    } else throw new Error(`Blocco del modello POS non supportato: ${n.tagName}`);
  }
  if (sezioni.length !== 11) throw new Error("Il modello POS non contiene tutte le 11 sezioni attese");
  return {
    testo: testo(pagina), sezioni,
    definizione: {
      pageSize: "A4", pageMargins: [40, 46, 40, 48],
      defaultStyle: { font: "Roboto", fontSize: 9.5, lineHeight: 1.12 },
      info: { title: `POS ${codice} — revisione ${revisione}`, author: "Edilizia in Cloud", creator: "Edilizia in Cloud — POS 1", creationDate: new Date(dataEmissione), modDate: new Date(dataEmissione),
        ...(legame ? { PosEmissione: legame.emissioneId, PosHtmlSha256: legame.htmlSha256, PosLayout: LAYOUT_POS_VERSIONE } : {}) },
      footer: (corrente: number, totale: number) => ({ id:"pos-footer",text: `POS ${codice} · Rev. ${revisione}    |    Pagina ${corrente} di ${totale}`, alignment: "center", fontSize: 8, color: "#42566d", margin: [40, 14, 40, 0] }),
      pageBreakBefore: (node: { headlineLevel?: number; startPosition?:{pageInnerHeight:number;verticalRatio:number} }, container: { getFollowingNodesOnPage: () => Array<{id?:string;headlineLevel?:number;text?:unknown;table?:unknown;ul?:unknown}> }) => node.headlineLevel === 1 && ((node.startPosition && node.startPosition.pageInnerHeight*(1-node.startPosition.verticalRatio)<110) || !container.getFollowingNodesOnPage().some(n=>n.id!=="pos-footer"&&(n.table||n.ul||(n.text&&!n.headlineLevel)))),
      ...(anteprima ? {watermark:{text:"BOZZA — ANTEPRIMA",color:"#b91c1c",opacity:0.1,bold:true,angle:-45}} : {}),
      content,
    },
  };
}
