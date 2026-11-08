/**
 * Computo da Excel: quali fogli leggere e le voci di un foglio.
 *
 * Fino al 07/11/2026 un Excel con più di un foglio veniva rifiutato («esporta
 * il foglio del computo separatamente»): negli ultimi 120 giorni 4 computi su
 * 22 caricati sono falliti così, in tre aziende diverse. Ma
 * un computo in Excel ha quasi sempre più fogli: la copertina, il riepilogo,
 * uno o più fogli di voci.
 *
 * Ora: si leggono TUTTI i fogli che hanno l'intestazione di un computo (almeno
 * tre fra codice, descrizione, u.m., quantità, prezzo, importo nelle prime 15
 * righe); gli altri (copertina, riepilogo, note) si saltano e si dice quali. Con
 * più fogli di voci, ogni foglio diventa il capitolo di partenza delle sue voci.
 * Nessun foglio si perde in silenzio.
 *
 * Funzioni pure, senza XLSX: le usa computo-ai-extract e i test.
 */
import { computoNumber, computoSummaryRow } from "./computoExtractionQuality.ts";

export type Riga = unknown[];

export interface ColonneComputo {
  codice?: number;
  descrizione?: number;
  um?: number;
  quantita?: number;
  prezzo?: number;
  importo?: number;
}

export interface IntestazioneComputo {
  riga: number;
  colonne: ColonneComputo;
}

export interface VoceFoglio {
  capitolo_numero: number;
  capitolo_nome: string;
  codice_voce: string;
  codice_prezzario: string;
  descrizione_breve: string;
  descrizione_estesa: string;
  unita_misura: string;
  quantita: number | null;
  prezzo_unitario: number | null;
  importo: number | null;
  confidence: number;
  warnings: string[];
}

const PAROLE = ["codice", "descrizione", "u.m", "quantit", "prezzo", "importo"];

const testo = (c: unknown) => String(c ?? "").toLowerCase();

/** La riga d'intestazione del computo nelle prime 15 righe, con le colonne; null se il foglio non è un computo. */
export function trovaIntestazione(righe: Riga[]): IntestazioneComputo | null {
  for (let i = 0; i < Math.min(righe.length, 15); i++) {
    const riga = righe[i];
    if (!riga) continue;
    const unita = riga.map(testo).join("|");
    if (PAROLE.filter((k) => unita.includes(k)).length < 3) continue;
    const colonne: ColonneComputo = {};
    riga.forEach((c, j) => {
      const cella = testo(c);
      if (cella.includes("codice") && colonne.codice === undefined) colonne.codice = j;
      if (cella.includes("descrizione") && colonne.descrizione === undefined) colonne.descrizione = j;
      if ((cella.includes("u.m") || cella.includes("unità") || cella.includes("unita")) && colonne.um === undefined) colonne.um = j;
      if ((cella.includes("quantit") || cella.includes("q.tà") || cella.includes("q.ta")) && colonne.quantita === undefined) colonne.quantita = j;
      if (cella.includes("prezzo") && !cella.includes("importo") && colonne.prezzo === undefined) colonne.prezzo = j;
      if ((cella.includes("importo") || (cella.includes("totale") && !cella.includes("sub"))) && colonne.importo === undefined) colonne.importo = j;
    });
    // Senza descrizione non ci sono voci da leggere: non è l'intestazione giusta.
    if (colonne.descrizione === undefined) continue;
    return { riga: i, colonne };
  }
  return null;
}

