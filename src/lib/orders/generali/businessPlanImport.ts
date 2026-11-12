import { indovinaCategoria, type CategoriaPiano, type TipoVoce } from "./pianoCategorie";
import { leggiNumeroItaliano } from "./pianoExcel";

export type CellaBusinessPlan = string | number | null;
export interface FoglioBusinessPlan {
  nome: string;
  righe: { numero: number; celle: CellaBusinessPlan[] }[];
  ai?: { righe: RigaBusinessPlan[]; avvisi: string[]; titolo: string; simulazione: Record<string, unknown> };
}
export interface RigaBusinessPlan {
  riga: number;
  descrizione: string;
  tipo: TipoVoce;
  categoria: CategoriaPiano;
  importo: number | null;
  problema: string | null;
  mese?: string | null;
  durataMesi?: number;
}
export interface AnalisiBusinessPlan {
  intestazioni: string[];
  colonnaDescrizione: number;
  colonnaImporto: number;
  titolo: string | null;
  righe: RigaBusinessPlan[];
  avvisi: string[];
  totaleCosti: number;
  totaleRicavi: number;
  totaleDichiarato: number | null;
}
const testo = (v: CellaBusinessPlan | undefined) => String(v ?? "").trim();
const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const numero = (v: CellaBusinessPlan | undefined) =>
  typeof v === "number" ? (Number.isFinite(v) ? v : null) : leggiNumeroItaliano(testo(v));
const somma = (righe: RigaBusinessPlan[], tipo: TipoVoce) =>
  Math.round(righe.filter((r) => r.tipo === tipo).reduce((n, r) => n + (r.importo ?? 0), 0) * 100) / 100;

/** ExcelJS non riconosce i tag OOXML con prefisso, pur essendo validi.
 * Si adatta soltanto la copia di lettura, mantenendo namespace, testi e valori;
 * il file originale e la sua impronta di importazione restano invariati. */
async function xlsxPerLettura(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const {default:JSZip} = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const spazio = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  let modificato = false;
  for (const file of zip.file(/^xl\/(?:workbook|styles|sharedStrings|worksheets\/[^/]+)\.xml$/)) {
    const xml = await file.async("string");
    if (!/xmlns:[\w.-]+=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/.test(xml)) continue;
    if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") throw new Error("Apri questo file nel portale per leggerlo, oppure salvalo nuovamente come cartella Excel .xlsx.");
    const documento = new DOMParser().parseFromString(xml,"application/xml");
    if (documento.getElementsByTagName("parsererror").length) throw new Error("Il file Excel contiene un foglio non leggibile. Aprilo in Excel e salvalo di nuovo come .xlsx.");
    const elementi = Array.from(documento.getElementsByTagNameNS(spazio,"*"));
    let cambiato = false;
    for (const elemento of elementi) {
      if (!elemento.prefix) continue;
      const senzaPrefisso = documento.createElementNS(spazio,elemento.localName);
      for (const attributo of Array.from(elemento.attributes)) {
        // Il serializzatore riuserebbe il vecchio prefisso anche sul nuovo tag.
        if (attributo.namespaceURI === "http://www.w3.org/2000/xmlns/" && attributo.value === spazio && attributo.prefix === "xmlns") continue;
        senzaPrefisso.setAttributeNS(attributo.namespaceURI,attributo.name,attributo.value);
      }
      if (elemento === documento.documentElement) senzaPrefisso.setAttributeNS("http://www.w3.org/2000/xmlns/","xmlns",spazio);
      while (elemento.firstChild) senzaPrefisso.appendChild(elemento.firstChild);
      elemento.parentNode?.replaceChild(senzaPrefisso,elemento);
      cambiato = true;
    }
    if (cambiato) {
      zip.file(file.name,new XMLSerializer().serializeToString(documento));
      modificato = true;
    }
  }
  return modificato ? zip.generateAsync({type:"arraybuffer"}) : buffer;
}

/** Reads cached values only. Excel formulas, hyperlinks and macros are never executed. */
export async function leggiFileBusinessPlan(buffer: ArrayBuffer): Promise<FoglioBusinessPlan[]> {
  if (buffer.byteLength > 15 * 1024 * 1024) throw new Error("Il file supera 15 MB.");
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await xlsxPerLettura(buffer));
  } catch(e) {
    if (e instanceof Error && /Apri questo file|Il file Excel/.test(e.message)) throw e;
    throw Object.assign(new Error("Non riesco a leggere questo file Excel. Verifica che non sia protetto da password e salvalo nuovamente in formato .xlsx."), {cause:e});
  }
  const fogli: FoglioBusinessPlan[] = [];
  wb.eachSheet((sheet) => {
    if (sheet.state !== "visible") return;
    if (sheet.rowCount > 5000 || sheet.columnCount > 100)
      throw new Error("Il foglio supera 5.000 righe o 100 colonne. Carica solo il business plan.");
    const righe: FoglioBusinessPlan["righe"] = [];
    sheet.eachRow((row, numeroRiga) => {
      const celle: CellaBusinessPlan[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        let value = cell.value;
        if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value))
          value = value.result ?? null;
        if (value && typeof value === "object" && "richText" in value)
          value = value.richText.map((t) => t.text).join("");
        if (value && typeof value === "object" && "text" in value) value = value.text;
        celle[column - 1] = typeof value === "number" || typeof value === "string" ? value : null;
      });
      righe.push({ numero: numeroRiga, celle });
    });
    fogli.push({ nome: sheet.name, righe });
  });
  if (!fogli.length) throw new Error("Il file non contiene fogli visibili.");
  return fogli;
}

