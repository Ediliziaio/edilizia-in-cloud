/**
 * Lo standard del listino infissi, uguale per tutte le aziende.
 *
 * Un serramentista non ragiona per articoli: ragiona per **linee** (il modello
 * di profilo: PVC Salamander 76, PVC Aluplast Ideal 5000, alluminio, legno) e
 * per **tipologie** (finestra 1/2/3 ante, porta finestra, scorrevole…). Il
 * prezzo è al metro quadro della configurazione base — bianco, vetro standard,
 * posa inclusa — e tutto il resto è uno scostamento in percentuale: una linea
 * più economica, un colore pellicolato, un vetro antisonoro.
 *
 * Prima questo modello non c'era: chi vendeva due linee doveva duplicare tutte
 * le tipologie (una azienda è arrivata a cinque prodotti con lo stesso nome), e
 * i modelli installabili nascevano "a prezzo per misura" con la tabella delle
 * misure vuota, cioè senza saper calcolare niente.
 *
 * Qui sta solo il calcolo: nessuna chiamata al database, così si può provare.
 */

/** Una linea di prodotto: il modello di profilo che attraversa tutte le tipologie. */
export interface LineaStandard {
  /** Come la chiama l'azienda: "PVC Salamander 76". */
  nome: string;
  /** PVC, Alluminio, Legno, Alluminio-Legno… Facoltativo, serve a raggruppare. */
  materiale?: string;
  /**
   * Scostamento sul prezzo rispetto alla linea base, in percentuale.
   * La prima linea è la base e vale 0. Una linea più economica è negativa (−8).
   * Si applica sia all'acquisto che alla vendita, così il margine non cambia.
   */
  differenzaPct: number;
}

export interface OpzioniColore {
  /** Colore standard di gamma (es. RAL a catalogo). */
  standardPct: number;
  /** Colore fuori standard / pellicolato speciale. */
  fuoriStandardPct: number;
}

export interface OpzioniVetro {
  antisonoroPct: number;
  antisfondamentoPct: number;
}

export interface StandardSerramenti {
  linee: LineaStandard[];
  /** Prezzo al metro quadro della configurazione base, linea base. */
  prezzoAcquistoMq: number;
  prezzoVenditaMq: number;
  colore: OpzioniColore;
  vetro: OpzioniVetro;
}

/** Codici delle varianti standard: gli stessi dei modelli installabili. */
export const CODICE_ASSE = {
  linea: "linea",
  colore: "colore",
  vetro: "tipologia_vetro",
} as const;

export const VALORE_COLORE = {
  bianco: "bianco",
  standard: "colore_standard",
  fuoriStandard: "colore_fuori_standard",
} as const;

export const VALORE_VETRO = {
  standard: "standard",
  antisonoro: "antisonoro",
  antisfondamento: "antisfondamento",
} as const;

/** Da "PVC Salamander 76" a "pvc_salamander_76": il codice interno della variante. */
export function codiceLinea(nome: string): string {
  const base = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "linea";
}

/** Problemi che impediscono di salvare. Lista vuota = si può procedere. */
export function validaStandard(s: StandardSerramenti): string[] {
  const errori: string[] = [];
  const linee = s.linee.filter((l) => l.nome.trim() !== "");
  if (linee.length === 0) errori.push("Serve almeno una linea (il modello di profilo che vendi).");
  const codici = linee.map((l) => codiceLinea(l.nome));
  if (new Set(codici).size !== codici.length) errori.push("Due linee hanno lo stesso nome.");
  if (!(s.prezzoVenditaMq > 0)) errori.push("Il prezzo di vendita al metro quadro deve essere maggiore di zero.");
  if (s.prezzoAcquistoMq < 0) errori.push("Il prezzo di acquisto non può essere negativo.");
  if (s.prezzoAcquistoMq > s.prezzoVenditaMq) errori.push("Il prezzo di acquisto è più alto di quello di vendita: il margine sarebbe negativo.");
  for (const l of linee) {
    if (l.differenzaPct <= -100) errori.push(`La linea "${l.nome}" azzera o ribalta il prezzo (${l.differenzaPct}%).`);
  }
  return errori;
}

