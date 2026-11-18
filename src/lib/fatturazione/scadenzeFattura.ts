import { addDays, format, isMatch } from "date-fns";
import type { ScadenzaPagamento } from "@/types/fatturazione";

export const QUOTE_30_30_40 = [30, 30, 40] as const;
export const GIORNI_30_30_40 = [30, 60, 90] as const;

/** Ripartisce il totale ai centesimi facendo coincidere la somma con il documento. */
export function scadenze30_30_40(
  totale: number,
  dataBase: Date,
  metodo: ScadenzaPagamento["metodo_pagamento"],
): ScadenzaPagamento[] {
  const centesimi = Math.round(totale * 100);
  let percentuale = 0;
  let assegnato = 0;
  return QUOTE_30_30_40.map((quota, i) => {
    percentuale += quota;
    const cumulativo = Math.round(centesimi * percentuale / 100);
    const importo = (cumulativo - assegnato) / 100;
    assegnato = cumulativo;
    return {
      numero_rata: i + 1,
      data_scadenza: format(addDays(dataBase, GIORNI_30_30_40[i]), "yyyy-MM-dd"),
      importo,
      metodo_pagamento: metodo,
      pagato: false,
    };
  });
}

/** Come nello scadenzario, l'incasso copre prima le date più vicine.
 * L'ultima scadenza assorbe le differenze di arrotondamento e gli storni
 * riducono l'importo esigibile a partire dalle ultime scadenze. */
export function ripartoIncassiScadenze(
  scadenze: ScadenzaPagamento[],
  importi: { incassato: number; residuo: number },
) {
  const daRipartire = scadenze.map((rata, indice) => ({
    indice,
    rata,
    centesimi: Math.round(Number(rata?.importo) * 100),
  })).filter(({ rata, centesimi }) =>
    Number.isFinite(centesimi) && centesimi > 0 && /^\d{4}-\d{2}-\d{2}$/.test(rata?.data_scadenza)
      && isMatch(rata.data_scadenza, "yyyy-MM-dd"),
  ).sort((a, b) => a.rata.data_scadenza.localeCompare(b.rata.data_scadenza));
  // Lo scadenzario gestisce un piano solo quando ha almeno due scadenze valide.
  if (daRipartire.length < 2) return new Map<number, { esigibile: number; incassato: number }>();

  let incassatoDaAssegnare = Math.round(importi.incassato * 100);
  let esigibileDaAssegnare = incassatoDaAssegnare + Math.round(importi.residuo * 100);
  return new Map(daRipartire.map(({ indice, centesimi }, posizione) => {
    const esigibile = posizione === daRipartire.length - 1
      ? esigibileDaAssegnare
      : Math.min(centesimi, esigibileDaAssegnare);
    const incassato = Math.min(esigibile, incassatoDaAssegnare);
    esigibileDaAssegnare -= esigibile;
    incassatoDaAssegnare -= incassato;
    return [indice, { esigibile, incassato }];
  }));
}
