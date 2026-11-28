/**
 * «Questa settimana» e «Saldo netto atteso» dello Scadenzario (28/11/2026). Stessa fonte dei riquadri
 * del periodo (`scadenzario_fonti`, righe non annullate, residuo = importo - pagato), stessi filtri
 * di fornitore/cantiere/modalità/ricerca: i numeri tornano con riquadri ed elenco.
 * NON includono le rate di commessa non ancora fatturate, che stanno solo nel Previsionale.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { calcolaRiepilogo, chiaveRiepilogo, filtriPeriodo, leggi } from "./riepilogoPeriodoScadenzario";
import { domenicaDi } from "./incassiSettimanali";
import { oggiIso } from "./collegamentiFinanza";
import type { ScadenzarioFilters } from "@/hooks/useScadenzario";
import type { RiepilogoPeriodo, Somma } from "./riepilogoPeriodoTipi";

export interface SettimanaScadenzario { incassare: Somma; pagare: Somma; troncato: boolean }

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/** Saldo netto atteso del periodo: ancora da incassare meno ancora da pagare, sulle righe dei riquadri. */
export const saldoNettoAtteso = (r: Pick<RiepilogoPeriodo, "entrate" | "uscite">) =>
  arrotonda(r.entrate.aperto.importo - r.uscite.aperto.importo);

/** Filtri della settimana in corso: da oggi a domenica, solo aperte, senza «senza data». */
export function filtriSettimana(f: ScadenzarioFilters, oggi = oggiIso()): ScadenzarioFilters {
  return { ...filtriPeriodo(f), dateFrom: oggi, dateTo: domenicaDi(oggi), includiSenzaData: false, soloAperte: true, annoGrafico: null };
}

export async function caricaSettimana(companyId: string, filtri: ScadenzarioFilters, oggi = oggiIso()): Promise<SettimanaScadenzario> {
  const { righe, troncato } = await leggi(companyId, filtriSettimana(filtri, oggi));
  const r = calcolaRiepilogo(righe, { oggi });
  return { incassare: r.entrate.aperto, pagare: r.uscite.aperto, troncato };
}

export function useSettimanaScadenzario(companyId: string | undefined, filtri: ScadenzarioFilters, abilitato: boolean) {
  const oggi = oggiIso();
  return useQuery<SettimanaScadenzario>({
    queryKey: [...chiaveRiepilogo(companyId, filtriSettimana(filtri, oggi)), "settimana", oggi],
    queryFn: () => caricaSettimana(companyId!, filtri, oggi),
    enabled: !!companyId && abilitato && !filtri.attendi,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
