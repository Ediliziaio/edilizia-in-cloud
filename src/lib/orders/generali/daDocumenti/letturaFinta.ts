/**
 * Commessa generale dai documenti — la lettura vista dall'utente (lotto 2 del piano
 * docs/piano-commessa-generale-da-documenti.md).
 *
 * Il popup di lettura disegna una «fotografia» della lettura in un dato momento: stato di ogni
 * pagina, dati trovati, costo, fase. Qui c'è la forma della fotografia (`FotoLettura`) e una
 * lettura FINTA che la produce da un copione a tempo, con documenti e cifre inventati. Quando
 * arriverà la lettura vera (lotto 1), la fotografia la costruiranno le righe di
 * `generale_lettura_pagine`: il popup non cambia.
 */
import type { DatiLetti, Occorrenza } from "./controlli.ts";
import type { TipoDaDocumenti } from "./catalogo.ts";

export type StatoPagina = "in_coda" | "in_lettura" | "testo" | "ocr" | "parser" | "bianca" | "esclusa" | "illeggibile";
export type FaseLettura = "caricamento" | "pagine" | "estrazione" | "controlli" | "finita";

export interface PaginaLettura {
  numero: number;
  stato: StatoPagina;
  /** Cosa c'è sulla pagina, quando è stata riconosciuta (articolato, polizza, computo…). */
  classe?: string;
  /** Perché è illeggibile o esclusa. */
  motivo?: string;
}

export interface FileLettura {
  id: string;
  nome: string;
  documento: string;
  /** XPWE, Excel, PriMus: letto dal parser, senza AI e senza pagine da mostrare. */
  strutturato?: boolean;
  pagine: PaginaLettura[];
}

export interface DatoArrivato { chiave: string; occorrenza: Occorrenza; t: number }

export interface FotoLettura {
  fase: FaseLettura;
  file: FileLettura[];
  dati: DatiLetti;
  /** In ordine di arrivo, per l'animazione. */
  arrivati: DatoArrivato[];
  costo: number;
  stimaCosto: number;
  /** Millisecondi trascorsi e stimati alla fine (dalle pagine già fatte, non a caso). */
  trascorso: number;
  restante: number | null;
  finita: boolean;
}

// ─── Copione ───────────────────────────────────────────────────────────────────

type Evento =
  | { t: number; tipo: "fase"; fase: FaseLettura }
  | { t: number; tipo: "pagina"; file: string; numero: number; stato: StatoPagina; classe?: string; motivo?: string }
  | { t: number; tipo: "dato"; chiave: string; occorrenza: Occorrenza }
  | { t: number; tipo: "costo"; importo: number };

export interface Copione {
  tipo: TipoDaDocumenti;
  file: { id: string; nome: string; documento: string; strutturato?: boolean; pagine: number }[];
  eventi: Evento[];
  durata: number;
  stimaCosto: number;
}

/** Costi inventati, in crediti: l'OCR di una pagina e l'estrazione di un gruppo di pagine. */
export const COSTO_FINTO = { ocr: 0.012, estrazione: 0.03 } as const;

type PaginaFinta = { stato: Exclude<StatoPagina, "in_coda" | "in_lettura">; classe: string; motivo?: string };
type FileFinto = {
  id: string; nome: string; documento: string; strutturato?: boolean;
  pagine: PaginaFinta[];
  dati: [string, Occorrenza["valore"], number, string, Partial<Occorrenza>?][];
};

const P = (n: number, stato: PaginaFinta["stato"], classe: string, motivo?: string): PaginaFinta[] =>
  Array.from({ length: n }, () => ({ stato, classe, motivo }));

/**
 * Un appalto pubblico inventato: contratto scansionato, verbale, polizza, computo XPWE e stima
 * della sicurezza col testo. Ha apposta una penale diversa fra contratto e verbale, pagine bianche,
 * un documento d'identità da escludere e una pagina illeggibile.
 */
