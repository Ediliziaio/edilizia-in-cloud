/**
 * Lettore XML minimo per le edge function.
 *
 * Perché esiste (02/10/2026): deno_dom, che le funzioni usavano per leggere le
 * fatture, NON sa leggere XML: `new DOMParser().parseFromString(xml, "text/xml")`
 * risponde «"text/xml" unimplemented». Le fatture dei fornitori da openapi
 * fallivano tutte con «fattura senza fornitore, numero o data», e per lo stesso
 * motivo non funzionavano ricevi-sdi, importa-fattura-attiva-xml e sdi-webhook.
 * Nel browser e nei test c'è un DOM vero (jsdom), per questo i test passavano.
 *
 * Fa solo quello che serve ai lettori (fatturapaReader, fatturaRicevutaXml):
 * `getElementsByTagName` (anche «*») e `textContent`. I prefissi di namespace si
 * tolgono (`p:Numero` → `Numero`), come in senzaPrefissi(). Niente DTD né
 * entità personalizzate: un file malformato dà null, non una fattura a metà.
 */
import type { DocumentoXml, ElementoXml, LettoreXml } from "./fatturapaReader.ts";

class Elemento implements ElementoXml {
  figli: Elemento[] = [];
  /** Testo e figli nell'ordine in cui compaiono, per textContent. */
  contenuto: Array<string | Elemento> = [];
  constructor(public tagName: string) {}

  get localName(): string {
    return this.tagName;
  }

  get textContent(): string {
    let t = "";
    for (const c of this.contenuto) t += typeof c === "string" ? c : c.textContent;
    return t;
  }

  getElementsByTagName(nome: string): Elemento[] {
    const out: Elemento[] = [];
    const visita = (e: Elemento) => {
      for (const f of e.figli) {
        if (nome === "*" || f.tagName === nome) out.push(f);
        visita(f);
      }
    };
    visita(this);
    return out;
  }
}

const ENTITA: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodifica(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return m;
      }
    }
    return ENTITA[e] ?? m;
  });
}

const senzaPrefisso = (nome: string) => nome.slice(nome.indexOf(":") + 1);

/** Un documento XML ben formato → il suo elemento radice, o null. */
export function leggiXml(xml: string): Elemento | null {
  let i = 0;
  const n = xml.length;
  if (xml.charCodeAt(0) === 0xfeff) i = 1;
  const radice = new Elemento("#documento");
  const pila: Elemento[] = [radice];
  const corrente = () => pila[pila.length - 1];

  while (i < n) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      const resto = xml.slice(i);
      if (resto.trim() !== "") return null; // testo fuori dalla radice
      break;
    }
    if (lt > i) {
      const testo = xml.slice(i, lt);
      if (pila.length > 1) corrente().contenuto.push(decodifica(testo));
      else if (testo.trim() !== "") return null;
    }
    if (xml.startsWith("<!--", lt)) {
      const fine = xml.indexOf("-->", lt + 4);
      if (fine === -1) return null;
      i = fine + 3;
    } else if (xml.startsWith("<![CDATA[", lt)) {
      const fine = xml.indexOf("]]>", lt + 9);
      if (fine === -1 || pila.length === 1) return null;
      corrente().contenuto.push(xml.slice(lt + 9, fine));
      i = fine + 3;
    } else if (xml.startsWith("<?", lt)) {
      const fine = xml.indexOf("?>", lt + 2);
      if (fine === -1) return null;
      i = fine + 2;
    } else if (xml.startsWith("<!", lt)) {
      // DOCTYPE: si salta fino alla chiusura (senza sottoinsieme interno).
      const fine = xml.indexOf(">", lt + 2);
      if (fine === -1) return null;
      i = fine + 1;
    } else if (xml.startsWith("</", lt)) {
      const fine = xml.indexOf(">", lt + 2);
      if (fine === -1) return null;
      const nome = senzaPrefisso(xml.slice(lt + 2, fine).trim());
      if (pila.length === 1 || corrente().tagName !== nome) return null;
      pila.pop();
      i = fine + 1;
    } else {
      // Apertura: il nome, poi gli attributi (si saltano) fino a «>» o «/>»,
      // rispettando le virgolette (un attributo può contenere «>»).
      let j = lt + 1;
      while (j < n && !/[\s/>]/.test(xml[j])) j++;
      const nome = senzaPrefisso(xml.slice(lt + 1, j));
      if (!nome) return null;
      let q: string | null = null;
      while (j < n) {
        const c = xml[j];
        if (q) {
          if (c === q) q = null;
        } else if (c === '"' || c === "'") q = c;
        else if (c === ">") break;
        j++;
      }
      if (j >= n) return null;
      const autochiuso = xml[j - 1] === "/" && !q;
      const el = new Elemento(nome);
      corrente().figli.push(el);
      corrente().contenuto.push(el);
      if (!autochiuso) pila.push(el);
      i = j + 1;
    }
  }
  if (pila.length !== 1 || radice.figli.length !== 1) return null;
  return radice;
}

/** Lo stesso contratto di DOMParser per i lettori delle fatture. */
export class LettoreXmlMinimo implements LettoreXml {
  parseFromString(xml: string, _tipo: string): DocumentoXml | null {
    return leggiXml(xml);
  }
}
