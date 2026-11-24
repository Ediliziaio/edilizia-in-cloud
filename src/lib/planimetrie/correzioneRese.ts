/**
 * Rese corrette per azienda (24/11/2026): la previsione dei lavori impara dalle commesse chiuse.
 *
 * Campioni: le commesse dell'azienda con i lavori finiti e una previsione salvata
 * (`previsioni_lavori_campioni`). Per ogni fase della previsione abbinata a fasi della commessa
 * (stessa regola di «Previsto e reale», `fasePrevisioneDi`) e con almeno un rapportino, il
 * rapporto tra i giorni veri (giorni con un rapportino su quelle fasi) e i giorni previsti con le
 * rese tipiche. La correzione di una fase è la mediana dei rapporti — una commessa strana non la
 * sposta — e vale solo con almeno `CAMPIONI_MINIMI` commesse: sotto, le rese restano quelle
 * tipiche e il pannello dice quante ne mancano. Niente correzione inventata da un caso solo.
 *
 * Si correggono i giorni, non gli importi: il previsto è un prezzo (con spese generali e utile),
 * il consuntivo un costo, e il loro rapporto non dice quanto sbaglia la previsione.
 */
import { FASI_PREVISIONE, type FasePrevisione } from "./previsioneLavori";
import { fasePrevisioneDi } from "./previstoReale";

export const CAMPIONI_MINIMI = 5;
/** Oltre questi limiti un rapporto è un errore di dati (fase sbagliata sul rapportino), non una resa. */
const RAPPORTO_MINIMO = 0.2, RAPPORTO_MASSIMO = 5;

export interface CampioneCommessa {
  order_id: string;
  fasi_previste: { fase: string; giorni: number | null }[];
  fasi_commessa: { id: string; nome: string; giorni: string[] }[];
}

export interface CorrezioneFase {
  fase: FasePrevisione;
  /** Commesse che hanno dato un rapporto per questa fase. */
  campioni: number;
  /** Mediana di giorni veri / giorni previsti; null sotto i campioni minimi. */
  fattore: number | null;
}

export interface CorrezioneRese {
  perFase: CorrezioneFase[];
  /** Le sole fasi con abbastanza campioni: quello che `previsioneLavori` applica. */
  fattori: Partial<Record<FasePrevisione, number>>;
  /** Commesse chiuse con una previsione salvata, anche senza fasi abbinate. */
  commesse: number;
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function correzioneRese(campioni: readonly CampioneCommessa[]): CorrezioneRese {
  const rapporti = new Map<FasePrevisione, number[]>();
  for (const c of campioni) {
    for (const prevista of c.fasi_previste) {
      const fase = FASI_PREVISIONE.find((f) => f === prevista.fase);
      if (!fase || !prevista.giorni || prevista.giorni <= 0) continue;
      const giorni = new Set(c.fasi_commessa.filter((w) => fasePrevisioneDi(w.nome) === fase).flatMap((w) => w.giorni.map((d) => d.slice(0, 10))));
      if (!giorni.size) continue;
      const r = giorni.size / prevista.giorni;
      if (r < RAPPORTO_MINIMO || r > RAPPORTO_MASSIMO) continue;
      rapporti.set(fase, [...(rapporti.get(fase) ?? []), r]);
    }
  }
  const perFase = FASI_PREVISIONE.flatMap((fase) => {
    const r = rapporti.get(fase);
    if (!r) return [];
    return [{ fase, campioni: r.length, fattore: r.length >= CAMPIONI_MINIMI ? Math.round(mediana(r) * 20) / 20 : null }];
  });
  return {
    perFase,
    fattori: Object.fromEntries(perFase.filter((f) => f.fattore !== null && f.fattore !== 1).map((f) => [f.fase, f.fattore])),
    commesse: campioni.length,
  };
}
