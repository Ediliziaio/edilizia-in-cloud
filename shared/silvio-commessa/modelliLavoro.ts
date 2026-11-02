/**
 * Modelli per tipo di lavoro (31/10/2026, fase 1, lotto 1.3).
 * Vedi docs/piano-silvio-commessa-ai.md, sezioni 3.3 e 6.
 *
 * Quando nessun documento dice le fasi e quanto durano, Silvio parte da qui: «bagno
 * 6 mq» dà fasi e durate sensate, marcate come stima (fonte `modello`, fiducia sotto
 * 1, stato `proposta`). Sono modelli generici: nella fase 6 li sostituiscono le
 * durate delle commesse chiuse di ogni azienda.
 *
 * Da dove vengono i numeri (in giorni LAVORATIVI, una settimana = 5):
 * - bagno, tetto, ristrutturazione, climatizzazione, impianto elettrico, termoidraulica,
 *   pavimenti, piscina: le fasi tipiche dei preventivatori edili
 *   (`FASI_TIPICHE` in src/lib/preventivi/cronoprogramma.ts), alla misura di riferimento.
 *   Il test silvioCommessaModelli controlla che restino uguali;
 * - serramenti: i tempi predefiniti del preventivatore serramenti
 *   (`crono_giorni_produzione_default` 30 giorni solari ≈ 22 lavorativi,
 *   `crono_giorni_posa_per_pezzo_default` 0,8, `crono_giorni_collaudo_default` 1)
 *   e il rilievo del percorso «Serramentista» (src/lib/orderPlaybook.ts);
 * - fotovoltaico: il percorso «Fotovoltaico» di src/lib/orderPlaybook.ts (sopralluogo,
 *   pratiche, ordine, installazione, allaccio a 35 giorni solari) e le fasi del modulo
 *   (src/lib/moduli-vendita/fullFvModules.ts).
 *
 * Le fasi che crescono con la misura (`scala`) si allungano come (misura/riferimento)^esponente:
 * un bagno di 12 mq non dura il doppio di uno di 6. Le altre (pratiche, collaudo,
 * consegna del materiale) restano fisse.
 *
 * Senza dipendenze, compatibile con Deno.
 */
import type { FaseDelPiano, Frammento } from "./piano.ts";
import { spostaGiorniLavorativi } from "./fondi.ts";
import { CALENDARIO_NAZIONALE, primoGiornoUtile, type CalendarioCantiere } from "./calendario.ts";

export const TIPI_LAVORO = [
  "bagno", "tetto", "fotovoltaico", "serramenti", "elettrico", "termoidraulica",
  "climatizzazione", "pavimenti", "piscina", "ristrutturazione",
] as const;
export type TipoLavoro = (typeof TIPI_LAVORO)[number];

/** In che cosa si misura il lavoro. */
export type UnitaMisura = "mq" | "kW" | "pezzi";

export interface FaseModello {
  nome: string;
  /** Giorni lavorativi alla misura di riferimento. */
  giorni: number;
  /** Cresce con la misura? */
  scala: boolean;
}

export interface ModelloLavoro {
  tipo: TipoLavoro;
  etichetta: string;
  /** Il valore di `orders.tipo_lavoro` (i percorsi di src/lib/orders/workflowModels.ts). */
  tipoLavoroCommessa: string;
  unita: UnitaMisura;
  /** La misura a cui valgono i giorni delle fasi. */
  riferimento: number;
  /** Quanto le fasi che scalano seguono la misura: 1 = in proporzione, 0,5 = come la radice. */
  esponente: number;
  fasi: readonly FaseModello[];
}

const f = (nome: string, giorni: number, scala = true): FaseModello => ({ nome, giorni, scala });

