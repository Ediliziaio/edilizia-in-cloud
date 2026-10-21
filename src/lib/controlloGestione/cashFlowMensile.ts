/**
 * Cash flow previsionale del Controllo di gestione, mese per mese.
 *
 * Non è un secondo motore: prende i movimenti attesi del Previsionale
 * (`buildForecastLedger`, pagina /azienda/previsionale) e li proietta con
 * `projectForecast` e le stesse ipotesi della pagina appena aperta:
 *  - saldo di partenza = disponibilità dei conti (come il Previsionale);
 *  - incassi puntuali (nessun ritardo simulato), stime comprese;
 *  - incassi e uscite già scaduti FUORI dal saldo finché non li confermi
 *    (restano elencati a parte, con il loro totale);
 *  - movimenti senza data o forse doppi fuori dal saldo.
 * L'unica aggiunta sono le voci manuali del Controllo di gestione, mostrate
 * in una riga a parte: la differenza col Previsionale è esattamente quella riga.
 */
import {
  daysBetween,
  projectForecast,
  type ForecastCategory,
  type ForecastMovement,
} from "@/lib/finance/forecastLedger";

export interface VoceManualeCashFlow {
  id: string;
  anno: number;
  mese: number;
  tipo: string;
  descrizione: string;
  importo: number | string;
  ricorrente: boolean | null;
}

/** Righe della matrice: le categorie del Previsionale più le voci manuali. */
export type RigaCashFlow = ForecastCategory | "manuali";

export interface CashFlowMese {
  mese: number;
  saldo_inizio: number;
  /** Importi in euro per riga (categoria del Previsionale o voci manuali). */
  entrate: Partial<Record<RigaCashFlow, number>>;
  entrate_totali: number;
  uscite: Partial<Record<RigaCashFlow, number>>;
  uscite_totali: number;
  saldo_fine: number;
  flusso_netto: number;
  sotto_zero: boolean;
}

export interface CashFlowEsclusi {
  importo: number;
  numero: number;
}

export interface CashFlowResult {
  meta: {
    company_id: string;
    anno: number;
    saldo_apertura: number;
    saldo_chiusura: number;
    /** Saldo di oggi (disponibilità dei conti), da cui parte la proiezione. */
    saldo_oggi: number;
    saldo_fonte: "banca" | "prima-nota" | "nessuna";
    saldi_aggiornati_al: string | null;
    ancorato_al: string;
    /** Totale netto delle voci manuali CdG nel periodo mostrato (entrate − uscite). */
    manuali_netto: number;
    /** Fonti che non si sono potute leggere: i numeri riguardano solo il resto. */
    fonti_non_lette: string[];
  };
  mesi: CashFlowMese[];
  esclusi: {
    incassi_scaduti: CashFlowEsclusi;
    uscite_scadute: CashFlowEsclusi;
    senza_data: CashFlowEsclusi;
    forse_doppi: CashFlowEsclusi;
  };
}

const euro = (cents: number) => cents / 100;
const esclusi = (rows: ForecastMovement[]): CashFlowEsclusi => ({
  importo: euro(rows.reduce((s, m) => s + (m.direction === "in" ? m.cents : -m.cents), 0)),
  numero: rows.length,
});

/** Le voci manuali diventano movimenti datati (un mese passato non rientra). */
export function vociManualiComeMovimenti(
  voci: VoceManualeCashFlow[],
  today: string,
  fineAnno: number,
): ForecastMovement[] {
  const out: ForecastMovement[] = [];
  const meseOggi = today.slice(0, 7);
  for (const v of voci) {
    const importo = Number(v.importo);
    if (!Number.isInteger(v.mese) || v.mese < 1 || v.mese > 12) continue;
    if (!Number.isFinite(importo) || importo <= 0) continue;
    if (v.tipo !== "entrata" && v.tipo !== "uscita") continue;
    if (v.anno > fineAnno) continue;
    // Una voce ricorrente si ripete dal suo mese fino a dicembre dello stesso anno.
    for (let mese = v.mese; mese <= (v.ricorrente ? 12 : v.mese); mese++) {
      const chiave = `${v.anno}-${String(mese).padStart(2, "0")}`;
      if (chiave < meseOggi) continue;
      const giorno = `${chiave}-28`;
      out.push({
        id: `manuale:${v.id}:${mese}`,
        description: v.descrizione,
        counterparty: "",
        category: "altri",
        direction: v.tipo === "entrata" ? "in" : "out",
        cents: Math.round(importo * 100),
        // Nel mese in corso, se il 28 è già passato, la voce cade oggi.
        date: giorno < today ? today : giorno,
        source: "Voci manuali CdG",
        href: "/azienda/controllo-gestione/cash-flow",
        estimated: false,
      });
    }
  }
  return out;
}