function categoriaSezione(t: string): CategoriaPiano {
  if (/acquisizione|acquisto immobile/.test(t)) return "terreno";
  if (/progettazione|autorizz/.test(t)) return "progettazione";
  if (/finanziar/.test(t)) return "finanziari";
  if (/commercial|vendita/.test(t)) return "commercializzazione";
  if (/riserve|contingenze/.test(t)) return "imprevisti";
  if (/opere esterne|costruzione/.test(t)) return "costruzione";
  if (/cantiere/.test(t)) return "sicurezza";
  return "generali";
}

/** Imports detail rows. Subtotals, VAT totals and profit formulas stay outside the budget. */
export function analizzaBusinessPlan(
  foglio: FoglioBusinessPlan,
  colonne?: { descrizione: number; importo: number },
): AnalisiBusinessPlan {
  if (foglio.ai) return { intestazioni: ["Descrizione", "Previsto netto · AI"], colonnaDescrizione: 0, colonnaImporto: 1, titolo: foglio.ai.titolo, righe: foglio.ai.righe, avvisi: foglio.ai.avvisi, totaleCosti: somma(foglio.ai.righe, "costo"), totaleRicavi: somma(foglio.ai.righe, "ricavo"), totaleDichiarato: null };
  const headerIndex = foglio.righe.findIndex(
    (r) =>
      r.celle.some((c) => /descrizione|^voce$/i.test(testo(c))) &&
      r.celle.some((c) => /presunt|previst|budget|^importo$/i.test(testo(c))),
  );
  const header = foglio.righe[headerIndex];
  const intestazioni = header?.celle.map(testo) ?? [];
  const colonnaDescrizione =
    colonne?.descrizione ??
    Math.max(
      0,
      intestazioni.findIndex((t) => /descrizione|^voce$/i.test(t)),
    );
  const colonnaImporto =
    colonne?.importo ?? intestazioni.findIndex((t) => /presunt|previst|budget|^importo$/i.test(t));
  const titolo =
    foglio.righe
      .slice(0, Math.max(0, headerIndex))
      .flatMap((r) => r.celle)
      .map(testo)
      .find((t) => /business plan/i.test(t)) ?? null;
  const avvisi: string[] = [],
    righe: RigaBusinessPlan[] = [];
  if (!header || colonnaImporto < 0)
    return {
      intestazioni,
      colonnaDescrizione,
      colonnaImporto,
      titolo,
      righe,
      avvisi: [
        "Intestazioni non riconosciute. Servono Descrizione e Costi presunti, Previsto, Budget o Importo.",
      ],
      totaleCosti: 0,
      totaleRicavi: 0,
      totaleDichiarato: null,
    };
  let tipo: TipoVoce = "costo",
    sezione: CategoriaPiano = "altri_costi",
    totaleDichiarato: number | null = null;
  for (const row of foglio.righe.slice(headerIndex + 1)) {
    const descrizione = testo(row.celle[colonnaDescrizione]),
      n = norm(descrizione);
    if (!n) continue;
    if (tipo === "ricavo" && /^totale incassi/.test(n)) break;
    // «RICAVI» senza importo è una sezione; con un valore può essere il
    // riepilogo/margine dei vecchi modelli e non va sommato al dettaglio.
    if (/^incassi$|^ricavi previsti$|^vendite$/.test(n) || (n === "ricavi" && numero(row.celle[colonnaImporto]) === null)) {
      tipo = "ricavo";
      sezione = "vendite";
      continue;
    }
    if (/^totale costi generali$/.test(n)) totaleDichiarato = numero(row.celle[colonnaImporto]);
    if (/^(totale|totali|subtotale|somma|utile|ricavi$|incassi$)|^iva(?: [0-9]+|$)|utile rispetto/.test(n))
      continue;
    if (
      /^costi /.test(n) &&
      descrizione === descrizione.toUpperCase() &&
      numero(row.celle[colonnaImporto]) === null
    ) {
      tipo = "costo";
      sezione = categoriaSezione(n);
      continue;
    }
    const importo = numero(row.celle[colonnaImporto]),
      cat = indovinaCategoria(descrizione, tipo);
    const problema =
      importo === null
        ? "Importo da stimare"
        : importo < 0
          ? "Importo negativo: verifica il segno nel file"
          : importo === 0
            ? "Zero nel file: verifica che sia intenzionale"
            : null;
    righe.push({
      riga: row.numero,
      descrizione: descrizione.slice(0, 300),
      tipo,
      categoria: cat.sicura ? cat.categoria : sezione,
      importo: importo === null ? null : Math.round(importo * 100) / 100,
      problema,
    });
  }
  const totaleCosti = somma(righe, "costo"),
    totaleRicavi = somma(righe, "ricavo");
  if (totaleDichiarato !== null && Math.abs(totaleCosti - totaleDichiarato) > 0.02)
    avvisi.push(
      "Il totale dei costi nel file non coincide con la somma delle voci. L'importazione usa il dettaglio, inclusi gli oneri finanziari.",
    );
  if (righe.some((r) => r.importo === null))
    avvisi.push(
      "Sono presenti voci senza importo. Il budget valorizzato è parziale: completa le stime prima di approvarlo.",
    );
  avvisi.push(
    "Costi reali e saldi del foglio restano fuori dall'importazione: il consuntivo viene dai documenti registrati nel gestionale.",
  );
  avvisi.push(
    "Il file non assegna scadenze alle singole voci. Restano senza mese: completa il calendario prima di usare le previsioni di cassa.",
  );
  return {
    intestazioni,
    colonnaDescrizione,
    colonnaImporto,
    titolo,
    righe,
    avvisi,
    totaleCosti,
    totaleRicavi,
    totaleDichiarato,
  };
}