const FILE_FINTI: FileFinto[] = [
  {
    id: "contratto", nome: "Contratto di appalto.pdf", documento: "Contratto",
    pagine: [
      { stato: "ocr", classe: "Frontespizio e registrazione" },
      ...P(10, "ocr", "Articolato"),
      { stato: "bianca", classe: "Pagina bianca" },
      ...P(2, "ocr", "Elenco degli allegati"),
    ],
    dati: [
      ["oggetto", "Manutenzione straordinaria di strade comunali, lotto prova", 1, "«Oggetto: manutenzione straordinaria…»"],
      ["committente", "Comune di Prova", 1, "«tra il Comune di Prova…»"],
      ["cig", "Z1A2B3C4D5", 2, "«CIG derivato Z1A2B3C4D5»"],
      ["cig_accordo", "Y9X8W7V6U5", 2, "«accordo quadro, CIG Y9X8W7V6U5»"],
      ["importo_contrattuale", 365000, 3, "«l'importo contrattuale è di euro 365.000,00»"],
      ["oneri_sicurezza", 15000, 3, "«di cui euro 15.000,00 per oneri della sicurezza»"],
      ["durata_giorni", 365, 4, "«365 giorni naturali e consecutivi»"],
      ["penale_permille", 0.5, 5, "«penale pari allo 0,5 per mille al giorno»"],
      ["penale_massima_pct", 10, 5, "«non superiore al 10%»"],
      ["rup", "Ing. Mario Prova", 6, "«Responsabile del Procedimento…»"],
      ["direttore_lavori", "Geom. Lucia Esempio", 6, "«Direttore dei Lavori…»"],
      ["rct_massimale_contratto", 500000, 9, "«massimale RCT non inferiore a euro 500.000»"],
      ["contratto_numero", "1234/2027", 1, "annotazione a margine", { aMano: true }],
    ],
  },
  {
    id: "verbale", nome: "Verbale di consegna.pdf", documento: "Verbale di consegna",
    pagine: [...P(2, "ocr", "Verbale"), { stato: "illeggibile", classe: "Verbale", motivo: "Timbro sopra il testo: ricarica una foto più nitida." }, { stato: "ocr", classe: "Firme" }],
    dati: [
      ["data_consegna", "2027-03-01", 1, "«in data 01/03/2027 si procede alla consegna…»"],
      ["importo_base", 400000, 2, "«importo a base di gara euro 400.000,00»"],
      ["ribasso_pct", 12.5, 2, "«ribasso offerto del 12,50%»"],
      ["data_fine_prevista", "2028-02-29", 2, "«ultimazione entro il 29/02/2028»"],
      ["penale_permille", 1, 2, "«penale dell'1 per mille»"],
    ],
  },
  {
    id: "polizza", nome: "Polizza CAR.pdf", documento: "Polizza CAR/RCT",
    pagine: [
      ...P(4, "ocr", "Polizza"),
      { stato: "esclusa", classe: "Documento d'identità", motivo: "Dati personali: la pagina resta nell'originale, non si legge." },
      { stato: "bianca", classe: "Pagina bianca" },
    ],
    dati: [
      ["car_somma_lavori", 365000, 2, "«Partita 1 – Opere: 365.000,00»"],
      ["rct_massimale", 500000, 2, "«Massimale RCT 500.000,00»"],
    ],
  },
  {
    id: "computo", nome: "Computo metrico.xpwe", documento: "Computo metrico", strutturato: true,
    pagine: [{ stato: "parser", classe: "Computo (XPWE, senza AI)" }],
    dati: [["totale_computo", 400000, 1, "Totale lavori del file XPWE", { certezza: "calcolato" }]],
  },
  {
    id: "sicurezza", nome: "Stima oneri sicurezza.pdf", documento: "Stima degli oneri della sicurezza",
    pagine: P(3, "testo", "Stima della sicurezza"),
    dati: [["totale_sicurezza", 15000, 3, "«Totale oneri della sicurezza 15.000,00»"]],
  },
];

/** Millisecondi per pagina, a velocità 1: il testo è quasi istantaneo, l'OCR no. */
const DURATA = { caricamento: 1200, testo: 180, ocr: 520, parser: 400, bianca: 120, esclusa: 160, illeggibile: 1400, estrazione: 900, controlli: 1200 } as const;

