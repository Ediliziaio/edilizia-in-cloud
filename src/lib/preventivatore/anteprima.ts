/**
 * Il contratto dell'anteprima live del preventivo (il pannello a destra).
 *
 * Ogni modulo costruisce, con una funzione PURA, un `AnteprimaPreventivo` dai
 * suoi dati (righe, totali, cliente) e il pannello lo disegna uguale per tutti:
 * `components/preventivatore/AnteprimaVeloce.tsx`. Niente rete, niente stato:
 * si ricalcola a ogni tasto, e i conti sono quelli che usano già lo step
 * Economia e il PDF (ogni modulo richiama la propria funzione di calcolo, non ne
 * scrive una seconda).
 *
 * Per il modulo Serramenti: `lib/serramenti/anteprima.ts`.
 */

/** Chi guarda: il cliente vede prezzi e totali; l'impresa vede anche costi e margine. */
export type VistaAnteprima = "cliente" | "impresa";

export interface RigaAnteprima {
  id: string;
  titolo: string;
  /** Una sola riga di dettagli: serie, apertura, colori, misure. */
  dettaglio?: string | null;
  quantita: number;
  /** «pz», «mq», «a corpo»: vuoto = pezzi. */
  unita?: string | null;
  prezzoUnitario: number | null;
  /** `null` o 0 = riga senza prezzo («da prezzare»). */
  totale: number | null;
  /** Vista impresa: costo della riga. `null` = costo non noto. */
  costo?: number | null;
}

export interface GruppoAnteprima {
  id: string;
  titolo: string;
  righe: RigaAnteprima[];
}

export interface VoceTotale {
  id: string;
  etichetta: string;
  importo: number;
  /** L'ultima riga del riepilogo: il totale da pagare. */
  forte?: boolean;
  /** Si sottrae (sconto): si scrive con il meno davanti. */
  negativo?: boolean;
}

export interface MargineAnteprima {
  costi: number;
  /**
   * `null` quando il modulo non dà un margine a costi incompleti (i moduli edili:
   * una voce venduta senza costo conterebbe a costo zero e il margine salirebbe
   * verso il 100%). I serramenti danno il margine parziale e lo dicono.
   */
  margine: number | null;
  /** `null` quando i costi non sono completi: una percentuale sarebbe fuorviante. */
  marginePct: number | null;
  costiCompleti: boolean;
  righeSenzaCosto: number;
  sottoTarget?: boolean;
  margineMinPct?: number;
}

/** La detrazione fiscale indicativa (bonus casa): importo, aliquota e tetto di spesa. */
export interface DetrazioneAnteprima {
  pct: number;
  importo: number;
  /** Il tetto di spesa su cui si calcola; `null` = nessun massimale. */
  massimale: number | null;
  /** La spesa supera il tetto: la detrazione si ferma lì. */
  oltreMassimale: boolean;
  /** Come si legge questo importo, se non basta la frase di serie («Stima sull'imponibile netto»). */
  nota?: string | null;
}

/** Un numero che racconta il lavoro in una riga: «Potenza 8,64 kWp», «Produzione 10.700 kWh/anno». */
export interface VoceSintesi {
  id: string;
  etichetta: string;
  valore: string;
}

/** Le esigenze del cliente scelte per questo preventivo, per l'anteprima (i titoli bastano). */
export interface EsigenzeAnteprima {
  /** Come le intitola il PDF del modulo: «Da dove partiamo», «Le tue esigenze». */
  titolo: string;
  voci: string[];
}

export interface AnteprimaPreventivo {
  emittente?: string | null;
  codice?: string | null;
  /** «5 ottobre 2026 · valido fino al 4 novembre 2026» */
  dataEtichetta?: string | null;
  titolo?: string | null;
  cliente: { nome?: string | null; righe: string[] };
  cantiere?: string | null;
  /** Facoltative: se nessuna è scelta non si mostra niente e il PDF resta quello di serie. */
  esigenze?: EsigenzeAnteprima | null;
  gruppi: GruppoAnteprima[];
  totali: VoceTotale[];
  /** Il totale IVA inclusa; `null` quando non c'è ancora niente da sommare. */
  totaleDocumento: number | null;
  /**
   * Il prezzo è scritto a mano per tutto il preventivo: le righe a 0 € non sono
   * «da prezzare» (il prezzo concordato le comprende) e non si avvisa.
   */
  prezzoACorpo?: boolean;
  /** Cose da sapere subito («2 righe senza prezzo»). */
  avvisi: string[];
  /** Note sul calcolo («prezzo scritto a mano»). */
  note: string[];
  /** Solo se chi guarda può vedere i margini: costi e margine del preventivo. */
  impresa?: MargineAnteprima | null;
  /** La detrazione indicativa, dove il modulo la prevede (il PDF la stampa). */
  detrazione?: DetrazioneAnteprima | null;
  /** I numeri del lavoro (potenza, produzione…) sotto il cliente: dove le righe da sole non li dicono. */
  sintesi?: VoceSintesi[];
}

/** Una riga senza prezzo: scritta a 0 € o non ancora prezzata. */
export const rigaDaPrezzare = (riga: Pick<RigaAnteprima, "totale">): boolean =>
  riga.totale == null || !(riga.totale > 0);

/** Quante righe del preventivo non hanno ancora un prezzo. */
export function righeDaPrezzare(anteprima: Pick<AnteprimaPreventivo, "gruppi">): number {
  return anteprima.gruppi.reduce((n, g) => n + g.righe.filter(rigaDaPrezzare).length, 0);
}

/**
 * Le righe senza prezzo di cui avvisare: col prezzo scritto a mano nessuna, perché
 * il prezzo concordato le comprende.
 */
export function righeSenzaPrezzo(anteprima: Pick<AnteprimaPreventivo, "gruppi" | "prezzoACorpo">): number {
  return anteprima.prezzoACorpo ? 0 : righeDaPrezzare(anteprima);
}

export function righeTotali(anteprima: Pick<AnteprimaPreventivo, "gruppi">): number {
  return anteprima.gruppi.reduce((n, g) => n + g.righe.length, 0);
}

/**
 * Euro all'italiana, sempre con il punto delle migliaia («€ 5.121»): l'italiano
 * di norma lo omette sotto le cinque cifre e in colonna i numeri non si
 * allineano.
 */
export function formattaEuro(n: number | null | undefined, decimali = 0): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
    useGrouping: true,
  })}`;
}

export function formattaNumero(n: number | null | undefined, decimali = 0): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
    useGrouping: true,
  });
}

/** «3 pz», «12,5 mq», «a corpo»: la quantità come la scrive una riga di preventivo. */
export function formattaQuantita(quantita: number, unita?: string | null): string {
  const u = (unita ?? "").trim();
  if (u.toLowerCase() === "a corpo") return "a corpo";
  // Fino a due decimali, senza zeri inutili: «12,5 mq», non «12,50 mq».
  const n = Number(quantita).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: true });
  return u && u.toLowerCase() !== "pz" ? `${n} ${u}` : n;
}

/** «5 ottobre 2026». */
export function dataEstesa(d: Date): string {
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}
