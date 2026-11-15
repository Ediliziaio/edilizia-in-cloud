/**
 * I riferimenti di una fattura ricevuta, letti dall'XML FatturaPA (§7.5).
 *
 * Prima i dati strutturati, poi il resto: `DatiOrdineAcquisto`, `DatiContratto`,
 * `DatiConvenzione`, `DatiRicezione`, `DatiDDT` (con `RiferimentoNumeroLinea`,
 * che dice QUALI righe della fattura appartengono a quel documento), le righe
 * con `CodiceArticolo` e `AltriDatiGestionali`, e CUP/CIG/codice commessa.
 *
 * Senza DOM: espressioni regolari su un XML a cui si tolgono i prefissi. Così
 * gira uguale nel browser, nelle edge function e nei test. L'XML FatturaPA ha
 * uno schema fisso e questi blocchi non si annidano: le regex bastano e non
 * servono librerie.
 *
 * Un riferimento che non identifica niente («NO.ORD.», «.», un nome) resta nel
 * risultato con `numero: null`: si mostra, ma non abbina.
 */
import { dataIso, importo, numeroDocumento, type NumeroDocumento, unitaCanonica } from "./normalizza.ts";

export type TipoRiferimento = "ordine" | "contratto" | "convenzione" | "ricezione" | "fattura_collegata";

export interface RiferimentoDocumento {
  tipo: TipoRiferimento;
  /** Il numero letto e normalizzato, o null se non identifica un documento. */
  numero: NumeroDocumento | null;
  /** Il testo così com'è nell'XML. */
  testo: string;
  data: string | null;
  numItem: string | null;
  codiceCommessa: string | null;
  cup: string | null;
  cig: string | null;
  /** Righe della fattura a cui si riferisce. Vuoto = tutta la fattura. */
  righe: number[];
}

export interface RiferimentoDdt {
  numero: NumeroDocumento | null;
  testo: string;
  data: string | null;
  righe: number[];
}

export interface CodiceArticoloLetto {
  tipo: string;
  valore: string;
}

export interface RigaFatturaLetta {
  numeroLinea: number;
  codici: CodiceArticoloLetto[];
  descrizione: string;
  quantita: number | null;
  unitaLetta: string | null;
  unita: string | null;
  prezzoUnitario: number | null;
  totale: number;
  /** SC sconto, PR premio, AB abbuono, AC spesa accessoria (trasporto, imballo…). */
  tipoCessione: string | null;
  dataInizio: string | null;
  dataFine: string | null;
  altriDati: Array<{ tipo: string; testo: string | null; numero: number | null; data: string | null }>;
}

export interface RiferimentiFattura {
  ordini: RiferimentoDocumento[];
  contratti: RiferimentoDocumento[];
  convenzioni: RiferimentoDocumento[];
  ricezioni: RiferimentoDocumento[];
  fattureCollegate: RiferimentoDocumento[];
  ddt: RiferimentoDdt[];
  righe: RigaFatturaLetta[];
  cup: string[];
  cig: string[];
  /** Causale e note di testata: dove alcuni fornitori scrivono cantiere e commessa. */
  causale: string;
}

/** Toglie i prefissi di namespace dai nomi degli elementi (stessa regola di `fatturaRicevutaXml`). */
export function senzaPrefissi(xml: string): string {
  return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1");
}

const ENTITA: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodifica(v: string): string {
  return v
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITA[e])
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .trim();
}

function blocchi(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

function valori(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => decodifica(m[1])).filter(Boolean);
}

function valore(xml: string, tag: string): string | null {
  return valori(xml, tag)[0] ?? null;
}