export function cashFlowMensile(input: {
  companyId: string;
  anno: number;
  today: string;
  openingCents: number;
  openingSource: CashFlowResult["meta"]["saldo_fonte"];
  openingUpdatedAt: string | null;
  movements: ForecastMovement[];
  manuali: VoceManualeCashFlow[];
  fontiNonLette?: string[];
}): CashFlowResult {
  const { anno, today } = input;
  const annoOggi = Number(today.slice(0, 4));
  if (anno < annoOggi || anno > annoOggi + 5)
    throw new Error("La previsione è disponibile solo per l’anno corrente e i prossimi cinque anni.");
  const manuali = vociManualiComeMovimenti(input.manuali, today, anno);
  const idManuali = new Set(manuali.map((m) => m.id));
  const horizon = daysBetween(today, `${anno}-12-31`) + 1;
  const p = projectForecast(
    [...input.movements, ...manuali],
    input.openingCents,
    today,
    horizon,
    0,
    { delayDays: 0, includeEstimates: true, includeOverdueIncome: false, includeOverdueExpense: false },
  );
  const primoMese = anno === annoOggi ? Number(today.slice(5, 7)) : 1;
  let saldo = input.openingCents;
  let apertura = saldo;
  let manualiNetto = 0;
  const mesi: CashFlowMese[] = [];
  const perMese = new Map<string, typeof p.days>();
  for (const d of p.days) {
    const k = d.date.slice(0, 7);
    const lista = perMese.get(k);
    if (lista) lista.push(d);
    else perMese.set(k, [d]);
  }
  for (let y = annoOggi; y <= anno; y++) {
    for (let m = y === annoOggi ? Number(today.slice(5, 7)) : 1; m <= 12; m++) {
      const giorni = perMese.get(`${y}-${String(m).padStart(2, "0")}`) ?? [];
      const entrate: Partial<Record<RigaCashFlow, number>> = {};
      const uscite: Partial<Record<RigaCashFlow, number>> = {};
      let inC = 0;
      let outC = 0;
      for (const d of giorni)
        for (const mv of d.movements) {
          const riga: RigaCashFlow = idManuali.has(mv.id) ? "manuali" : mv.category;
          const target = mv.direction === "in" ? entrate : uscite;
          target[riga] = (target[riga] ?? 0) + mv.cents;
          if (mv.direction === "in") inC += mv.cents;
          else outC += mv.cents;
        }
      const inizio = saldo;
      saldo += inC - outC;
      if (y !== anno || m < primoMese) continue;
      if (!mesi.length) apertura = inizio;
      manualiNetto += (entrate.manuali ?? 0) - (uscite.manuali ?? 0);
      const toEuro = (r: Partial<Record<RigaCashFlow, number>>) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, euro(v ?? 0)])) as Partial<Record<RigaCashFlow, number>>;
      mesi.push({
        mese: m,
        saldo_inizio: euro(inizio),
        entrate: toEuro(entrate),
        entrate_totali: euro(inC),
        uscite: toEuro(uscite),
        uscite_totali: euro(outC),
        saldo_fine: euro(saldo),
        flusso_netto: euro(inC - outC),
        sotto_zero: saldo < 0,
      });
    }
  }
  return {
    meta: {
      company_id: input.companyId,
      anno,
      saldo_apertura: euro(apertura),
      saldo_chiusura: euro(saldo),
      saldo_oggi: euro(input.openingCents),
      saldo_fonte: input.openingSource,
      saldi_aggiornati_al: input.openingUpdatedAt,
      ancorato_al: today,
      manuali_netto: euro(manualiNetto),
      fonti_non_lette: input.fontiNonLette ?? [],
    },
    mesi,
    esclusi: {
      incassi_scaduti: esclusi(p.overdueIncome),
      uscite_scadute: esclusi(p.overdueExpense),
      senza_data: esclusi(p.undated),
      forse_doppi: esclusi(p.possibleDuplicates),
    },
  };
}
