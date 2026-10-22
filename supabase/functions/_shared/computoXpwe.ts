/**
 * Lettore del formato XPWE di ACCA PriMus (XML).
 *
 *   PweDocumento
 *   ├─ PweDatiGenerali
 *   │   ├─ PweDGProgetto › PweDGDatiGenerali (Oggetto, Committente, Impresa…)
 *   │   └─ PweDGCapitoliCategorie
 *   │       ├─ PweDGSuperCapitoli / PweDGCapitoli / PweDGSubCapitoli   (DG…Item ID=…, DesSintetica)
 *   │       └─ PweDGSuperCategorie / PweDGCategorie / PweDGSubCategorie
 *   └─ PweMisurazioni
 *       ├─ PweElencoPrezzi › EPItem (Tariffa, DesEstesa, UnMisura, Prezzo1, IDSpCap/IDCap/IDSbCap)
 *       └─ PweVociComputo › VCItem (IDEP, Quantita, IDSpCat/IDCat/IDSbCat,
 *                                   PweVCMisure › RGItem: Descrizione, PartiUguali, Lunghezza, Larghezza, HPeso, Quantita)
 *
 * Le descrizioni sono COMPLETE (dall'elenco prezzi), a differenza del PDF che le
 * tronca con «...». Il parser XML è scritto qui, senza dipendenze, perché giri
 * uguale in Deno e nei test.
 */
import {
  arrotonda, eSicurezza, valutaFormula,
  type ComputoLivello, type ComputoMisura, type ComputoStrutturato, type ComputoVoceStrutturata,
} from "./computoStrutturato.ts";

export interface XmlNodo { nome: string; attributi: Record<string, string>; figli: XmlNodo[]; testo: string }

const ENTITA: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: "\"", apos: "'", nbsp: " " };
function decodificaEntita(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITA[e.toLowerCase()] ?? m;
  });
}

/** Parser XML minimo: elementi, attributi, testo, CDATA, commenti. Lancia su tag non bilanciati. */
export function parseXml(src: string): XmlNodo {
  const radice: XmlNodo = { nome: "#documento", attributi: {}, figli: [], testo: "" };
  const pila: XmlNodo[] = [radice];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf("<", i);
    const testo = src.slice(i, lt === -1 ? n : lt);
    if (testo) pila[pila.length - 1].testo += decodificaEntita(testo);
    if (lt === -1) break;
    if (src.startsWith("<!--", lt)) { const fine = src.indexOf("-->", lt + 4); if (fine === -1) throw new Error("Commento XML non chiuso"); i = fine + 3; continue; }
    if (src.startsWith("<![CDATA[", lt)) { const fine = src.indexOf("]]>", lt + 9); if (fine === -1) throw new Error("CDATA non chiuso"); pila[pila.length - 1].testo += src.slice(lt + 9, fine); i = fine + 3; continue; }
    if (src.startsWith("<?", lt)) { const fine = src.indexOf("?>", lt + 2); if (fine === -1) throw new Error("Istruzione XML non chiusa"); i = fine + 2; continue; }
    if (src.startsWith("<!", lt)) {
      // DOCTYPE, con eventuale sottoinsieme interno fra [ ].
      let j = lt + 2; let quadre = 0;
      for (; j < n; j++) { if (src[j] === "[") quadre++; else if (src[j] === "]") quadre--; else if (src[j] === ">" && quadre <= 0) break; }
      i = j + 1; continue;
    }
    const gt = (() => {
      let q: string | null = null;
      for (let j = lt + 1; j < n; j++) {
        const c = src[j];
        if (q) { if (c === q) q = null; } else if (c === "\"" || c === "'") q = c; else if (c === ">") return j;
      }
      return -1;
    })();
    if (gt === -1) throw new Error("Tag XML non chiuso");
    const dentro = src.slice(lt + 1, gt);
    i = gt + 1;
    if (dentro.startsWith("/")) {
      const nome = dentro.slice(1).trim();
      const aperto = pila.pop();
      if (!aperto || aperto.nome !== nome || !pila.length) throw new Error(`XML non valido: </${nome}> chiude <${aperto?.nome ?? "?"}>`);
      continue;
    }
    const auto = dentro.endsWith("/");
    const corpo = auto ? dentro.slice(0, -1) : dentro;
    const m = /^([^\s/>]+)/.exec(corpo);
    if (!m) throw new Error("Tag XML senza nome");
    const nodo: XmlNodo = { nome: m[1], attributi: {}, figli: [], testo: "" };
    const reAttr = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    for (let a = reAttr.exec(corpo.slice(m[1].length)); a; a = reAttr.exec(corpo.slice(m[1].length))) {
      nodo.attributi[a[1]] = decodificaEntita(a[3] ?? a[4] ?? "");
    }
    pila[pila.length - 1].figli.push(nodo);
    if (!auto) pila.push(nodo);
  }
  if (pila.length !== 1) throw new Error(`XML troncato: <${pila[pila.length - 1].nome}> non chiuso`);
  return radice;
}