export const MODELLI_LAVORO: Readonly<Record<TipoLavoro, ModelloLavoro>> = {
  bagno: {
    tipo: "bagno", etichetta: "bagno", tipoLavoroCommessa: "bagno", unita: "mq", riferimento: 6, esponente: 0.6,
    fasi: [
      f("Protezioni e demolizioni", 2), f("Impianti idrici ed elettrici", 3, false),
      f("Massetti e impermeabilizzazione", 3), f("Pavimenti e rivestimenti", 4),
      f("Sanitari e finiture", 2, false),
    ],
  },
  tetto: {
    tipo: "tetto", etichetta: "tetto", tipoLavoroCommessa: "tetti", unita: "mq", riferimento: 100, esponente: 0.7,
    fasi: [
      f("Ponteggio e sicurezza", 2, false), f("Rimozione del manto", 3),
      f("Isolamento e impermeabilizzazione", 4), f("Nuovo manto di copertura", 5),
      f("Lattoneria e smontaggio", 3, false),
    ],
  },
  fotovoltaico: {
    tipo: "fotovoltaico", etichetta: "impianto fotovoltaico", tipoLavoroCommessa: "fotovoltaico", unita: "kW", riferimento: 6, esponente: 0.7,
    fasi: [
      f("Sopralluogo tecnico e progetto", 2, false), f("Pratiche di connessione e del Comune", 5, false),
      f("Ordine e consegna di moduli e inverter", 10, false), f("Installazione dell'impianto", 3),
      f("Allaccio alla rete e collaudo", 5, false),
    ],
  },
  serramenti: {
    tipo: "serramenti", etichetta: "serramenti", tipoLavoroCommessa: "serramenti", unita: "pezzi", riferimento: 10, esponente: 1,
    fasi: [
      f("Rilievo definitivo delle misure", 1, false), f("Produzione dei serramenti", 22, false),
      f("Posa in opera", 8), f("Collaudo e consegna", 1, false),
    ],
  },
  elettrico: {
    tipo: "elettrico", etichetta: "impianto elettrico", tipoLavoroCommessa: "impianti", unita: "mq", riferimento: 90, esponente: 0.7,
    fasi: [
      f("Tracce e posa delle tubazioni", 4), f("Cablaggio", 4),
      f("Quadro e frutti", 3, false), f("Verifiche e certificazione", 1, false),
    ],
  },
  termoidraulica: {
    tipo: "termoidraulica", etichetta: "impianto termoidraulico", tipoLavoroCommessa: "impianti", unita: "mq", riferimento: 90, esponente: 0.6,
    fasi: [
      f("Consegna del materiale", 5, false), f("Smontaggio del vecchio impianto", 2),
      f("Posa del nuovo impianto", 5), f("Avviamento, collaudo e pratiche", 2, false),
    ],
  },
  climatizzazione: {
    tipo: "climatizzazione", etichetta: "climatizzazione", tipoLavoroCommessa: "impianti", unita: "pezzi", riferimento: 3, esponente: 0.7,
    fasi: [
      f("Sopralluogo e consegna materiale", 5, false), f("Linee frigorifere e scarichi", 3),
      f("Posa delle macchine", 2), f("Avviamento e collaudo", 1, false),
    ],
  },
  pavimenti: {
    tipo: "pavimenti", etichetta: "pavimenti", tipoLavoroCommessa: "generico", unita: "mq", riferimento: 50, esponente: 0.8,
    fasi: [
      f("Preparazione del fondo", 2), f("Posa", 5),
      f("Fughe e battiscopa", 2), f("Pulizia di fine cantiere", 1, false),
    ],
  },
  piscina: {
    tipo: "piscina", etichetta: "piscina", tipoLavoroCommessa: "generico", unita: "mq", riferimento: 32, esponente: 0.6,
    fasi: [
      f("Scavo e preparazione", 5), f("Struttura della vasca", 10),
      f("Impianti di filtrazione", 5, false), f("Rivestimento", 5),
      f("Riempimento e collaudo", 3, false),
    ],
  },
  ristrutturazione: {
    tipo: "ristrutturazione", etichetta: "ristrutturazione", tipoLavoroCommessa: "ristrutturazione", unita: "mq", riferimento: 80, esponente: 0.7,
    fasi: [
      f("Allestimento e protezioni", 2, false), f("Demolizioni e smaltimento", 4),
      f("Impianti", 10), f("Opere murarie e massetti", 10),
      f("Pavimenti e rivestimenti", 10), f("Finiture e pulizia", 5),
    ],
  },
};

/** Un lavoro piccolo non dura meno della metà abbondante, uno grande non più di quattro volte. */
const FATTORE_MIN = 0.4;
const FATTORE_MAX = 4;

/** Le fasi del modello alla misura data (senza misura, a quella di riferimento), una dopo l'altra. */
export function fasiDelModello(tipo: TipoLavoro, misura?: number | null): FaseDelPiano[] {
  const m = MODELLI_LAVORO[tipo];
  const valida = misura != null && Number.isFinite(misura) && misura > 0;
  const fattore = valida
    ? Math.min(FATTORE_MAX, Math.max(FATTORE_MIN, (misura / m.riferimento) ** m.esponente))
    : 1;
  let giorno = 1;
  return m.fasi.map((x) => {
    const giorni = Math.max(1, Math.round(x.scala ? x.giorni * fattore : x.giorni));
    const fase: FaseDelPiano = { name: x.nome, giorno_inizio: giorno, giorni };
    giorno += giorni;
    return fase;
  });
}

/** Il primo giorno lavorativo da `data` (AAAA-MM-GG) in poi: dalla fase 5 salta anche le feste. */
export function primoLavorativo(data: string, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): string {
  return primoGiornoUtile(data, cal);
}

/**
 * Le date di ogni fase con i lavori che partono il giorno `inizio` (AAAA-MM-GG), saltando
 * sabati, domeniche e feste (fase 5: col calendario dell'azienda, anche patrono e chiusure).
 * Le fasi senza giorno d'inizio o durata restano come sono.
 */
