import {SEGNALI_POS,segnalePosSvg} from "./posSegnaletica.ts";
import { ICONE_POS, iconaPosSvg } from "./posIcone.ts";
import { parse } from "parse5";
import { caselleInLettere, MARCA_CASELLA_NO, MARCA_CASELLA_SI, testoPerPdf, testoPerPdfConCaselle } from "./posTestoPdf.ts";
import { CASELLA_SPUNTATA, CASELLA_VUOTA, FONT_CASELLE } from "./posFont.ts";
import { dataRomaDaIso } from "./posData.ts";

interface HtmlNode {
  nodeName: string;
  value?: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
}
export type PdfBlock = Record<string, unknown>;
type PdfTesto = string | Array<string | PdfBlock>;
const children = (n: HtmlNode) => n.childNodes || [];
const attr = (n: HtmlNode, name: string) => n.attrs?.find(a => a.name === name)?.value || "";
const classe = (n: HtmlNode, c: string) => attr(n, "class").split(/\s+/).includes(c);
const contiene = (n: HtmlNode, prova: (x: HtmlNode) => boolean): boolean => prova(n) || children(n).some(c => contiene(c, prova));
function trova(n: HtmlNode, tag: string): HtmlNode | undefined {
  if (n.tagName === tag) return n;
  for (const child of children(n)) { const match = trova(child, tag); if (match) return match; }
}

// Palette del documento: blu istituzionale per i titoli, grigi freddi per tutto il resto (si stampa bene anche in bianco e nero).
const BLU = "#183451", GRIGIO = "#42566d", GRIGIO_CHIARO = "#6b7a8c", TESTO = "#192330", BORDO = "#c3cbd6";

/**
 * Only our own escaped template is accepted. No CSS, URL, image or executable HTML is interpreted.
 * Le caselle (☒ ☐) escono come due segni privati: il layout le disegna con il mini-font, `testo()` le rimette in lettere.
 */
export function testoHtmlPos(n: HtmlNode): string {
  if (n.nodeName === "#text") return testoPerPdfConCaselle((n.value || "").replace(/[\t\r\n ]+/g, " "));
  if (n.tagName === "br") return "\n";
  let testo = children(n).map(testoHtmlPos).join("");
  if (n.tagName === "li") testo = `\n${testo}\n`;
  if (n.tagName === "div" && classe(n, "nota")) testo = `\n${testo}`;
  return testo;
}
const grezzo = (n: HtmlNode) => testoHtmlPos(n).replace(/ /g, " ").trim();
/** Il testo di un blocco con le caselle in lettere: è quello che si controlla (glifi) e che si cerca nei test. */
const testo = (n: HtmlNode) => caselleInLettere(grezzo(n));
/** Il testo di un blocco come lo vuole pdfmake: pezzi di testo, con le caselle nel loro font. */
function pezzi(s: string): PdfTesto {
  if (!s.includes(MARCA_CASELLA_SI) && !s.includes(MARCA_CASELLA_NO)) return s;
  const out: Array<string | PdfBlock> = [];
  for (const parte of s.split(/([])/)) {
    if (!parte) continue;
    out.push(parte === MARCA_CASELLA_SI ? { text: CASELLA_SPUNTATA, font: FONT_CASELLE } : parte === MARCA_CASELLA_NO ? { text: CASELLA_VUOTA, font: FONT_CASELLE } : parte);
  }
  return out;
}
const contenuto = (n: HtmlNode): PdfTesto => pezzi(grezzo(n));

/** Titolo e riferimento di legge di un'intestazione: «Dati dell'impresa» e «3.2.1 lettera a) punto 1», senza le parentesi. */
function titoloERiferimento(n: HtmlNode): { titolo: string; rif: string } {
  const rif: string[] = [];
  const senza = (x: HtmlNode): string => {
    if (classe(x, "rif")) { rif.push(testo(x)); return ""; }
    if (x.nodeName === "#text") return testoPerPdf((x.value || "").replace(/[\t\r\n ]+/g, " "));
    return children(x).map(senza).join("");
  };
  const titolo = senza(n).replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const grezzoRif = rif.join(" ").trim();
  return { titolo, rif: grezzoRif.startsWith("(") && grezzoRif.endsWith(")") ? grezzoRif.slice(1, -1).trim() : grezzoRif };
}

