// src/lib/orders/generali/pianoExcel.ts
// «Incolla da Excel» nel piano economico (piano, §3.1 punto 7): oggi i business plan e i
// budget stanno in un foglio di calcolo. Si copiano le righe, si incollano, si vede
// un'anteprima riga per riga e solo dopo si salva.
//
// Si capisce da solo: separatore (tabulazione di Excel o «;»), intestazione, quale colonna
// è l'importo, il mese, la descrizione; numeri all'italiana («1.250.000,50 €»), mesi in
// tanti modi («03/2027», «mar 2027», «Mese 4», data di Excel). Le righe dei totali si
// saltano: sommerebbero due volte.
import { normalizzaCategoria } from "@/lib/controlloGestione/vociCassa";
import { aggiungiMesi, indovinaCategoria, type CategoriaPiano, type TipoVoce } from "@/lib/orders/generali/pianoCategorie";

export interface RigaIncollata {
  /** Numero della riga nel testo incollato (da 1). */
  riga: number;
  tipo: TipoVoce;
  categoria: CategoriaPiano;
  /** false = categoria scelta senza indizi: da controllare. */
  categoriaSicura: boolean;
  descrizione: string;
  importo: number | null;
  mese: string | null;
  durataMesi: number;
  figliaId: string | null;
  /** Cosa non va: una riga con problemi non si importa finché non si corregge. */
  problemi: string[];
}

export interface EsitoIncolla {
  righe: RigaIncollata[];
  intestazione: boolean;
  /** Righe vuote o di totale, saltate. */
  saltate: number;
}

export interface FigliaIncolla { id: string; codice: string | null; nome: string }