export function dateDelleFasi(fasi: readonly FaseDelPiano[], inizio: string, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): FaseDelPiano[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inizio)) return fasi.map((x) => ({ ...x }));
  const giorno1 = primoLavorativo(inizio, cal);
  return fasi.map((x) => {
    if (!x.giorno_inizio || !x.giorni) return { ...x };
    const start = spostaGiorniLavorativi(giorno1, x.giorno_inizio - 1, cal);
    return { ...x, start_date: start, end_date: spostaGiorniLavorativi(start, x.giorni - 1, cal) };
  });
}

/** L'ultimo giorno lavorativo delle fasi (giorno 1 = inizio lavori). */
export function giorniTotali(fasi: readonly FaseDelPiano[]): number {
  return fasi.reduce((max, x) => Math.max(max, (x.giorno_inizio ?? 1) + (x.giorni ?? 1) - 1), 0);
}

/** Le radici delle parole lunghe di un nome di fase: «Demolizioni e smaltimento» → demol, smalt. */
function radici(nome: string): Set<string> {
  return new Set(nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z]+/).filter((p) => p.length >= 5).map((p) => p.slice(0, 5)));
}

/**
 * Le fasi di un documento che ha i nomi ma non i tempi (31/10/2026, decisione rimasta
 * aperta dalla fase 1A): alle fasi senza durata dà quella del modello del lavoro, senza
 * toccare le fasi che una durata ce l'hanno. Così il preventivo resta la fonte delle fasi
 * e il modello riempie solo il buco: niente conflitto fra due elenchi.
 *
 * Una fase che somiglia a una del modello (una parola lunga in comune: «Demolizione del
 * bagno» e «Protezioni e demolizioni») ne prende la durata; le altre si dividono in parti
 * uguali i giorni che il modello dà al lavoro intero, tolti quelli già assegnati, almeno
 * uno a testa. I giorni d'inizio seguono l'ordine del documento, una fase dopo l'altra.
 */
export function durateDalModello(
  fasi: readonly FaseDelPiano[], tipo: TipoLavoro, misura?: number | null,
): { fasi: FaseDelPiano[]; completate: string[] } {
  const senza = (x: FaseDelPiano) => !(x.giorni && x.giorni > 0);
  if (!fasi.some(senza)) return { fasi: fasi.map((x) => ({ ...x })), completate: [] };
  const modello = fasiDelModello(tipo, misura);
  // La fase del modello con più parole in comune («Posa del nuovo manto» → «Nuovo manto di copertura»).
  const dalModello = (x: FaseDelPiano) => {
    const r = radici(x.name);
    let migliore: { giorni: number; comuni: number } | null = null;
    for (const m of modello) {
      const comuni = [...radici(m.name)].filter((p) => r.has(p)).length;
      if (comuni && (!migliore || comuni > migliore.comuni)) migliore = { giorni: m.giorni ?? 1, comuni };
    }
    return migliore?.giorni ?? null;
  };
  const giorni = fasi.map((x) => (senza(x) ? dalModello(x) : x.giorni!));
  const restano = giorni.filter((g) => g == null).length;
  if (restano) {
    const assegnati = giorni.reduce<number>((s, g) => s + (g ?? 0), 0);
    const quota = Math.max(1, Math.round(Math.max(0, giorniTotali(modello) - assegnati) / restano));
    for (let i = 0; i < giorni.length; i++) giorni[i] ??= quota;
  }
  const completate: string[] = [];
  let giorno = 1;
  // Se il documento non dice quando parte nessuna fase, la sequenza vale per tutte, anche per
  // quelle che la durata ce l'hanno (revisione 1/11, L4).
  const inSequenza = !fasi.some((x) => x.giorno_inizio);
  const out = fasi.map((x, i) => {
    const fase: FaseDelPiano = senza(x) ? { ...x, giorni: giorni[i]!, giorno_inizio: x.giorno_inizio ?? giorno }
      : inSequenza ? { ...x, giorno_inizio: giorno } : { ...x };
    if (senza(x)) completate.push(x.name);
    giorno = Math.max(giorno, (fase.giorno_inizio ?? giorno) + (fase.giorni ?? 1));
    return fase;
  });
  return { fasi: out, completate };
}

const PAROLE: ReadonlyArray<[TipoLavoro, RegExp]> = [
  ["fotovoltaico", /fotovolt|pannelli solari|\bfv\b|\bkwp?\b/],
  ["serramenti", /serrament|infiss|finestr|portefinestr/],
  ["climatizzazione", /climatizz|condizionator|split|pompa di calore aria/],
  ["piscina", /piscin/],
  // Un appartamento intero ha anche il bagno: prima del bagno.
  ["ristrutturazione", /appartament|villett|ristrutturazione (?:completa|totale|integrale)/],
  ["tetto", /\btett|copertur|\bmanto\b/],
  ["bagno", /\bbagn/],
  ["elettrico", /elettric/],
  ["termoidraulica", /termoidraul|idraulic|caldaia|riscaldament/],
  ["pavimenti", /pavimen|parquet/],
  ["ristrutturazione", /ristruttur|rifacimento/],
];

