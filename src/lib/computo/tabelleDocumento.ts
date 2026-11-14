import { cellaDaTesto, computoDaGriglia, type Cella } from "./computoExcel";
import type { ComputoStrutturato } from "./computoStrutturato";

/**
 * CSV e documenti Word letti come le tabelle di un foglio Excel: stessa ricerca
 * dell'intestazione per sinonimi, stesse regole su capitoli, voci e totali
 * (`computoDaGriglia`). Niente AI quando il computo è una tabella.
 */

/**
 * Il separatore è quello che divide le righe sempre nello stesso numero di campi.
 * Non quello che compare più volte: in Italia i decimali e le descrizioni sono
 * pieni di virgole («…10 cm, compresi collante, tasselli;mq;180,00;62,00»), e
 * contando la riga più carica vinceva la virgola (14/11/2026, prova nel browser:
 * «Non sembra un computo» su un CSV a «;» qualsiasi). A pari coerenza, «;» poi tab.
 */
export function separatoreCsv(testo: string): string {
  const righe = testo.replace(/^\uFEFF/, "").split(/\r?\n/).filter(r => r.trim()).slice(0, 40);
  const coerenza = (sep: string) => {
    const conte = righe.map(r => r.split(sep).length - 1).filter(n => n > 0);
    if (!conte.length) return 0;
    const frequenze = new Map<number, number>();
    for (const n of conte) frequenze.set(n, (frequenze.get(n) ?? 0) + 1);
    return Math.max(...frequenze.values());
  };
  const candidati = [";", "\t", ","];
  return candidati.reduce((meglio, sep) => (coerenza(sep) > coerenza(meglio) ? sep : meglio), candidati[0]);
}

/** Righe di un CSV, con le virgolette e gli a capo dentro le celle. */
export function righeCsv(testo: string): string[][] {
  const sep = separatoreCsv(testo);
  const righe: string[][] = [];
  let riga: string[] = [];
  let cella = "";
  let virgolette = false;
  const t = testo.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (virgolette) {
      if (c === '"' && t[i + 1] === '"') { cella += '"'; i++; }
      else if (c === '"') virgolette = false;
      else cella += c;
    } else if (c === '"' && !cella.trim()) { virgolette = true; cella = ""; }
    else if (c === sep) { riga.push(cella); cella = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      riga.push(cella); righe.push(riga); riga = []; cella = "";
    } else cella += c;
  }
  if (cella || riga.length) { riga.push(cella); righe.push(riga); }
  return righe;
}

function griglia(righe: Array<Array<{ testo: string; grassetto?: boolean }>>): Cella[][] {
  const larghezza = Math.max(0, ...righe.map(r => r.length));
  return righe.map(r => Array.from({ length: larghezza }, (_, i) => cellaDaTesto(r[i]?.testo ?? "", !!r[i]?.grassetto)));
}

export function leggiComputoCsv(testo: string): ComputoStrutturato {
  const righe = righeCsv(testo);
  if (!righe.some(r => r.some(c => c.trim()))) throw new Error("Il file CSV è vuoto.");
  return computoDaGriglia(griglia(righe.map(r => r.map(testo => ({ testo })))));
}

/** I CSV salvati da Excel in Italia sono spesso in windows-1252: si capisce dai caratteri rotti. */
export function decodificaCsv(dati: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(dati);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(dati) : utf8;
}

// ── Word (.docx) ─────────────────────────────────────────────────────────────

export interface DocumentoWord {
  /** Tutte le tabelle del documento, una dopo l'altra: un computo in Word è spesso spezzato pagina per pagina. */
  tabelle: Array<Array<Array<{ testo: string; grassetto: boolean }>>>;
  /** Il testo intero, tabelle comprese (celle separate da tabulazioni): serve all'AI quando non c'è una tabella. */
  testo: string;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function figli(el: Element, nome: string): Element[] {
  return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === nome);
}

function testoParagrafo(p: Element): string {
  return Array.from(p.getElementsByTagNameNS(W, "*"))
    .map(n => n.localName === "t" ? n.textContent ?? "" : n.localName === "tab" ? "\t" : n.localName === "br" ? "\n" : "")
    .join("");
}

function grassetto(el: Element): boolean {
  return Array.from(el.getElementsByTagNameNS(W, "b")).some(b => !["0", "false"].includes(b.getAttributeNS(W, "val") ?? b.getAttribute("w:val") ?? ""));
}

export async function leggiDocumentoWord(dati: ArrayBuffer): Promise<DocumentoWord> {
  const firma = new Uint8Array(dati.slice(0, 2));
  if (firma[0] === 0xd0 && firma[1] === 0xcf) throw new Error("Il documento Word è protetto da password o è nel formato vecchio .doc: aprilo in Word, togli la password e salvalo come .docx.");
  const JSZip = (await import("jszip")).default;
  let xml: string | undefined;
  try {
    xml = await (await JSZip.loadAsync(dati)).file("word/document.xml")?.async("string");
  } catch {
    xml = undefined;
  }
  if (!xml) throw new Error("Il file non è un documento Word leggibile: aprilo in Word e salvalo di nuovo come .docx.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const corpo = doc.getElementsByTagNameNS(W, "body")[0];
  if (!corpo) throw new Error("Il documento Word è vuoto.");

  const tabelle: DocumentoWord["tabelle"] = [];
  const testo: string[] = [];
  const visita = (el: Element) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      if (e.localName === "p") testo.push(testoParagrafo(e));
      else if (e.localName === "tbl") {
        const righe = figli(e, "tr").map(tr => figli(tr, "tc").map(tc => ({
          testo: figli(tc, "p").map(testoParagrafo).join(" ").replace(/\s+/g, " ").trim(),
          grassetto: grassetto(tc),
        })));
        tabelle.push(righe);
        testo.push(...righe.map(r => r.map(c => c.testo).join("\t")));
      } else visita(e);
    }
  };
  visita(corpo);
  return { tabelle, testo: testo.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}

/**
 * Il computo dentro le tabelle del documento: prima tutte insieme (spezzato su
 * più pagine), poi la tabella più grande da sola. Null se non ce n'è uno.
 */
export function computoDaTabelleWord(word: DocumentoWord): ComputoStrutturato | null {
  const tentativi = [
    word.tabelle.flat(),
    ...[...word.tabelle].sort((a, b) => b.length - a.length),
  ].filter(t => t.length > 1);
  for (const righe of tentativi) {
    try {
      const c = computoDaGriglia(griglia(righe));
      if (c.voci.length) return c;
    } catch {
      // non è un computo: si prova la prossima
    }
  }
  return null;
}