/** Avvisi: non bloccano, ma è giusto vederli prima di applicare a tutto il listino. */
export function avvisiStandard(s: StandardSerramenti): string[] {
  const avvisi: string[] = [];
  const m = margine(s.prezzoAcquistoMq, s.prezzoVenditaMq);
  if (m < 0.2) avvisi.push(`Margine del ${(m * 100).toFixed(0)}%: controlla i due prezzi.`);
  if (s.colore.standardPct === 0 && s.colore.fuoriStandardPct === 0)
    avvisi.push("Colore standard e fuori standard restano a 0%: verranno offerti gratis.");
  if (s.vetro.antisonoroPct === 0 && s.vetro.antisfondamentoPct === 0)
    avvisi.push("Vetro antisonoro e antisfondamento restano a 0%: verranno offerti gratis.");
  if (s.linee.length === 1) avvisi.push("Hai impostato una linea sola: le altre si aggiungono quando vuoi.");
  return avvisi;
}

export function margine(acquisto: number, vendita: number): number {
  return vendita > 0 ? (vendita - acquisto) / vendita : 0;
}

/** Prezzi al metro quadro di una linea: base più il suo scostamento. */
export function prezzoLinea(s: StandardSerramenti, linea: LineaStandard): { acquisto: number; vendita: number } {
  const k = 1 + linea.differenzaPct / 100;
  return {
    acquisto: arrotonda(s.prezzoAcquistoMq * k),
    vendita: arrotonda(s.prezzoVenditaMq * k),
  };
}

export interface AnteprimaRiga {
  linea: string;
  mq: number;
  vendita: number;
  acquisto: number;
  marginePct: number;
}

/**
 * Anteprima su una misura reale, con le stesse regole del motore preventivi:
 * prezzo al mq × metri quadri, poi le percentuali delle varianti scelte.
 */
export function anteprima(
  s: StandardSerramenti,
  larghezzaMm: number,
  altezzaMm: number,
  opzioni: { colore?: keyof OpzioniColore | "bianco"; vetro?: keyof OpzioniVetro | "standard" } = {},
): AnteprimaRiga[] {
  const mq = arrotonda((larghezzaMm / 1000) * (altezzaMm / 1000), 4);
  const pctColore =
    opzioni.colore === "standardPct" ? s.colore.standardPct
      : opzioni.colore === "fuoriStandardPct" ? s.colore.fuoriStandardPct
        : 0;
  const pctVetro =
    opzioni.vetro === "antisonoroPct" ? s.vetro.antisonoroPct
      : opzioni.vetro === "antisfondamentoPct" ? s.vetro.antisfondamentoPct
        : 0;
  const moltiplicatore = (1 + pctColore / 100) * (1 + pctVetro / 100);
  return s.linee
    .filter((l) => l.nome.trim() !== "")
    .map((l) => {
      const p = prezzoLinea(s, l);
      const vendita = arrotonda(p.vendita * mq * moltiplicatore);
      const acquisto = arrotonda(p.acquisto * mq * moltiplicatore);
      return { linea: l.nome, mq, vendita, acquisto, marginePct: margine(acquisto, vendita) * 100 };
    });
}

/** Le varianti da scrivere per un asse, già pronte per il database. */
export interface VarianteDaScrivere {
  valore: string;
  label: string;
  is_default: boolean;
  maggiorazione_tipo: "none" | "percentuale";
  maggiorazione_valore: number;
  maggiorazione_acquisto: number;
  sort_order: number;
}

/** Le linee diventano le varianti dell'asse "Linea": la prima è quella di base. */
export function variantiLinea(linee: LineaStandard[]): VarianteDaScrivere[] {
  return linee
    .filter((l) => l.nome.trim() !== "")
    .map((l, i) => ({
      valore: codiceLinea(l.nome),
      label: l.materiale ? `${l.materiale} ${l.nome}`.replace(`${l.materiale} ${l.materiale}`, l.materiale) : l.nome,
      is_default: i === 0,
      maggiorazione_tipo: l.differenzaPct === 0 ? ("none" as const) : ("percentuale" as const),
      maggiorazione_valore: l.differenzaPct,
      maggiorazione_acquisto: l.differenzaPct,
      sort_order: i,
    }));
}

/** Percentuali da scrivere sulle varianti colore/vetro già esistenti. */
export function percentualiOpzioni(s: StandardSerramenti): Record<string, number> {
  return {
    [VALORE_COLORE.bianco]: 0,
    [VALORE_COLORE.standard]: s.colore.standardPct,
    [VALORE_COLORE.fuoriStandard]: s.colore.fuoriStandardPct,
    [VALORE_VETRO.standard]: 0,
    [VALORE_VETRO.antisonoro]: s.vetro.antisonoroPct,
    [VALORE_VETRO.antisfondamento]: s.vetro.antisfondamentoPct,
  };
}

function arrotonda(n: number, decimali = 2): number {
  const f = 10 ** decimali;
  return Math.round(n * f) / f;
}
