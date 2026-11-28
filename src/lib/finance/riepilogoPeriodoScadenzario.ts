/**
 * Riepilogo del periodo dello Scadenzario (28/11/2026): la parte dati. Una lettura delle
 * righe del periodo (tutti gli stati, filtri entità/ricerca/periodo ma NON di linguetta) e,
 * se il periodo ha un inizio, una delle aperte arretrate. Da lì si calcolano totali, saldato,
 * aperto, scaduto, arretrato e i sei numeri delle linguette: niente più 6 conteggi separati.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { filtraScadenzario, queryFontiScadenzario } from "./fontiScadenzario";
import { oggiIso } from "./collegamentiFinanza";
import type { ScadenzarioFilters } from "@/hooks/useScadenzario";
import { LINGUETTE_CON_CONTEGGIO, type LinguettaConConteggio, type RiepilogoDirezione, type RiepilogoPeriodo, type Somma } from "./riepilogoPeriodoTipi";

export type { RiepilogoDirezione, RiepilogoPeriodo, Somma } from "./riepilogoPeriodoTipi";

/** Tetto alle righe per lettura: oltre, i numeri sono parziali (`troncato`). */
export const TETTO_RIGHE_RIEPILOGO = 5000;
const PAGINA = 1000;
const COLONNE = "id, direction, amount, paid_amount, status, due_date";