function righeTabella(n: HtmlNode): HtmlNode[] {
  return children(n).flatMap(c => c.tagName === "tr" ? [c] : ["tbody", "thead", "tfoot"].includes(c.tagName || "") ? righeTabella(c) : []);
}
const celle = (r: HtmlNode) => children(r).filter(c => c.tagName === "td" || c.tagName === "th");
const span = (n: HtmlNode) => Math.max(1, Number.parseInt(attr(n, "colspan"), 10) || 1);
const LARGHEZZA_PAGINA = 515.28;
/** Un titolo con meno di tanto spazio sotto passa alla pagina dopo: una tabella con le righe intere non parte nel resto della pagina e il titolo resterebbe solo. */
const SPAZIO_MINIMO_TITOLO = 160;
function tabella(n: HtmlNode): PdfBlock {
  const righe = righeTabella(n);
  if (!righe.length) throw new Error("Tabella POS senza righe");
  const colonne = Math.max(...righe.map(r => celle(r).reduce((sum, c) => sum + span(c), 0)));
  if (colonne > 8) throw new Error("Tabella POS non supportata");
  const corpo = righe.map(r => {
    const row: PdfBlock[] = [];
    for (const cella of celle(r)) {
      const t = testo(cella);
      // Un dato non compilato si stampa «—»; una cella lasciata libera apposta (le firme) resta bianca.
      const nonCompilato = !t && contiene(cella, x => classe(x, "vuoto"));
      row.push({ text: nonCompilato ? "—" : t ? contenuto(cella) : " ", colSpan: span(cella), bold: cella.tagName === "th" || classe(cella, "et"),
        ...(nonCompilato ? { color: "#8a97a6" } : {}),
        fillColor: cella.tagName === "th" ? "#eaf0f7" : classe(cella, "et") ? "#f5f7fa" : "#ffffff",
        alignment: classe(cella, "num") || classe(cella, "centro") ? "center" : "left", margin: [3, 4, 3, 4] });
      for (let i = 1; i < span(cella); i++) row.push({});
    }
    while (row.length < colonne) row.push({ text: " " });
    return row;
  });
  const widths: Array<string | number> = Array(colonne).fill("*");
  const disponibile = LARGHEZZA_PAGINA - colonne * 8;
  let col = 0;
  for (const c of celle(righe[0])) {
    const pct = attr(c, "style").match(/width:\s*(\d+(?:\.\d+)?)%/);
    // Una colonna di numeri («N», «Numero») non deve prendersi un quarto di pagina.
    if (span(c) === 1 && pct) widths[col] = disponibile * Number(pct[1]) / 100;
    else if (span(c) === 1 && classe(c, "num")) widths[col] = Math.max(34, Math.ceil(16 + 5.6 * testo(c).length));
    col += span(c);
  }
  if (colonne === 2 && righe.some(r => celle(r).some(c => classe(c, "et")))) widths[0] = 145;
  if (classe(n, "lavorazione")) { widths[0] = 25; widths[1] = 130; widths[2] = "*"; }
  const intestazione = celle(righe[0]).some(c => c.tagName === "th") ? 1 : 0;
  // Le righe non si spezzano fra due pagine (restava un filo vuoto in fondo); una riga più alta di una pagina si spezza lo stesso.
  return { unbreakable: classe(n, "firme") || undefined, table: { widths, headerRows: intestazione, ...(intestazione ? { keepWithHeaderRows: 1 } : {}), body: corpo, dontBreakRows: true, heights: classe(n, "firme") ? (r: number) => r % 2 ? 45 : 18 : undefined },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDO, vLineColor: () => BORDO }, margin: [0, 4, 0, 10] };
}

const tronca = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
const unaRiga = (s: string) => testoPerPdf(s.replace(/\s+/g, " ").trim());

/** Una riga con riquadro colorato: lo stato del documento in copertina e gli avvisi. */
function riquadro(t: PdfTesto, riempimento: string, bordo: string, colore: string, grassetto = true): PdfBlock {
  return { table: { widths: ["*"], body: [[{ text: t, bold: grassetto, color: colore, fillColor: riempimento, margin: [8, 6, 8, 6], fontSize: 9.5 }]] },
    layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => bordo, vLineColor: () => bordo }, margin: [0, 6, 0, 10] };
}