export function copioneFinto(): Copione {
  const eventi: Evento[] = [{ t: 0, tipo: "fase", fase: "caricamento" }];
  let t = DURATA.caricamento;
  let stimaCosto = 0;
  eventi.push({ t, tipo: "fase", fase: "pagine" });
  for (const f of FILE_FINTI) {
    f.pagine.forEach((p, i) => {
      eventi.push({ t, tipo: "pagina", file: f.id, numero: i + 1, stato: "in_lettura" });
      t += DURATA[p.stato];
      eventi.push({ t, tipo: "pagina", file: f.id, numero: i + 1, stato: p.stato, classe: p.classe, motivo: p.motivo });
      if (p.stato === "ocr") { eventi.push({ t, tipo: "costo", importo: COSTO_FINTO.ocr }); stimaCosto += COSTO_FINTO.ocr; }
    });
    // Finito il file, si estraggono i suoi dati: arrivano uno alla volta.
    if (!f.strutturato) { eventi.push({ t, tipo: "costo", importo: COSTO_FINTO.estrazione }); stimaCosto += COSTO_FINTO.estrazione; }
    const passo = Math.round(DURATA.estrazione / Math.max(1, f.dati.length));
    for (const [chiave, valore, pagina, citazione, extra] of f.dati) {
      t += passo;
      eventi.push({ t, tipo: "dato", chiave, occorrenza: { valore, pagina, citazione, file: f.nome, certezza: "letto", ...extra } });
    }
  }
  eventi.push({ t, tipo: "fase", fase: "controlli" });
  t += DURATA.controlli;
  eventi.push({ t, tipo: "fase", fase: "finita" });
  return {
    tipo: "appalto_pubblico",
    file: FILE_FINTI.map((f) => ({ id: f.id, nome: f.nome, documento: f.documento, strutturato: f.strutturato, pagine: f.pagine.length })),
    eventi,
    durata: t,
    stimaCosto: Math.round(stimaCosto * 1000) / 1000,
  };
}

// ─── Fotografia a un istante ───────────────────────────────────────────────────

export function fotoAl(copione: Copione, ms: number): FotoLettura {
  const file: FileLettura[] = copione.file.map((f) => ({
    id: f.id, nome: f.nome, documento: f.documento, strutturato: f.strutturato,
    pagine: Array.from({ length: f.pagine }, (_, i) => ({ numero: i + 1, stato: "in_coda" as StatoPagina })),
  }));
  const perId = new Map(file.map((f) => [f.id, f]));
  const dati: DatiLetti = {};
  const arrivati: DatoArrivato[] = [];
  let fase: FaseLettura = "caricamento";
  let costo = 0;
  for (const e of copione.eventi) {
    if (e.t > ms) break;
    if (e.tipo === "fase") fase = e.fase;
    else if (e.tipo === "costo") costo += e.importo;
    else if (e.tipo === "dato") {
      (dati[e.chiave] ??= []).push(e.occorrenza);
      arrivati.push({ chiave: e.chiave, occorrenza: e.occorrenza, t: e.t });
    } else {
      const p = perId.get(e.file)?.pagine[e.numero - 1];
      if (p) { p.stato = e.stato; p.classe = e.classe ?? p.classe; p.motivo = e.motivo; }
    }
  }
  const trascorso = Math.min(ms, copione.durata);
  const finita = fase === "finita";
  // Il tempo restante si stima dal ritmo delle pagine già chiuse, non da una cifra fissa.
  const tutte = file.flatMap((f) => f.pagine);
  const chiuse = tutte.filter((p) => p.stato !== "in_coda" && p.stato !== "in_lettura").length;
  const restante = finita ? 0 : chiuse < 3 ? null : Math.round((trascorso / chiuse) * (tutte.length - chiuse)) + (fase === "controlli" ? 0 : 1500);
  if (finita) {
    for (const p of tutte) if (p.stato === "in_lettura") p.stato = "illeggibile";
  }
  return { fase, file, dati, arrivati, costo: Math.round(costo * 1000) / 1000, stimaCosto: copione.stimaCosto, trascorso, restante, finita };
}

// ─── Conti per il riepilogo ────────────────────────────────────────────────────

export type ContoPagine = Record<StatoPagina, number> & { totale: number; chiuse: number };

export function contaPagine(foto: Pick<FotoLettura, "file">): ContoPagine {
  const conto: ContoPagine = { in_coda: 0, in_lettura: 0, testo: 0, ocr: 0, parser: 0, bianca: 0, esclusa: 0, illeggibile: 0, totale: 0, chiuse: 0 };
  for (const f of foto.file) for (const p of f.pagine) {
    conto[p.stato]++;
    conto.totale++;
    if (p.stato !== "in_coda" && p.stato !== "in_lettura") conto.chiuse++;
  }
  return conto;
}

/** «Letto tutto» vuol dire che ogni pagina ha uno stato finale: nessuna saltata. */
export const lettaTutta = (foto: Pick<FotoLettura, "file">): boolean => {
  const c = contaPagine(foto);
  return c.totale > 0 && c.chiuse === c.totale;
};
