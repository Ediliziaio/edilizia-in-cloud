/**
 * Rendiconto di cassa del Controllo di gestione: una sola tabella, 12 mesi + totale anno.
 *
 *  - Mesi passati = CONSUNTIVO: prima nota alla data del pagamento (una riga = un movimento; le
 *    copie bancarie, le fatture e i cedolini non si sommano agli stessi soldi).
 *  - Mese in corso = registrato fino a oggi + previsto da oggi.
 *  - Mesi futuri = PREVISIONE: gli stessi movimenti attesi della pagina Previsionale
 *    (`buildForecastLedger` + `projectForecast`, stesse ipotesi e stessi interruttori), più le rate
 *    dei mutui (cg_loans) e le voci manuali del CdG.
 *
 * Il saldo di oggi è la disponibilità dei conti (come il Previsionale). Per i mesi passati è
 * ricostruito all'indietro: saldo di oggi meno i movimenti registrati dopo quella data.
 * Tutti gli importi sono centesimi interi con segno: incassi +, uscite −.
 */
import {
  daysBetween,
  projectForecast,
  toCents,
  type ForecastMovement,
} from "@/lib/finance/forecastLedger";
import { vociManualiComeMovimenti, type VoceManualeCashFlow } from "@/lib/controlloGestione/cashFlowMensile";
import {
  classificaManuale,
  classificaPrevisto,
  classificaRegistrato,
  GRUPPI_CASSA,
  VOCI_CASSA,
  VOCE_PER_CHIAVE,
  type GruppoCassa,
  type VoceCassa,
} from "@/lib/controlloGestione/vociCassa";

export interface MovimentoRegistrato {
  id: string;
  direction: string;
  amount: number | string | null;
  entry_date: string;
  category: string | null;
  description?: string | null;
  costCategory?: string | null;
  installmentType?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  orderItemId?: string | null;
  invoiceId?: string | null;
  documentoFiscaleId?: string | null;
  installmentId?: string | null;
  orderId?: string | null;
}

export interface MutuoCG {
  id: string;
  banca?: string | null;
  descrizione?: string | null;
  capitale_residuo: number | string | null;
  tasso_pct: number | string | null;
  rata_mensile: number | string | null;
  data_inizio?: string | null;
  data_fine?: string | null;
  is_active?: boolean | null;
}

export type VoceManualeRendiconto = VoceManualeCashFlow & { categoria?: string | null };

export interface IpotesiRendiconto {
  includeOverdueIncome: boolean;
  includeOverdueExpense: boolean;
  includeEstimates: boolean;
}

export type TipoColonna = "consuntivo" | "in-corso" | "previsione";

export interface DettaglioCella {
  id: string;
  data: string;
  descrizione: string;
  controparte: string;
  /** Con segno: incasso +, uscita −. */
  cents: number;
  fonte: string;
  href: string | null;
  tipo: "registrato" | "previsto";
  stimato: boolean;
  nota?: string;
}

export interface RendicontoCassa {
  anno: number;
  today: string;
  colonne: { mese: number; tipo: TipoColonna }[];
  /** Centesimi con segno per voce e mese (indice 0 = gennaio). */
  righe: Record<VoceCassa, number[]>;
  /** Voci da mostrare (le «sempre» più quelle opzionali con importi). */
  vociVisibili: VoceCassa[];
  gruppi: Record<GruppoCassa, number[]>;
  flussoOperativo: number[];
  flussoNetto: number[];
  saldoInizio: (number | null)[];
  saldoFine: (number | null)[];
  /** Dettaglio dei movimenti di ogni cella, chiave `${voce}:${mese}`. */
  dettagli: Map<string, DettaglioCella[]>;
  /** Somme del registrato per mese (positive): devono coincidere con la prima nota. */
  entrateRegistrate: number[];
  usciteRegistrate: number[];
  saldo: {
    oggi: number | null;
    fonte: "banca" | "prima-nota" | "nessuna";
    aggiornatoAl: string | null;
    /** Vero se i saldi dei mesi passati sono ricostruiti all'indietro dal saldo di oggi. */
    ricostruito: boolean;
    /** Perché il saldo manca o va letto con cautela (null se tutto torna). */
    avviso: string | null;
  };
  kpi: {
    saldoOggi: number | null;
    flussoOperativoAnno: number;
    minimo: { cents: number; data: string; giornaliero: boolean } | null;
    saldoFineAnno: number | null;
  };
  nonClassificati: { numero: number; cents: number };
  esclusi: {
    incassiScaduti: { numero: number; cents: number };
    usciteScadute: { numero: number; cents: number };
    stime: { numero: number; cents: number };
    senzaData: { numero: number; cents: number };
    forseDoppi: { numero: number; cents: number };
  };
  /** Movimenti di prima nota scartati (importo o data non validi) o con data futura. */
  registratiScartati: number;
  registratiFuturi: number;
  /** Le rate dei mutui non sono state aggiunte perché sembrano già tra le spese previste. */
  mutuiGiaPrevisti: boolean;
  sogliaCents: number;
}