export interface RigaRiepilogo {
  id?: string;
  direction: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  status: string | null;
  due_date: string | null;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;
const residuoDi = (r: RigaRiepilogo) => arrotonda(Number(r.amount || 0) - Number(r.paid_amount || 0));
const vuota = (): RiepilogoDirezione => ({ totale: { n: 0, importo: 0 }, saldato: { n: 0, importo: 0 }, aperto: { n: 0, importo: 0 }, scaduto: { n: 0, importo: 0 } });
const somma = (s: Somma, importo: number) => { s.n += 1; s.importo = arrotonda(s.importo + importo); };

/** Le righe aperte per le linguette: stesso criterio del filtro server (da_pagare/parziale). */
const eAperta = (r: RigaRiepilogo) => r.status === "da_pagare" || r.status === "parziale";

export function calcolaRiepilogo(
  righe: RigaRiepilogo[],
  opz: { oggi?: string; inizioPeriodo?: string | null; righeArretrato?: RigaRiepilogo[]; troncato?: boolean } = {},
): RiepilogoPeriodo {
  const oggi = opz.oggi ?? oggiIso();
  const entrate = vuota();
  const uscite = vuota();
  const linguette = Object.fromEntries(LINGUETTE_CON_CONTEGGIO.map((k) => [k, 0])) as Record<LinguettaConConteggio, number>;

  for (const r of righe) {
    if (r.status === "annullata") continue;
    const d = r.direction === "entrata" ? entrate : uscite;
    const importo = Number(r.amount || 0);
    const pagato = Number(r.paid_amount || 0);
    const residuo = residuoDi(r);
    somma(d.totale, importo);
    if (pagato > 0) d.saldato.importo = arrotonda(d.saldato.importo + pagato);
    if (residuo <= 0 || r.status === "pagata") d.saldato.n += 1;
    if (residuo > 0 && r.status !== "pagata") {
      somma(d.aperto, residuo);
      if (r.due_date && r.due_date < oggi) somma(d.scaduto, residuo);
    }

    linguette.tutte += 1;
    if (r.status === "pagata") linguette.pagate += 1;
    if (eAperta(r)) {
      linguette.aperte += 1;
      if (r.direction === "entrata") linguette.da_incassare += 1; else linguette.da_pagare += 1;
      if (r.due_date && r.due_date < oggi) linguette.scadute += 1;
    }
  }

  let arretrato: RiepilogoPeriodo["arretrato"] = null;
  if (opz.inizioPeriodo) {
    const e: Somma = { n: 0, importo: 0 };
    const u: Somma = { n: 0, importo: 0 };
    for (const r of opz.righeArretrato ?? []) {
      if (r.status === "annullata" || !eAperta(r)) continue;
      const residuo = residuoDi(r);
      if (residuo <= 0) continue;
      somma(r.direction === "entrata" ? e : u, residuo);
    }
    arretrato = { entrate: e, uscite: u };
  }
  return { entrate, uscite, arretrato, linguette, troncato: opz.troncato ?? false };
}

/** Il giorno prima di una data ISO (yyyy-MM-dd), senza fusi orari. */
export function giornoPrima(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** I filtri di periodo/entità senza quelli di linguetta. */
export function filtriPeriodo(f: ScadenzarioFilters): ScadenzarioFilters {
  return { ...f, direction: null, status: null, soloScadute: false, soloAperte: false, soloSenzaData: false };
}

export async function leggi(companyId: string, filtri: ScadenzarioFilters): Promise<{ righe: RigaRiepilogo[]; troncato: boolean }> {
  // Senza count esatto (non serve) e con le pagine dopo la prima in parallelo: ogni pagina rifà la
  // costruzione dello scadenzario (~1 s), in sequenza sarebbero 5-6 secondi su un'azienda piena.
  const pagina = async (from: number) => {
    const { data, error } = await filtraScadenzario(queryFontiScadenzario(companyId, { conteggio: false }).select(COLONNE), filtri)
      .order("id").range(from, from + PAGINA - 1);
    if (error) throw error;
    return (data ?? []) as unknown as RigaRiepilogo[];
  };
  const righe: RigaRiepilogo[] = await pagina(0);
  if (righe.length === PAGINA) {
    const altre = await Promise.all(Array.from({ length: TETTO_RIGHE_RIEPILOGO / PAGINA }, (_, i) => pagina((i + 1) * PAGINA)));
    for (const blocco of altre) { righe.push(...blocco); if (blocco.length < PAGINA) break; }
  }
  const troncato = righe.length > TETTO_RIGHE_RIEPILOGO;
  return { righe: troncato ? righe.slice(0, TETTO_RIGHE_RIEPILOGO) : righe, troncato };
}

/** Al massimo 2 letture di `scadenzario_fonti` (la seconda solo se il periodo ha un inizio). */
export async function caricaRiepilogoPeriodo(companyId: string, filtriBase: ScadenzarioFilters): Promise<RiepilogoPeriodo> {
  const periodo = filtriPeriodo(filtriBase);
  const inizio = periodo.dateFrom || null;
  const arretratoFiltri: ScadenzarioFilters = { ...periodo, dateFrom: null, dateTo: inizio ? giornoPrima(inizio) : null, includiSenzaData: false, soloAperte: true };
  const [lettura, arretrato] = await Promise.all([
    leggi(companyId, periodo),
    inizio ? leggi(companyId, arretratoFiltri) : Promise.resolve(null),
  ]);
  return calcolaRiepilogo(lettura.righe, {
    inizioPeriodo: inizio,
    righeArretrato: arretrato?.righe,
    troncato: lettura.troncato || (arretrato?.troncato ?? false),
  });
}

/** Chiave stabile: solo i campi che cambiano la lettura, in ordine fisso. */
export function chiaveRiepilogo(companyId: string | undefined, f: ScadenzarioFilters) {
  return ["scadenzario", "riepilogo-periodo", companyId, f.dateFrom ?? null, f.dateTo ?? null, f.search?.trim() || null, f.tipo ?? null,
    f.metodo ?? null, f.supplierId ?? null, f.orderId ?? null, f.orderCostIds?.join(",") ?? null, f.includiSenzaData ?? false,
    f.importoMin ?? null, f.importoMax ?? null, f.soloConNote ?? false, f.soloConDocumento ?? false] as const;
}

export function useRiepilogoPeriodo(companyId: string | undefined, filtri: ScadenzarioFilters, abilitato: boolean) {
  return useQuery<RiepilogoPeriodo>({
    queryKey: chiaveRiepilogo(companyId, filtri),
    queryFn: () => caricaRiepilogoPeriodo(companyId!, filtri),
    enabled: !!companyId && abilitato && !filtri.attendi,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