/** Quali fogli leggere: quelli con l'intestazione di un computo. Gli altri si dicono, non si perdono. */
export function fogliDelComputo(fogli: Array<{ nome: string; righe: Riga[] }>): {
  daLeggere: Array<{ nome: string; righe: Riga[]; intestazione: IntestazioneComputo }>;
  saltati: string[];
  vuoti: string[];
} {
  const vuoti = fogli.filter((f) => f.righe.length === 0).map((f) => f.nome);
  const pieni = fogli.filter((f) => f.righe.length > 0);
  const daLeggere: Array<{ nome: string; righe: Riga[]; intestazione: IntestazioneComputo }> = [];
  const saltati: string[] = [];
  for (const f of pieni) {
    const intestazione = trovaIntestazione(f.righe);
    // Un foglio di voci ha la quantità o il prezzo: un riepilogo con codice,
    // descrizione e importo ripeterebbe gli importi dei capitoli, e anche il
    // totale dichiarato, così il controllo del totale non se ne accorgerebbe.
    const conVoci = intestazione
      && (intestazione.colonne.quantita !== undefined || intestazione.colonne.prezzo !== undefined);
    if (intestazione && conVoci) daLeggere.push({ ...f, intestazione });
    else saltati.push(f.nome);
  }
  // Con più fogli di voci, quello che si chiama riepilogo (o quadro economico)
  // ripete gli altri: si salta. Se è l'unico, si legge.
  const nomeRiepilogo = /riepilog|sommario|quadro\s*economico|sintesi/i;
  if (daLeggere.length > 1 && daLeggere.some((f) => !nomeRiepilogo.test(f.nome))) {
    for (const f of daLeggere.filter((f) => nomeRiepilogo.test(f.nome))) saltati.push(f.nome);
    return { daLeggere: daLeggere.filter((f) => !nomeRiepilogo.test(f.nome)), saltati, vuoti };
  }
  return { daLeggere, saltati, vuoti };
}

/**
 * Le voci di un foglio, dalla riga dopo l'intestazione. `capitoloIniziale` è il
 * capitolo delle voci prima della prima riga di capitolo (il nome del foglio,
 * quando i fogli sono più d'uno). Restituisce anche il totale dichiarato, se il
 * foglio ha la riga del totale.
 */
export function vociDelFoglio(
  righe: Riga[],
  intestazione: IntestazioneComputo,
  capitoloIniziale: string,
  numeroIniziale: number,
): { voci: VoceFoglio[]; totaleDichiarato: number | null; ultimoNumero: number } {
  const c = intestazione.colonne;
  const cella = (riga: Riga, j: number | undefined) => (j === undefined ? undefined : riga[j]);
  const voci: VoceFoglio[] = [];
  let capitolo = capitoloIniziale;
  let numero = numeroIniziale;
  let totaleDichiarato: number | null = null;

  for (let i = intestazione.riga + 1; i < righe.length; i++) {
    const riga = righe[i];
    if (!riga || riga.every((x) => !x && x !== 0)) continue;
    const descrizione = String(cella(riga, c.descrizione) ?? "").trim();
    if (!descrizione) {
      // Il capitolo spesso sta nella prima colonna, non in quella della
      // descrizione: una riga con un solo testo, in maiuscolo, è un capitolo.
      const testi = riga.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (testi.length === 1 && testi[0].length > 3 && !computoNumber(testi[0], "italian")
          && (testi[0] === testi[0].toUpperCase() || testi[0].startsWith("CAP"))) {
        capitolo = testi[0];
        numero++;
      }
      continue;
    }
    const quantita = computoNumber(cella(riga, c.quantita), "italian");
    const prezzo = computoNumber(cella(riga, c.prezzo), "italian");
    const importo = computoNumber(cella(riga, c.importo), "italian");
    const riepilogo = computoSummaryRow(descrizione, quantita, prezzo);
    if (riepilogo) {
      if (riepilogo === "document_total") totaleDichiarato = importo;
      continue;
    }
    // Riga di capitolo: solo testo, tutto maiuscolo o «CAP…».
    if (!quantita && !prezzo && !importo && descrizione.length > 3
        && (descrizione === descrizione.toUpperCase() || descrizione.startsWith("CAP"))) {
      capitolo = descrizione;
      numero++;
      continue;
    }
    if (quantita || prezzo || importo) {
      voci.push({
        capitolo_numero: numero,
        capitolo_nome: capitolo,
        codice_voce: String(cella(riga, c.codice) ?? "").trim(),
        codice_prezzario: "",
        descrizione_breve: descrizione.substring(0, 100),
        descrizione_estesa: descrizione,
        unita_misura: String(cella(riga, c.um) ?? "").trim(),
        quantita,
        prezzo_unitario: prezzo,
        importo,
        confidence: 0.9,
        warnings: [],
      });
    }
  }
  return { voci, totaleDichiarato, ultimoNumero: numero };
}