const MESI = Array.from({ length: 12 }, (_, i) => i + 1);
const zeri = () => Array.from({ length: 12 }, () => 0);
const pad = (n: number) => String(n).padStart(2, "0");
const sommaEsclusi = (rows: ForecastMovement[]) => ({
  numero: rows.length,
  cents: rows.reduce((s, m) => s + (m.direction === "in" ? m.cents : -m.cents), 0),
});

/** Le rate future dei mutui (piano alla francese dal capitale residuo di oggi), divise in capitale e interessi. */
export function rateMutui(mutui: MutuoCG[], today: string, fino: string): ForecastMovement[] {
  const out: ForecastMovement[] = [];
  for (const l of mutui) {
    if (l.is_active === false) continue;
    let residuo = toCents(l.capitale_residuo);
    const rata = toCents(l.rata_mensile);
    const tasso = Number(l.tasso_pct) || 0;
    if (residuo <= 0 || rata <= 0) continue;
    const giorno = Math.min(28, Number((l.data_inizio ?? "").slice(8, 10)) || 1);
    const nome = [l.descrizione || "Mutuo", l.banca].filter(Boolean).join(" · ");
    let [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    while (residuo > 0) {
      const data = `${y}-${pad(m)}-${pad(giorno)}`;
      if (data > fino || (l.data_fine && data > l.data_fine)) break;
      if (data >= today) {
        const interessi = Math.round((residuo * tasso) / 100 / 12);
        const capitale = Math.min(residuo, Math.max(0, rata - interessi));
        residuo -= capitale;
        const base = {
          counterparty: l.banca ?? "",
          category: "altri" as const,
          direction: "out" as const,
          date: data,
          source: "Mutuo (Controllo di gestione)",
          href: "/azienda/controllo-gestione/pfn-debiti",
          estimated: false,
        };
        if (capitale > 0)
          out.push({ ...base, id: `mutuo:${l.id}:${data}:capitale`, description: `${nome} · quota capitale`, cents: capitale, sourceCategory: "mutuo" });
        if (interessi > 0)
          out.push({ ...base, id: `mutuo:${l.id}:${data}:interessi`, description: `${nome} · interessi`, cents: interessi, sourceCategory: "interessi" });
      }
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  }
  return out;
}

export function costruisciRendiconto(input: {
  anno: number;
  today: string;
  saldoOggiCents: number | null;
  saldoFonte: "banca" | "prima-nota" | "nessuna";
  saldoAggiornatoAl?: string | null;
  /** Prima nota dell'anno scelto (fino a oggi). */
  registrati: MovimentoRegistrato[];
  /**
   * Flusso netto registrato dal 1° gennaio dell'anno dopo fino a oggi (solo anni passati),
   * per ricostruire il saldo all'indietro. Null = non noto.
   */
  flussoDopoAnnoCents?: number | null;
  /** Movimenti attesi del Previsionale (null per un anno passato). */
  previsti: ForecastMovement[] | null;
  manuali?: VoceManualeRendiconto[];
  mutui?: MutuoCG[];
  ipotesi: IpotesiRendiconto;
  sogliaCents?: number;
}): RendicontoCassa {
  const { anno, today } = input;
  const annoOggi = Number(today.slice(0, 4));
  const meseOggi = Number(today.slice(5, 7));
  const fineAnno = `${anno}-12-31`;
  const sogliaCents = input.sogliaCents ?? 0;

  const colonne = MESI.map((mese) => ({
    mese,
    tipo: (anno < annoOggi || (anno === annoOggi && mese < meseOggi)
      ? "consuntivo"
      : anno === annoOggi && mese === meseOggi
        ? "in-corso"
        : "previsione") as TipoColonna,
  }));

  const righe = Object.fromEntries(VOCI_CASSA.map((v) => [v.key, zeri()])) as Record<VoceCassa, number[]>;
  const dettagli = new Map<string, DettaglioCella[]>();
  const metti = (voce: VoceCassa, mese: number, d: DettaglioCella) => {
    righe[voce][mese - 1] += d.cents;
    const k = `${voce}:${mese}`;
    const lista = dettagli.get(k);
    if (lista) lista.push(d);
    else dettagli.set(k, [d]);
  };
  const nonClassificati = { numero: 0, cents: 0 };
  const entrateRegistrate = zeri();
  const usciteRegistrate = zeri();

  // ── Consuntivo: prima nota ────────────────────────────────────────────────
  let registratiScartati = 0;
  let registratiFuturi = 0;
  let registratiAnno = 0;
  let flussoRegistratoAnno = 0;
  const visti = new Set<string>();
  for (const r of input.registrati) {
    if (visti.has(r.id)) continue;
    visti.add(r.id);
    const cents = Math.round(Number(r.amount) * 100);
    const data = /^\d{4}-\d{2}-\d{2}$/.test(r.entry_date ?? "") ? r.entry_date : null;
    if (!data || !Number.isFinite(cents) || cents < 0 || !["entrata", "uscita"].includes(r.direction)) {
      registratiScartati++;
      continue;
    }
    if (Number(data.slice(0, 4)) !== anno) continue;
    if (data > today) {
      registratiFuturi++;
      continue;
    }
    const mese = Number(data.slice(5, 7));
    const entrata = r.direction === "entrata";
    const c = classificaRegistrato({
      direction: r.direction,
      category: r.category,
      costCategory: r.costCategory,
      installmentType: r.installmentType,
      supplierId: r.supplierId,
      orderItemId: r.orderItemId,
      invoiceId: r.invoiceId,
      documentoFiscaleId: r.documentoFiscaleId,
      installmentId: r.installmentId,
    });
    const firmato = entrata ? cents : -cents;
    if (c.nonClassificato) {
      nonClassificati.numero++;
      nonClassificati.cents += firmato;
    }
    (entrata ? entrateRegistrate : usciteRegistrate)[mese - 1] += cents;
    registratiAnno++;
    flussoRegistratoAnno += firmato;
    metti(c.voce, mese, {
      id: `prima-nota:${r.id}`,
      data,
      descrizione: r.description || r.category || (entrata ? "Entrata registrata" : "Uscita registrata"),
      controparte: r.supplierName ?? "",
      cents: firmato,
      fonte: `Prima nota${r.category ? ` · ${r.category}` : ""}`,
      href: r.orderId ? `/azienda/ordini/${r.orderId}` : "/azienda/prima-nota",
      tipo: "registrato",
      stimato: false,
    });
  }

  // ── Previsione: movimenti del Previsionale + mutui + voci manuali ─────────
  const previstiBase = anno >= annoOggi ? input.previsti ?? [] : [];
  const mutuiGiaPrevisti =
    (input.mutui ?? []).length > 0 &&
    previstiBase.some((m) => m.direction === "out" && /mutu|finanziament/i.test(`${m.description} ${m.sourceCategory ?? ""}`));
  const extra: ForecastMovement[] = [];
  const manualiPerId = new Map<string, VoceCassa>();
  if (anno >= annoOggi) {
    if (!mutuiGiaPrevisti) extra.push(...rateMutui(input.mutui ?? [], today, fineAnno));
    const manuali = input.manuali ?? [];
    for (const v of manuali) manualiPerId.set(v.id, classificaManuale(v.categoria, v.tipo === "entrata" ? "entrata" : "uscita"));
    extra.push(...vociManualiComeMovimenti(manuali, today, anno));
  }
  const tutti = [...previstiBase, ...extra];
  const orizzonte = anno >= annoOggi ? daysBetween(today, fineAnno) + 1 : 0;
  const p = orizzonte > 0
    ? projectForecast(tutti, input.saldoOggiCents, today, orizzonte, sogliaCents, {
        delayDays: 0,
        includeEstimates: input.ipotesi.includeEstimates,
        includeOverdueIncome: input.ipotesi.includeOverdueIncome,
        includeOverdueExpense: input.ipotesi.includeOverdueExpense,
      })
    : null;
  let previstoPrimaDellAnno = 0;
  if (p)
    for (const day of p.days)
      for (const mv of day.movements) {
        const firmato = mv.direction === "in" ? mv.cents : -mv.cents;
        if (day.date < `${anno}-01-01`) {
          previstoPrimaDellAnno += firmato;
          continue;
        }
        const mese = Number(day.date.slice(5, 7));
        const manuale = mv.id.startsWith("manuale:") ? manualiPerId.get(mv.id.split(":")[1]) : undefined;
        const c = manuale ? { voce: manuale, nonClassificato: false } : classificaPrevisto(mv);
        if (c.nonClassificato) {
          nonClassificati.numero++;
          nonClassificati.cents += firmato;
        }
        metti(c.voce, mese, {
          id: mv.id,
          data: day.date,
          descrizione: mv.description,
          controparte: mv.counterparty || mv.orderLabel || "",
          cents: firmato,
          fonte: mv.source,
          href: mv.href || null,
          tipo: "previsto",
          stimato: mv.estimated,
          nota: mv.note || undefined,
        });
      }

  // ── Totali ────────────────────────────────────────────────────────────────
  const gruppi = Object.fromEntries(GRUPPI_CASSA.map((g) => [g.key, zeri()])) as Record<GruppoCassa, number[]>;
  for (const v of VOCI_CASSA) righe[v.key].forEach((c, i) => (gruppi[v.gruppo][i] += c));
  const flussoOperativo = MESI.map((_, i) => gruppi.incassi[i] + gruppi.uscite[i]);
  const flussoNetto = MESI.map((_, i) => flussoOperativo[i] + gruppi.investimenti[i] + gruppi.finanziamenti[i]);
  const vociVisibili = VOCI_CASSA.filter((v) => v.sempre || righe[v.key].some((c) => c !== 0)).map((v) => v.key);

  // ── Saldi ─────────────────────────────────────────────────────────────────
  const oggi = input.saldoOggiCents;
  let inizioAnno: number | null = null;
  let avviso: string | null = null;
  let ricostruito = false;
  if (oggi == null) {
    avviso = "Manca il saldo dei conti: inseriscilo in Tesoreria per vedere i saldi mese per mese.";
  } else if (anno > annoOggi) {
    inizioAnno = oggi + previstoPrimaDellAnno;
  } else if (anno === annoOggi) {
    inizioAnno = oggi - flussoRegistratoAnno;
    ricostruito = meseOggi > 1 || flussoRegistratoAnno !== 0;
  } else if (input.flussoDopoAnnoCents == null) {
    avviso = "Non è stato possibile leggere i movimenti registrati dopo il " + anno + ": il saldo dei mesi non si può ricostruire.";
  } else if (registratiAnno === 0 && input.flussoDopoAnnoCents === 0) {
    avviso = "Nessun movimento in prima nota: il saldo dei mesi passati non si può ricostruire.";
  } else {
    inizioAnno = oggi - input.flussoDopoAnnoCents - flussoRegistratoAnno;
    ricostruito = true;
  }
  const saldoInizio: (number | null)[] = [];
  const saldoFine: (number | null)[] = [];
  let corrente = inizioAnno;
  for (let i = 0; i < 12; i++) {
    saldoInizio.push(corrente);
    corrente = corrente == null ? null : corrente + flussoNetto[i];
    saldoFine.push(corrente);
  }

  // ── Riquadri ──────────────────────────────────────────────────────────────
  let minimo: RendicontoCassa["kpi"]["minimo"] = null;
  if (p && oggi != null) {
    for (const d of p.days) {
      if (d.date < `${anno}-01-01` || d.balance == null) continue;
      if (!minimo || d.balance < minimo.cents) minimo = { cents: d.balance, data: d.date, giornaliero: true };
    }
  } else {
    saldoFine.forEach((s, i) => {
      if (s != null && (!minimo || s < minimo.cents)) minimo = { cents: s, data: `${anno}-${pad(i + 1)}-${pad(new Date(anno, i + 1, 0).getDate())}`, giornaliero: false };
    });
  }

  const esclusi = p
    ? {
        incassiScaduti: sommaEsclusi(p.overdueIncome),
        usciteScadute: sommaEsclusi(p.overdueExpense),
        stime: sommaEsclusi(p.excludedEstimates),
        senzaData: sommaEsclusi(p.undated),
        forseDoppi: sommaEsclusi(p.possibleDuplicates),
      }
    : {
        incassiScaduti: { numero: 0, cents: 0 },
        usciteScadute: { numero: 0, cents: 0 },
        stime: { numero: 0, cents: 0 },
        senzaData: { numero: 0, cents: 0 },
        forseDoppi: { numero: 0, cents: 0 },
      };

  return {
    anno,
    today,
    colonne,
    righe,
    vociVisibili,
    gruppi,
    flussoOperativo,
    flussoNetto,
    saldoInizio,
    saldoFine,
    dettagli,
    entrateRegistrate,
    usciteRegistrate,
    saldo: {
      oggi,
      fonte: input.saldoFonte,
      aggiornatoAl: input.saldoAggiornatoAl ?? null,
      ricostruito,
      avviso,
    },
    kpi: {
      saldoOggi: oggi,
      flussoOperativoAnno: flussoOperativo.reduce((a, b) => a + b, 0),
      minimo,
      saldoFineAnno: saldoFine[11],
    },
    nonClassificati,
    esclusi,
    registratiScartati,
    registratiFuturi,
    mutuiGiaPrevisti,
    sogliaCents,
  };
}

/** Il dettaglio di una riga di gruppo o di una voce, per il pannello laterale. */
export function dettagliCella(r: RendicontoCassa, voci: VoceCassa[], mese: number | null): DettaglioCella[] {
  const mesi = mese == null ? MESI : [mese];
  const out: DettaglioCella[] = [];
  for (const v of voci) for (const m of mesi) out.push(...(r.dettagli.get(`${v}:${m}`) ?? []));
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}

/** Voci di un gruppo (tutte, anche quelle nascoste perché a zero). */
export const vociDelGruppo = (g: GruppoCassa): VoceCassa[] => VOCI_CASSA.filter((v) => v.gruppo === g).map((v) => v.key);

export const etichettaVoce = (v: VoceCassa) => VOCE_PER_CHIAVE.get(v)?.label ?? v;

/** Righe per l'Excel: una riga per voce/totale/saldo, colonne = mesi + totale (euro interi). */
export function righeEsportazione(r: RendicontoCassa): { voce: string; valori: (number | null)[]; totale: number | null }[] {
  const euro = (c: number | null) => (c == null ? null : Math.round(c / 100));
  const somma = (a: number[]) => a.reduce((s, c) => s + c, 0);
  const out: { voce: string; valori: (number | null)[]; totale: number | null }[] = [];
  out.push({ voce: "Saldo di cassa a inizio mese", valori: r.saldoInizio.map(euro), totale: euro(r.saldoInizio[0]) });
  for (const g of GRUPPI_CASSA) {
    out.push({ voce: g.label.toUpperCase(), valori: r.gruppi[g.key].map((): number | null => null), totale: null });
    for (const v of r.vociVisibili.filter((k) => VOCE_PER_CHIAVE.get(k)?.gruppo === g.key))
      out.push({ voce: `  ${etichettaVoce(v)}`, valori: r.righe[v].map(euro), totale: euro(somma(r.righe[v])) });
    out.push({ voce: g.totale, valori: r.gruppi[g.key].map(euro), totale: euro(somma(r.gruppi[g.key])) });
    if (g.key === "uscite")
      out.push({ voce: "FLUSSO DELLA GESTIONE OPERATIVA", valori: r.flussoOperativo.map(euro), totale: euro(somma(r.flussoOperativo)) });
  }
  out.push({ voce: "FLUSSO NETTO DEL MESE", valori: r.flussoNetto.map(euro), totale: euro(somma(r.flussoNetto)) });
  out.push({ voce: "SALDO DI CASSA A FINE MESE", valori: r.saldoFine.map(euro), totale: euro(r.saldoFine[11]) });
  return out;
}
