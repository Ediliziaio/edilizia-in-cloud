import type { RitenutaBonifico } from "@/lib/fatturazione/bonificiParlanti";
import type { Installment } from "@/lib/orderUtils";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import type { FatturaCommessa } from "./fattureCommessa";
import { vociIncassi } from "./elencoIncassi";

const centesimi = (valore: number | string | null | undefined) => Math.round((Number(valore) || 0) * 100);

export function quadraturaCassaCommessa(
  residuoContratto: number,
  rate: Installment[],
  documenti: FatturaCommessa[],
  ritenutaSal: number,
  iva: number | null,
) {
  const rateAperte = vociIncassi(rate, documenti).reduce((totale, voce) => {
    const rata = voce.rata;
    if (!rata || rata.is_paid) return totale;
    const residuo = rata.quota_fattura_residua != null
      ? centesimi(rata.quota_fattura_residua)
      : centesimi(rata.amount) - centesimi(rata.fattura?.importo_pagato);
    return totale + Math.max(0, residuo);
  }, 0);
  const differenza = centesimi(residuoContratto) - rateAperte;
  const garanziaLorda = iva == null ? null : calculateGrossFromNet(ritenutaSal, iva).grossAmount;
  return {
    rateAperte: rateAperte / 100,
    differenza: differenza / 100,
    coerenteConGaranzia: differenza > 0 && garanziaLorda != null && differenza === centesimi(garanziaLorda),
  };
}

export type ImportiBonificoCommessa = Pick<RitenutaBonifico, "documento_id" | "lordo" | "ritenuta" | "commissioni" | "stato">;

export function riepilogoBonificiCommessa(
  documenti: FatturaCommessa[],
  bonifici: ImportiBonificoCommessa[],
) {
  const perId = new Map(documenti.map(documento => [documento.id, documento]));
  let lordo = 0;
  let ritenuta = 0;
  let commissioni = 0;
  for (const bonifico of bonifici) {
    const documento = perId.get(bonifico.documento_id);
    if (!documento || bonifico.stato === "stornata") continue;
    const totaleFattura = centesimi(documento.totale_da_pagare);
    const quota = documento.importo_associato == null ? 1 : totaleFattura > 0
      ? Math.min(1, Math.max(0, centesimi(documento.importo_associato) / totaleFattura))
      : 0;
    lordo += Math.round(centesimi(bonifico.lordo) * quota);
    ritenuta += Math.round(centesimi(bonifico.ritenuta) * quota);
    commissioni += Math.round(centesimi(bonifico.commissioni) * quota);
  }
  return { lordo: lordo / 100, ritenuta: ritenuta / 100, commissioni: commissioni / 100, netto: (lordo - ritenuta - commissioni) / 100 };
}