const locale = (nome: string) => nome.replace(/^.*:/, "").toLowerCase();
export function figlio(nodo: XmlNodo | undefined, nome: string): XmlNodo | undefined {
  return nodo?.figli.find(f => locale(f.nome) === nome.toLowerCase());
}
export function figli(nodo: XmlNodo | undefined, nome: string): XmlNodo[] {
  return nodo?.figli.filter(f => locale(f.nome) === nome.toLowerCase()) ?? [];
}
/** Cerca in profondità il primo nodo con quel nome. */
export function cerca(nodo: XmlNodo | undefined, nome: string): XmlNodo | undefined {
  if (!nodo) return undefined;
  for (const f of nodo.figli) {
    if (locale(f.nome) === nome.toLowerCase()) return f;
    const sotto = cerca(f, nome);
    if (sotto) return sotto;
  }
  return undefined;
}
const testoDi = (nodo: XmlNodo | undefined, nome: string) => (figlio(nodo, nome)?.testo ?? "").trim();

/** Nell'XPWE i numeri hanno il punto decimale; tolleriamo anche la virgola e le formule. */
function numeroXpwe(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^[+-]?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^[+-]?\d+,\d+$/.test(t)) return Number(t.replace(",", "."));
  return valutaFormula(t);
}
const idDi = (nodo: XmlNodo) => nodo.attributi.ID ?? nodo.attributi.id ?? testoDi(nodo, "ID");

export const MESSAGGIO_DCF = "Il file .dcf di PriMus non si legge direttamente: in PriMus apri il computo e scegli File › Esporta › formato XPWE, poi carica il file .xpwe.";

/** Decodifica rispettando l'encoding dichiarato (PriMus spesso scrive in windows-1252). */
export function decodificaXpwe(input: ArrayBuffer | Uint8Array | string): string {
  if (typeof input === "string") return input;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const testa = new TextDecoder("latin1").decode(bytes.slice(0, 300));
  if (!/^\s*(?:﻿|ï»¿)?\s*</.test(testa)) throw new Error(MESSAGGIO_DCF);
  const enc = /encoding\s*=\s*["']([^"']+)["']/i.exec(testa)?.[1]?.toLowerCase() ?? "utf-8";
  try { return new TextDecoder(enc).decode(bytes).replace(/^﻿/, ""); }
  catch { return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, ""); }
}

function elencoLivelli(gruppo: XmlNodo | undefined, contenitore: string): Map<string, ComputoLivello> {
  const out = new Map<string, ComputoLivello>();
  const nodo = figlio(gruppo, contenitore);
  for (const item of nodo?.figli ?? []) {
    const id = idDi(item);
    if (!id) continue;
    const nome = testoDi(item, "DesSintetica") || testoDi(item, "DesEstesa") || testoDi(item, "Codice") || `${contenitore} ${id}`;
    out.set(id, { numero: Number(id) || null, nome: nome.replace(/\s+/g, " ").trim() });
  }
  return out;
}

const pulisci = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