function numeroXml(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const CUP = /\b([A-Z]\d{2}[A-Z]\d{2}[A-Z0-9]{9})\b/;
const CIG = /\b([0-9A-Z]{10})\b/;

function riferimento(tipo: TipoRiferimento, b: string): RiferimentoDocumento {
  const testo = valore(b, "IdDocumento") ?? "";
  return {
    tipo,
    numero: numeroDocumento(testo),
    testo,
    data: dataIso(valore(b, "Data")),
    numItem: valore(b, "NumItem"),
    codiceCommessa: valore(b, "CodiceCommessaConvenzione"),
    cup: valore(b, "CodiceCUP")?.toUpperCase() ?? null,
    cig: valore(b, "CodiceCIG")?.toUpperCase() ?? null,
    righe: valori(b, "RiferimentoNumeroLinea").map(Number).filter((n) => Number.isInteger(n) && n > 0),
  };
}

/**
 * Legge i riferimenti del corpo `indiceCorpo` (un file può contenere un lotto
 * di fatture: ognuna ha i suoi riferimenti e non si mescolano).
 */
export function leggiRiferimentiFattura(xmlGrezzo: string, indiceCorpo = 0): RiferimentiFattura {
  const xml = senzaPrefissi(String(xmlGrezzo ?? ""));
  const corpi = blocchi(xml, "FatturaElettronicaBody");
  const corpo = corpi[indiceCorpo] ?? (corpi.length ? "" : xml);
  const generali = blocchi(corpo, "DatiGenerali")[0] ?? "";

  const lista = (tag: string, tipo: TipoRiferimento) => blocchi(generali, tag).map((b) => riferimento(tipo, b));
  const ordini = lista("DatiOrdineAcquisto", "ordine");
  const contratti = lista("DatiContratto", "contratto");
  const convenzioni = lista("DatiConvenzione", "convenzione");
  const ricezioni = lista("DatiRicezione", "ricezione");
  const fattureCollegate = lista("DatiFattureCollegate", "fattura_collegata");

  const ddt: RiferimentoDdt[] = blocchi(generali, "DatiDDT").map((b) => {
    const testo = valore(b, "NumeroDDT") ?? "";
    return {
      numero: numeroDocumento(testo),
      testo,
      data: dataIso(valore(b, "DataDDT")),
      righe: valori(b, "RiferimentoNumeroLinea").map(Number).filter((n) => Number.isInteger(n) && n > 0),
    };
  });

  const righe: RigaFatturaLetta[] = blocchi(corpo, "DettaglioLinee").map((b, i) => {
    const unitaLetta = valore(b, "UnitaMisura");
    const tot = numeroXml(valore(b, "PrezzoTotale")) ?? 0;
    return {
      numeroLinea: Number(valore(b, "NumeroLinea")) || i + 1,
      codici: blocchi(b, "CodiceArticolo")
        .map((c) => ({ tipo: valore(c, "CodiceTipo") ?? "", valore: valore(c, "CodiceValore") ?? "" }))
        .filter((c) => c.valore),
      descrizione: valore(b, "Descrizione") ?? "",
      quantita: numeroXml(valore(b, "Quantita")),
      unitaLetta,
      unita: unitaCanonica(unitaLetta),
      prezzoUnitario: numeroXml(valore(b, "PrezzoUnitario")),
      totale: tot,
      tipoCessione: valore(b, "TipoCessionePrestazione"),
      dataInizio: dataIso(valore(b, "DataInizioPeriodo")),
      dataFine: dataIso(valore(b, "DataFinePeriodo")),
      altriDati: blocchi(b, "AltriDatiGestionali").map((a) => ({
        tipo: valore(a, "TipoDato") ?? "",
        testo: valore(a, "RiferimentoTesto"),
        numero: importo(valore(a, "RiferimentoNumero")),
        data: dataIso(valore(a, "RiferimentoData")),
      })),
    };
  });

  const testoRighe = righe.flatMap((r) => [r.descrizione, ...r.altriDati.map((a) => `${a.tipo} ${a.testo ?? ""}`)]).join("\n");
  const causale = valori(generali, "Causale").join(" ");
  const cup = new Set<string>();
  const cig = new Set<string>();
  for (const r of [...ordini, ...contratti, ...convenzioni, ...ricezioni]) {
    if (r.cup) cup.add(r.cup);
    if (r.cig) cig.add(r.cig);
  }
  // «CUP …»/«CIG …» scritti a mano nelle righe o nella causale (come `codici_cup_cig` nel database).
  for (const m of `${testoRighe}\n${causale}`.toUpperCase().matchAll(/\bC\.?\s*U\.?\s*P\.?\s*[:.\-n°]*\s*([A-Z0-9]{15})\b/g))
    if (CUP.test(m[1])) cup.add(m[1]);
  for (const m of `${testoRighe}\n${causale}`.toUpperCase().matchAll(/\bC\.?\s*I\.?\s*G\.?\s*[:.\-n°]*\s*([A-Z0-9]{10})\b/g))
    if (CIG.test(m[1]) && /\d/.test(m[1])) cig.add(m[1]);

  return { ordini, contratti, convenzioni, ricezioni, fattureCollegate, ddt, righe, cup: [...cup], cig: [...cig], causale };
}

/**
 * I DDT citati DENTRO le descrizioni («Rif. DDT n. 1068 del 07/09/2026»): molti
 * gestionali non compilano `DatiDDT` e scrivono la bolla nella prima riga.
 * Legge solo la forma con la parola DDT/bolla davanti: un numero nudo è anche
 * un prezzo, una misura o una data.
 */
export function ddtNelleDescrizioni(righe: RigaFatturaLetta[]): RiferimentoDdt[] {
  const trovati = new Map<string, RiferimentoDdt>();
  const re = /\b(?:d\.?\s*d\.?\s*t\.?|bolla|doc\.?\s*trasp(?:orto)?\.?)\s*(?:n(?:r|um)?\.?|n°|numero)?\s*[:.]?\s*([A-Z0-9][A-Z0-9/\-.]{0,20})(?:\s*(?:del|dd|data)\.?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}))?/gi;
  for (const r of righe) {
    for (const m of r.descrizione.matchAll(re)) {
      const numero = numeroDocumento(m[1].replace(/[.\-/]$/, ""));
      if (!numero) continue;
      const data = m[2] ? dataIso(m[2]) : null;
      const k = `${numero.chiave}|${data ?? ""}`;
      const gia = trovati.get(k);
      if (gia) gia.righe.push(r.numeroLinea);
      else trovati.set(k, { numero, testo: m[1], data, righe: [r.numeroLinea] });
    }
  }
  return [...trovati.values()];
}