/** «1.250.000,50 €» → 1250000.5; «(1.000)» → −1000; «12,5%» → null. */
export function leggiNumeroItaliano(valore: string): number | null {
  let t = valore.trim().replace(/[€\s]/g, "").replace(/^eur|eur$/i, "");
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-") || t.startsWith("−")) {
    negativo = !negativo;
    t = t.slice(1);
  } else if (t.startsWith("+")) {
    t = t.slice(1);
  }
  t = t.replace(/'/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const virgola = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (virgola >= 0 && punto >= 0) {
    const decimale = virgola > punto ? "," : ".";
    const migliaia = decimale === "," ? "." : ",";
    t = t.split(migliaia).join("").replace(decimale, ".");
  } else if (virgola >= 0) {
    const parti = t.split(",");
    t = parti.length > 2 ? parti.join("") : t.replace(",", ".");
  } else if (punto >= 0) {
    const parti = t.split(".");
    // Alla maniera italiana: «1.500» e «1.500.000» sono migliaia; «1.5» e «1234.56» decimali.
    if (parti.length > 2 || (parti.length === 2 && parti[1].length === 3)) t = parti.join("");
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

const NOMI_MESI: Record<string, number> = {
  gen: 1, gennaio: 1, jan: 1, january: 1,
  feb: 2, febbraio: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  apr: 4, aprile: 4, april: 4,
  mag: 5, maggio: 5, may: 5,
  giu: 6, giugno: 6, jun: 6, june: 6,
  lug: 7, luglio: 7, jul: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  set: 9, sett: 9, settembre: 9, sep: 9, sept: 9, september: 9,
  ott: 10, ottobre: 10, oct: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dic: 12, dicembre: 12, dec: 12, december: 12,
};

const mese = (anno: number, m: number): string | null => {
  const a = anno < 100 ? 2000 + anno : anno;
  return m >= 1 && m <= 12 && a >= 1990 && a <= 2100 ? `${a}-${String(m).padStart(2, "0")}` : null;
};

/**
 * Il mese di una cella: «2027-03», «03/2027», «15/03/2027», «mar 2027», «marzo-27»,
 * «Mese 4» / «M4» (contati dal mese di partenza), data seriale di Excel.
 */
export function leggiMese(valore: string, partenza: string | null = null): string | null {
  const t = valore.trim().toLowerCase().replace(/[’']/g, " ");
  if (!t) return null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?/))) return mese(Number(m[1]), Number(m[2]));
  if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) return mese(Number(m[3]), Number(m[2]));
  if ((m = t.match(/^(\d{1,2})[-/.](\d{2}|\d{4})$/))) return mese(Number(m[2]), Number(m[1]));
  if ((m = t.match(/^([a-z]+)\.?[\s\-/]*(\d{2}|\d{4})$/)) && NOMI_MESI[m[1]]) return mese(Number(m[2]), NOMI_MESI[m[1]]);
  if ((m = t.match(/^(?:mese|m)\s*(\d{1,3})$/)) && partenza) {
    const n = Number(m[1]);
    return n >= 1 && n <= 240 ? aggiungiMesi(partenza, n - 1) : null;
  }
  if ((m = t.match(/^(\d{5})$/))) {
    // Data seriale di Excel: giorni dal 30/12/1899.
    const giorni = Number(m[1]);
    if (giorni < 30000 || giorni > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + giorni * 86_400_000);
    return mese(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  return null;
}

type Colonna = "descrizione" | "categoria" | "tipo" | "importo" | "mese" | "durata" | "figlia";

/** Che cosa dice un'intestazione. L'ordine conta: «mesi» è la durata, «mese» il mese. */
const INTESTAZIONI: [Colonna, RegExp][] = [
  ["durata", /^(durata|n_mesi|numero_mesi|mesi|n_rate|rate)$|durata/],
  ["mese", /mese|data|periodo|quando|inizio|scadenza/],
  ["categoria", /categor|capitolo|gruppo/],
  ["tipo", /^tipo|entrata_uscita|segno|natura/],
  ["importo", /importo|euro|eur$|totale|valore|costo|ricavo|budget|previsto|ammontare|cifra|prezzo/],
  ["figlia", /commessa|unita|lotto|ordine_di_lavoro|odl|figlia|appartamento/],
  ["descrizione", /voce|descriz|nome|dettaglio|oggetto|lavorazione|attivita/],
];

const RIGA_TOTALE = /^(totale|totali|subtotale|sub_totale|tot|somma)(_|$)/;

function separatore(righe: string[]): (r: string) => string[] {
  if (righe.some((r) => r.includes("\t"))) return (r) => r.split("\t");
  if (righe.some((r) => r.includes(";"))) return (r) => r.split(";");
  return (r) => [r];
}

function riconosciIntestazione(celle: string[]): Partial<Record<Colonna, number>> | null {
  const mappa: Partial<Record<Colonna, number>> = {};
  let riconosciute = 0;
  celle.forEach((c, i) => {
    const t = normalizzaCategoria(c);
    if (!t || leggiNumeroItaliano(c) !== null) return;
    const trovata = INTESTAZIONI.find(([col, re]) => mappa[col] === undefined && re.test(t));
    if (trovata) {
      mappa[trovata[0]] = i;
      riconosciute++;
    }
  });
  return riconosciute >= 1 && celle.every((c) => leggiNumeroItaliano(c) === null) ? mappa : null;
}

/** Senza intestazione: si guarda cosa c'è nelle colonne. */
function indovinaColonne(tabella: string[][], partenza: string | null): Partial<Record<Colonna, number>> {
  const larghezza = Math.max(...tabella.map((r) => r.length));
  const stat = Array.from({ length: larghezza }, (_, i) => {
    const celle = tabella.map((r) => (r[i] ?? "").trim()).filter(Boolean);
    const numeri = celle.map(leggiNumeroItaliano).filter((n): n is number => n !== null);
    const mesi = celle.filter((c) => leggiMese(c, partenza) !== null && !/^\d+([.,]\d+)?$/.test(c));
    return {
      i,
      piene: celle.length,
      numeri: numeri.length,
      mesi: mesi.length,
      massimo: numeri.reduce((t, n) => Math.max(t, Math.abs(n)), 0),
      piccoliInteri: numeri.length > 0 && numeri.every((n) => Number.isInteger(n) && n >= 1 && n <= 120),
      categorie: celle.filter((c) => indovinaCategoria(c).sicura).length,
    };
  });
  const mappa: Partial<Record<Colonna, number>> = {};
  const libera = (i: number) => !Object.values(mappa).includes(i);
  const meseCol = stat.filter((s) => s.mesi > 0 && s.mesi >= s.piene / 2).sort((a, b) => b.mesi - a.mesi)[0];
  if (meseCol) mappa.mese = meseCol.i;
  const numeriche = stat.filter((s) => libera(s.i) && s.numeri > 0 && s.numeri >= s.piene / 2);
  const importo = [...numeriche].sort((a, b) => b.massimo - a.massimo)[0];
  if (importo) mappa.importo = importo.i;
  const durata = numeriche.find((s) => s.i !== importo?.i && s.piccoliInteri);
  if (durata) mappa.durata = durata.i;
  const testuali = stat.filter((s) => libera(s.i) && s.piene > 0 && s.numeri < s.piene / 2);
  if (testuali[0]) mappa.descrizione = testuali[0].i;
  const categoria = testuali.slice(1).find((s) => s.categorie >= s.piene / 2);
  if (categoria) mappa.categoria = categoria.i;
  return mappa;
}

function tipoDa(testo: string): TipoVoce | null {
  const t = normalizzaCategoria(testo);
  if (!t) return null;
  if (/ricav|entrat|incass|vendit|^r$|^\+$|^e$/.test(t)) return "ricavo";
  if (/cost|uscit|spes|^c$|^u$|^-$/.test(t)) return "costo";
  return null;
}

function trovaFiglia(testo: string, figlie: FigliaIncolla[]): string | null {
  const t = normalizzaCategoria(testo);
  if (!t) return null;
  const esatta = figlie.find((f) => normalizzaCategoria(f.codice) === t || normalizzaCategoria(f.nome) === t);
  if (esatta) return esatta.id;
  const contenuta = figlie.filter((f) => normalizzaCategoria(f.nome).includes(t) || t.includes(normalizzaCategoria(f.nome)));
  return contenuta.length === 1 ? contenuta[0].id : null;
}

/** Il testo incollato → le righe da mostrare in anteprima. `partenza` serve per «Mese 1, Mese 2…». */
export function leggiIncolla(
  testo: string,
  opzioni: { partenza?: string | null; figlie?: FigliaIncolla[] } = {},
): EsitoIncolla {
  const partenza = opzioni.partenza ?? null;
  const figlie = opzioni.figlie ?? [];
  const linee = testo.replace(/\r\n?/g, "\n").split("\n");
  const dividi = separatore(linee);
  const tabella = linee.map((l, i) => ({ n: i + 1, celle: dividi(l).map((c) => c.trim().replace(/^"(.*)"$/, "$1")) }));
  const piene = tabella.filter((r) => r.celle.some((c) => c !== ""));
  let saltate = tabella.length - piene.length;
  if (piene.length === 0) return { righe: [], intestazione: false, saltate: 0 };

  const intestazione = riconosciIntestazione(piene[0].celle);
  const dati = intestazione ? piene.slice(1) : piene;
  const col = intestazione ?? indovinaColonne(dati.map((r) => r.celle), partenza);
  const cella = (r: string[], c: Colonna) => (col[c] === undefined ? "" : (r[col[c]!] ?? "").trim());

  const righe: RigaIncollata[] = [];
  for (const { n, celle } of dati) {
    const descrizione = cella(celle, "descrizione") || celle.find((c) => c && leggiNumeroItaliano(c) === null && leggiMese(c, partenza) === null) || "";
    if (RIGA_TOTALE.test(normalizzaCategoria(descrizione))) {
      saltate++;
      continue;
    }
    const problemi: string[] = [];
    const testoImporto = cella(celle, "importo");
    let importo = testoImporto ? leggiNumeroItaliano(testoImporto) : null;
    if (importo === null) problemi.push(testoImporto ? `Importo non riconosciuto: «${testoImporto}»` : "Manca l'importo");

    let tipo = tipoDa(cella(celle, "tipo"));
    if (importo !== null && importo < 0) {
      // Un importo negativo in un foglio senza colonna del tipo è un'uscita.
      if (tipo === null) tipo = "costo";
      importo = -importo;
    }
    const testoCategoria = cella(celle, "categoria");
    const daCategoria = testoCategoria ? indovinaCategoria(testoCategoria, tipo) : null;
    const scelta = daCategoria?.sicura ? daCategoria : indovinaCategoria(descrizione, tipo);
    tipo = tipo ?? scelta.tipo;

    const testoMese = cella(celle, "mese");
    const meseLetto = testoMese ? leggiMese(testoMese, partenza) : null;
    if (testoMese && !meseLetto) problemi.push(`Mese non riconosciuto: «${testoMese}»`);

    const testoDurata = cella(celle, "durata");
    const durata = testoDurata ? leggiNumeroItaliano(testoDurata) : null;
    if (testoDurata && (durata === null || !Number.isInteger(durata) || durata < 1 || durata > 120)) {
      problemi.push(`Durata non valida: «${testoDurata}» (da 1 a 120 mesi)`);
    }
    const testoFiglia = cella(celle, "figlia");
    const figliaId = testoFiglia ? trovaFiglia(testoFiglia, figlie) : null;
    if (testoFiglia && !figliaId) problemi.push(`Commessa non trovata: «${testoFiglia}»`);

    righe.push({
      riga: n,
      tipo,
      categoria: scelta.categoria,
      categoriaSicura: scelta.sicura,
      descrizione: descrizione.slice(0, 300),
      importo: importo === null ? null : Math.round(importo * 100) / 100,
      mese: meseLetto,
      durataMesi: durata !== null && Number.isInteger(durata) && durata >= 1 && durata <= 120 ? durata : 1,
      figliaId,
      problemi,
    });
  }
  return { righe, intestazione: intestazione !== null, saltate };
}