/** Il tipo di lavoro da un testo libero («rifare bagno 6 mq»), o null se non si capisce. */
export function riconosciTipoLavoro(testo: string | null | undefined): TipoLavoro | null {
  const s = String(testo ?? "").toLowerCase();
  if (!s.trim()) return null;
  return PAROLE.find(([, re]) => re.test(s))?.[0] ?? null;
}

/** La misura scritta in un testo («6 mq», «4,5 kW», «8 finestre»), nell'unità del modello. */
export function misuraDalTesto(testo: string | null | undefined, unita: UnitaMisura): number | null {
  const s = String(testo ?? "").toLowerCase().replace(/(\d)\.(\d{3})\b/g, "$1$2").replace(/,/g, ".");
  const re = unita === "mq" ? /(\d+(?:\.\d+)?)\s*(?:mq|m2|m²|metri quadr)/
    : unita === "kW" ? /(\d+(?:\.\d+)?)\s*kwp?\b/
    : /(\d+)\s*(?:pezzi|serrament|finestr|infiss|split|unit|macchin|condizionator)/;
  const m = re.exec(s);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const FIDUCIA_CON_MISURA = 0.5;
const FIDUCIA_SENZA_MISURA = 0.35;

export interface OpzioniModello {
  /** La misura nell'unità del modello (mq, kW, pezzi). */
  misura?: number | null;
  /** Inizio lavori AAAA-MM-GG: se c'è, le fasi hanno le date e c'è la fine prevista. */
  inizio?: string | null;
  /** Il calendario dell'azienda (revisione 1/11, L10): senza, le sole feste nazionali. */
  calendario?: CalendarioCantiere;
}

/**
 * Il frammento del modello: fasi con le durate, il tipo di lavoro e, se c'è l'inizio,
 * le date e la fine lavori. Tutto in `proposta`, con fiducia sotto 1.
 */
export function frammentoDalModello(tipo: TipoLavoro, opzioni: OpzioniModello = {}): Frammento {
  const m = MODELLI_LAVORO[tipo];
  const misura = opzioni.misura != null && opzioni.misura > 0 ? opzioni.misura : null;
  const fiducia = misura ? FIDUCIA_CON_MISURA : FIDUCIA_SENZA_MISURA;
  const unita = m.unita === "pezzi" ? (tipo === "serramenti" ? "serramenti" : "pezzi") : m.unita;
  const etichetta = `modello «${m.etichetta}»${misura ? ` (${String(misura).replace(".", ",")} ${unita})` : ""}`;
  const base = fasiDelModello(tipo, misura);
  const inizio = opzioni.inizio && /^\d{4}-\d{2}-\d{2}$/.test(opzioni.inizio) ? opzioni.inizio : null;
  const fasi = inizio ? dateDelleFasi(base, inizio, opzioni.calendario) : base;
  const nota = misura
    ? `Stima dal modello del ${m.etichetta}: durate tipiche, da correggere con i tempi delle tue squadre.`
    : `Stima dal modello del ${m.etichetta} senza misura (vale per circa ${m.riferimento} ${unita}): da correggere.`;
  const proposta = (valore: unknown) => ({ valore, fiducia, stato: "proposta" as const, nota });

  const frammento: Frammento = {
    fonte: { tipo: "modello", etichetta, dove: null },
    aree: {
      identita: { "identita.tipo_lavoro": { ...proposta(m.tipoLavoroCommessa), nota: null } },
      fasi: { "fasi.order_work_phases": proposta(fasi) },
    },
    avvisi: misura ? [] : [`manca la misura: durate a ${m.riferimento} ${unita}`],
    costoEur: 0,
  };
  if (inizio) {
    const fine = fasi[fasi.length - 1]?.end_date;
    if (fine) {
      frammento.aree.fasi!["fasi.work_end_date"] = proposta(fine);
      frammento.aree.fasi!["fasi.expected_date"] = proposta(fine);
    }
  }
  return frammento;
}

/** Comodo per il testo libero: riconosce tipo e misura, null se il tipo non si capisce. */
export function frammentoDalTesto(testo: string, inizio?: string | null, calendario?: CalendarioCantiere): Frammento | null {
  const tipo = riconosciTipoLavoro(testo);
  if (!tipo) return null;
  return frammentoDalModello(tipo, { misura: misuraDalTesto(testo, MODELLI_LAVORO[tipo].unita), inizio, calendario });
}
