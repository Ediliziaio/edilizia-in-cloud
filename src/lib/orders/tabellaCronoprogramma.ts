/**
 * Il cronoprogramma come tabella (31/10/2026): una riga per fase e, sotto, una
 * per sottofase, con le colonne che i clienti tengono nei loro Excel (numero,
 * attività, inizio, fine, giorni, persone, quantità, unità, costo previsto,
 * costo consuntivo, venduto). Modulo puro: la tabella a video e il file Excel
 * leggono le stesse righe.
 */
import type { FaseCrono, SottofaseCrono } from "./cronoprogramma";
import { giorniFinestra, type VoceSottofase } from "./sottofasi";

export interface RigaTabella {
  id: string;
  /** «1», «1.2»… */
  numero: string;
  livello: 0 | 1;
  nome: string;
  inizio: string | null;
  fine: string | null;
  giorni: number | null;
  risorse: number | null;
  quantita: number | null;
  unita: string | null;
  costoPrevisto: number | null;
  costoConsuntivo: number | null;
  venduto: number | null;
  /** Fase: avanzamento 0–100; sottofase: 100 se fatta, 0 se no. */
  avanzamento: number;
  stimata: boolean;
  ritardo: number;
}

export function righeTabellaCronoprogramma(
  fasi: ReadonlyArray<FaseCrono>,
  /** Tutte le sottofasi di ogni fase, anche senza date. */
  sottofasi: ReadonlyMap<string, ReadonlyArray<{ id: string; name: string; fatta: boolean; giorni?: number | null; risorse?: number | null }>>,
  /** Le date (salvate o stimate) delle sottofasi che ne hanno. */
  sotto: ReadonlyMap<string, ReadonlyArray<SottofaseCrono>>,
  extra: {
    economia?: ReadonlyMap<string, { venduto: number; costoPrevisto: number; costoConsuntivo: number }>;
    voci?: ReadonlyMap<string, VoceSottofase>;
  } = {},
): RigaTabella[] {
  const righe: RigaTabella[] = [];
  fasi.forEach((f, i) => {
    const eco = extra.economia?.get(f.id);
    const numero = String(i + 1);
    righe.push({
      id: f.id, numero, livello: 0, nome: f.nome,
      inizio: f.previstoInizio, fine: f.previstoFine,
      giorni: f.previstoInizio && f.previstoFine && f.previstoFine >= f.previstoInizio ? giorniFinestra(f.previstoInizio, f.previstoFine) : null,
      risorse: null, quantita: null, unita: null,
      costoPrevisto: eco ? eco.costoPrevisto : null, costoConsuntivo: eco ? eco.costoConsuntivo : null, venduto: eco ? eco.venduto : null,
      avanzamento: f.avanzamento, stimata: false, ritardo: f.ritardoFine,
    });
    const date = new Map((sotto.get(f.id) ?? []).map((d) => [d.id, d]));
    (sottofasi.get(f.id) ?? []).forEach((s, j) => {
      const v = extra.voci?.get(s.id);
      const d = date.get(s.id);
      righe.push({
        id: s.id, numero: `${numero}.${j + 1}`, livello: 1, nome: s.name,
        inizio: d?.previstoInizio ?? null, fine: d?.previstoFine ?? null, giorni: s.giorni ?? null,
        risorse: s.risorse ?? null,
        quantita: v ? v.quantita : null, unita: v?.unita ?? null,
        costoPrevisto: v ? v.costo : null, costoConsuntivo: null, venduto: v?.importo ?? null,
        avanzamento: s.fatta ? 100 : 0, stimata: d?.stimata ?? false, ritardo: d?.ritardo ?? 0,
      });
    });
  });
  return righe;
}