export function leggiComputoXpwe(input: ArrayBuffer | Uint8Array | string): ComputoStrutturato {
  const xml = decodificaXpwe(input);
  let doc: XmlNodo;
  try { doc = parseXml(xml); }
  catch (e) { throw new Error(`File XPWE non leggibile: ${e instanceof Error ? e.message : "XML non valido"}.`); }
  const radice = cerca(doc, "PweDocumento") ?? doc;
  const misurazioni = cerca(radice, "PweMisurazioni");
  const elenco = cerca(misurazioni, "PweElencoPrezzi");
  const vociComputo = cerca(misurazioni, "PweVociComputo");
  if (!elenco || !vociComputo) throw new Error("Il file non sembra un XPWE di PriMus: mancano l'elenco prezzi o le voci del computo.");

  const dati = cerca(radice, "PweDGDatiGenerali");
  const capCat = cerca(radice, "PweDGCapitoliCategorie");
  const livelli = {
    spCat: elencoLivelli(capCat, "PweDGSuperCategorie"), cat: elencoLivelli(capCat, "PweDGCategorie"), sbCat: elencoLivelli(capCat, "PweDGSubCategorie"),
    spCap: elencoLivelli(capCat, "PweDGSuperCapitoli"), cap: elencoLivelli(capCat, "PweDGCapitoli"), sbCap: elencoLivelli(capCat, "PweDGSubCapitoli"),
  };

  const ep = new Map<string, XmlNodo>();
  for (const item of figli(elenco, "EPItem")) ep.set(idDi(item), item);

  const avvisi: string[] = [];
  const voci: ComputoVoceStrutturata[] = [];
  const livello = (mappa: Map<string, ComputoLivello>, id: string) => (id && id !== "0" ? mappa.get(id) ?? null : null);
  for (const [indice, vc] of figli(vociComputo, "VCItem").entries()) {
    const numero = String(indice + 1);
    const prezzo = ep.get(testoDi(vc, "IDEP"));
    const avvisiVoce: string[] = [];
    if (!prezzo) avvisiVoce.push(`Voce ${numero}: articolo ${testoDi(vc, "IDEP") || "?"} assente dall'elenco prezzi.`);
    const misure: ComputoMisura[] = [];
    for (const rg of figli(figlio(vc, "PweVCMisure"), "RGItem")) {
      const campi = { parti_uguali: "PartiUguali", lunghezza: "Lunghezza", larghezza: "Larghezza", altezza_peso: "HPeso" } as const;
      const formule: string[] = [];
      const m: ComputoMisura = { descrizione: pulisci(testoDi(rg, "Descrizione")), parti_uguali: null, lunghezza: null, larghezza: null, altezza_peso: null, quantita: null, formula: null };
      for (const [campo, tag] of Object.entries(campi) as Array<[keyof typeof campi, string]>) {
        const grezzo = testoDi(rg, tag);
        const v = numeroXpwe(grezzo);
        m[campo] = v === null ? null : arrotonda(v, 4);
        if (grezzo && !/^[+-]?\d+([.,]\d+)?$/.test(grezzo)) {
          formule.push(`${{ parti_uguali: "par.ug.", lunghezza: "lung.", larghezza: "larg.", altezza_peso: "h/peso" }[campo]}=${grezzo}`);
          if (v === null) avvisiVoce.push(`Voce ${numero}: formula non leggibile «${grezzo}».`);
        }
      }
      m.formula = formule.length ? formule.join("; ") : null;
      const fattori = [m.parti_uguali, m.lunghezza, m.larghezza, m.altezza_peso].filter((x): x is number => x !== null);
      const q = numeroXpwe(testoDi(rg, "Quantita"));
      m.quantita = q !== null ? arrotonda(q, 4) : fattori.length ? arrotonda(fattori.reduce((a, b) => a * b, 1), 4) : null;
      if (m.descrizione || fattori.length || m.quantita !== null) misure.push(m);
    }
    const qDichiarata = numeroXpwe(testoDi(vc, "Quantita"));
    const qMisure = misure.some(m => m.quantita !== null) ? arrotonda(misure.reduce((s, m) => s + (m.quantita ?? 0), 0), 2) : null;
    const quantita = qDichiarata !== null ? arrotonda(qDichiarata, 2) : qMisure;
    const prezzoUnitario = prezzo ? numeroXpwe(testoDi(prezzo, "Prezzo1")) : null;
    const um = prezzo ? testoDi(prezzo, "UnMisura") : "";
    const importo = quantita !== null && prezzoUnitario !== null ? arrotonda(quantita * prezzoUnitario / (um === "%" ? 100 : 1)) : null;
    const sp = livello(livelli.spCat, testoDi(vc, "IDSpCat")) ?? livello(livelli.spCap, prezzo ? testoDi(prezzo, "IDSpCap") : "");
    const cat = livello(livelli.cat, testoDi(vc, "IDCat")) ?? livello(livelli.cap, prezzo ? testoDi(prezzo, "IDCap") : "");
    const sb = livello(livelli.sbCat, testoDi(vc, "IDSbCat")) ?? livello(livelli.sbCap, prezzo ? testoDi(prezzo, "IDSbCap") : "");
    const tariffa = prezzo ? testoDi(prezzo, "Tariffa") : "";
    const articolo = prezzo ? testoDi(prezzo, "Articolo") : "";
    const descrizione = prezzo ? pulisci(testoDi(prezzo, "DesEstesa") || testoDi(prezzo, "DesBreve") || testoDi(prezzo, "DesRidotta")) : "";
    voci.push({
      numero_ordine: numero, codici: [tariffa, articolo].filter(Boolean), codice_tariffa: tariffa,
      descrizione, descrizione_troncata: false, unita_misura: um,
      quantita, prezzo_unitario: prezzoUnitario, importo,
      sezione: null, super_categoria: sp, categoria: cat, sotto_categoria: sb,
      is_sicurezza: eSicurezza(sp?.nome, cat?.nome, sb?.nome),
      is_detrazione: quantita !== null && quantita < 0, a_corpo: /corpo/i.test(um),
      misure, pagina: null, avvisi: avvisiVoce,
    });
  }
  if (!voci.length) avvisi.push("Nessuna voce nel computo XPWE.");
  return {
    formato: "xpwe",
    metadata: {
      oggetto_lavori: pulisci(testoDi(dati, "Oggetto")) || null,
      committente: pulisci(testoDi(dati, "Committente")) || null,
      impresa: pulisci(testoDi(dati, "Impresa")) || null,
    },
    voci, totale_dichiarato: null, riepiloghi: [], prezzari: [], avvisi,
  };
}
