import type { ParametriEconomiaAzienda } from "../../../supabase/functions/_shared/fvEconomiaAzienda";
import {
  type AnalisiConsumiFv,
  riepilogoBollette,
} from "../../../supabase/functions/_shared/fvBollette";
import {
  flussiAnnoOrarioFv,
  PESI_SOLARI_FV,
} from "../../../supabase/functions/_shared/fvSimulazioneEnergetica";
import { resaMappaFv } from "../../../supabase/functions/_shared/fvMappa";
export function economiaDaConsumiFv(
  base: ParametriEconomiaAzienda,
  data: {
    analisi_consumi?: AnalisiConsumiFv | null;
    consumo_annuo_kwh: number | null;
    costo_kwh_attuale: number | null;
    con_accumulo: boolean;
    capacita_accumulo_kwh: number;
    layout_overlay?: unknown;
  },
  produzioneAnnua = 0,
): ParametriEconomiaAzienda {
  const a = data.analisi_consumi;
  if (!a) return base;
  const pesi = a.profilo.pesiMensili,
    totale = pesi.reduce((x, y) => x + y, 0),
    solare = resaMappaFv(data.layout_overlay)?.pesiMensili ?? PESI_SOLARI_FV,
    totaleSolare = solare.reduce((x, y) => x + y, 0);
  const fissi = riepilogoBollette(a).fissiAnnui;
  const bilancioOrario = {
    profilo: a.profilo,
    capacitaAccumulo: data.con_accumulo ? data.capacita_accumulo_kwh : 0,
    pesiProduzioneMensili: solare,
  };
  let quota = base.quotaAutoconsumo;
  try {
    if (produzioneAnnua > 0) {
      quota = flussiAnnoOrarioFv(
        produzioneAnnua,
        data.consumo_annuo_kwh ?? 0,
        bilancioOrario,
      ).quotaProduzioneUsata;
    }
  } catch { /* La validazione del calcolo mostra il profilo incompleto. */ }
  return {
    ...base,
    consumiMensili: pesi.map((p) =>
      (data.consumo_annuo_kwh ?? 0) * p / (totale || 1)
    ),
    produzionePesiMensili: solare.map((p) => p / totaleSolare),
    quotaAutoconsumo: quota,
    costoEnergia: data.costo_kwh_attuale ?? 0,
    costiFissiAnnui: fissi ?? base.costiFissiAnnui,
    prezzoCessione: a.prezzoImmissione,
    bilancioOrario,
  };
}
