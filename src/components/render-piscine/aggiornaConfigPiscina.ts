import type {
  ConfigurazionePiscine,
  DimensioneApparentePiscina,
  FormaPiscina,
  QuotaBordoPiscina,
  SistemaBordoPiscina,
  TipoPiscina,
} from "@/modules/render-piscine/lib/types";
import {
  formaEffettiva,
  quotaBordoPerTipo,
  sistemaBordoEffettivo,
} from "../../../shared/render-piscine/piscineCoerenza.ts";
import { DEFAULT_PISCINE_CONFIG } from "./defaultPiscineConfig";

/**
 * Aggiornamenti del form piscina che toccano più sezioni del config in UN solo
 * onChange. Due setter di fila (setPiscina e poi setInserimento) partivano dallo
 * stesso `value`: il secondo cancellava il primo. Così «Dimensione apparente» non
 * cambiava mai piscina.dimensione_apparente (il select tornava a «Media») e il
 * prompt riceveva sempre la dimensione di default.
 */
export function conDimensione(config: ConfigurazionePiscine, dimensione: DimensioneApparentePiscina): ConfigurazionePiscine {
  return {
    ...config,
    piscina: { ...config.piscina, dimensione_apparente: dimensione },
    inserimento: { ...(config.inserimento ?? DEFAULT_PISCINE_CONFIG.inserimento), footprint_apparente: dimensione },
  };
}

/**
 * Nuova tipologia: forma, sistema di bordo e quota si adeguano SOLO se la
 * contraddicono (una «Interrata a sfioro» non resta «Skimmer», una «Forma libera» non
 * resta «Rettangolare», una «Fuori terra premium» parte fuori terra). Stesse regole
 * del prompt (shared/render-piscine/piscineCoerenza.ts).
 */
export function conTipo(config: ConfigurazionePiscine, tipo: TipoPiscina): ConfigurazionePiscine {
  const inserimento = config.inserimento ?? DEFAULT_PISCINE_CONFIG.inserimento;
  return {
    ...config,
    piscina: {
      ...config.piscina,
      tipo,
      forma: formaEffettiva(tipo, config.piscina.forma) as FormaPiscina,
      sistema_bordo: sistemaBordoEffettivo(tipo, config.piscina.sistema_bordo) as SistemaBordoPiscina,
    },
    inserimento: { ...inserimento, quota_bordo: quotaBordoPerTipo(tipo, inserimento.quota_bordo) as QuotaBordoPiscina },
  };
}

/** Misura in metri dal campo di testo: vuoto → assente (il prompt resta quello di sempre). */
export function misuraDaInput(testo: string): number | undefined {
  const t = testo.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