/** Same semantic content as the browser preview, with page-aware tables and a generated index. */
export function layoutPdfPos(html: string, codice: string, revisione: number, dataEmissione: string, anteprima=false): {
  definizione: Record<string, unknown>; testo: string; sezioni: string[];
} {
  const root = parse(html) as unknown as HtmlNode;
  const body = trova(root, "body");
  const pagina = body && children(body).find(n => classe(n, "pagina"));
  if (!pagina) throw new Error("Modello di stampa POS non riconosciuto");
  // Impresa e cantiere stanno nell'intestazione di ogni pagina: arrivano dal modello stesso, così chi disegna il PDF
  // (server o browser) non ha bisogno di altro che dell'HTML.
  const impresa = unaRiga(attr(pagina, "data-impresa"));
  const cantiere = unaRiga(attr(pagina, "data-cantiere"));
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
      const numero = sezioni.length;
      const { titolo, rif } = titoloERiferimento(n);
      content.push({ unbreakable:true,columns:[{svg:iconaPosSvg(ICONE_POS[numero-1].id),width:21},
        { stack: [{ text: `${numero}. ${titolo}`, fontSize: 14, bold: true, color: BLU, headlineLevel: 1, tocItem: true, tocMargin: [0, 5, 0, 5] },
          ...(rif ? [{ text: `Allegato XV, ${rif}`, fontSize: 8, color: GRIGIO_CHIARO, margin: [0, 2, 0, 0] }] : [])] }],
        columnGap:9,pageBreak:numero===1||ICONE_POS[numero-1].id==="firme"?"before":undefined,headlineLevel:1,margin:[0,16,0,10] });
    } else if (n.tagName === "div" && classe(n,"segnale-pos")) {
      const segnale=SEGNALI_POS.find(s=>s.id===attr(n,"data-segnale"));
      if(!segnale)throw new Error("Segnale POS non riconosciuto");
      const descrizione=children(n).find(c=>c.tagName==="p");
      content.push({unbreakable:true,columns:[{svg:segnalePosSvg(segnale.id),width:38},{text:descrizione?testo(descrizione):segnale.nome,fontSize:9}],columnGap:12,margin:[0,5,0,9]});
    } else if (n.tagName === "div" && classe(n, "verifica")) {
      // Il QR porta alla pagina pubblica che dice se questa copia è la revisione in vigore.
      const url = attr(n, "data-url");
      if (!/^https:\/\/[\w.-]+(?::\d+)?\/[\w\-./]+$/.test(url)) throw new Error("Indirizzo di verifica del POS non valido");
      content.push({ unbreakable: true, columns: [{ qr: url, fit: 74, width: 74 }, { text: t, fontSize: 8.5, color: GRIGIO, margin: [0, 6, 0, 0] }], columnGap: 12, margin: [0, 14, 0, 0] });
    } else if (n.tagName === "table") content.push(tabella(n));
    else if (n.tagName === "h1") content.push({ text: t, alignment: "center", bold: true, fontSize: 24, color: BLU, margin: [0, 34, 0, 8] },
      { canvas: [{ type: "line", x1: 222, y1: 0, x2: 293, y2: 0, lineWidth: 2.2, lineColor: "#2f6fb5" }], margin: [0, 0, 0, 12] });
    else if (n.tagName === "h3" || n.tagName === "h4") {
      const grande = n.tagName === "h3";
      const { titolo, rif } = titoloERiferimento(n);
      content.push({ text: [titolo, ...(rif ? [{ text: `\u2002${rif.replace(/ /g, "\u00a0")}`, bold: false, fontSize: 8, color: GRIGIO_CHIARO }] : [])],
        fontSize: grande ? 11 : 10, bold: true, headlineLevel: grande ? livelloH3 : livelloH4, margin: grande ? [0, 12, 0, 6] : [0, 9, 0, 5] });
    }
    else if (n.tagName === "ul") content.push({ ul: children(n).filter(c => c.tagName === "li").map(li => ({ text: contenuto(li) })), margin: [0, 4, 0, 10] });
    else if (n.tagName === "p" || n.tagName === "div") {
      if (classe(n, "bozza")) {
        if(!anteprima) throw new Error("Non si emette una bozza come POS approvato");
        avvertenzeBozza=t;
        content.push({text:"BOZZA - ANTEPRIMA NON APPROVATA. Verifiche e avvertenze nella pagina dedicata.",fontSize:9,bold:true,color:"#991b1b",margin:[0,0,0,12]});
        continue;
      }
      if (classe(n, "stato-doc")) { if (t) content.push(riquadro(contenuto(n), "#ecf7f0", "#9fd3b1", "#14532d")); continue; }
      if (classe(n, "avviso-copia")) { if (t) content.push(riquadro(contenuto(n), "#fff7e6", "#e8c27a", "#6b4a00", false)); continue; }
      const secondario = classe(n, "nota") || classe(n, "intro");
      if (t) content.push({ text: t === "Il presente documento è composto da n. ______ pagine." ? "La numerazione completa del documento è riportata nel piè di pagina." : contenuto(n),
        alignment: classe(n, "sottotitolo") ? "center" : "left", fontSize: secondario ? 8 : 9.5, margin: classe(n, "sottotitolo") ? [0, 3, 0, 14] : [0, 3, 0, 9],
        color: secondario || classe(n, "sottotitolo") ? GRIGIO : TESTO });
    } else throw new Error(`Blocco del modello POS non supportato: ${n.tagName}`);
  }
  if (sezioni.length !== 11) throw new Error("Il modello POS non contiene tutte le 11 sezioni attese");
  const emesso = dataEmissione && !anteprima ? dataRomaDaIso(dataEmissione) : "";
  return {
    // Anche impresa e cantiere dell'intestazione passano dal controllo dei glifi.
    testo: [testo(pagina), impresa, cantiere].filter(Boolean).join("\n"), sezioni,
    definizione: {
      pageSize: "A4", pageMargins: [40, 56, 40, 52],
      defaultStyle: { font: "Roboto", fontSize: 9.5, lineHeight: 1.12 },
      info: { title: `POS ${codice} — revisione ${revisione}`, author: impresa || "Edilizia in Cloud", subject: "Piano operativo di sicurezza — D.Lgs 81/2008, Allegato XV punto 3.2", creator: "Edilizia in Cloud — POS", creationDate: new Date(dataEmissione), modDate: new Date(dataEmissione) },
      // Su ogni pagina, tranne la copertina: di chi è il foglio e per quale cantiere, se due pagine si separano.
      header: (corrente: number) => corrente === 1 || (!impresa && !cantiere) ? null : { id: "pos-header", margin: [40, 24, 40, 0], stack: [
        { columns: [{ text: tronca(impresa, 60), bold: true, fontSize: 8, color: BLU }, { text: tronca(cantiere, 70), alignment: "right", fontSize: 8, color: GRIGIO }] },
        { canvas: [{ type: "line", x1: 0, y1: 3, x2: LARGHEZZA_PAGINA, y2: 3, lineWidth: 0.4, lineColor: BORDO }] }] },
      footer: (corrente: number, totale: number) => ({ id:"pos-footer",text: `POS ${codice} · Rev. ${revisione}${emesso ? ` · emesso il ${emesso}` : ""}    |    Pagina ${corrente} di ${totale}`, alignment: "center", fontSize: 8, color: GRIGIO, margin: [40, 14, 40, 0] }),
      pageBreakBefore: (node: { headlineLevel?: number; startPosition?:{pageInnerHeight:number;verticalRatio:number} }, container: { getFollowingNodesOnPage: () => Array<{id?:string;headlineLevel?:number;text?:unknown;table?:unknown;ul?:unknown}> }) => node.headlineLevel === 1 && ((node.startPosition && node.startPosition.pageInnerHeight*(1-node.startPosition.verticalRatio)<SPAZIO_MINIMO_TITOLO) || !container.getFollowingNodesOnPage().some(n=>!n.id?.startsWith("pos-")&&(n.table||n.ul||(n.text&&!n.headlineLevel)))),
      ...(anteprima ? {watermark:{text:"BOZZA — ANTEPRIMA",color:"#b91c1c",opacity:0.1,bold:true,angle:-45}} : {}),
      content,
    },
  };
}
