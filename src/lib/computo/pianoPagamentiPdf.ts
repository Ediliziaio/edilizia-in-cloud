/** Il piano dei pagamenti come righe di testo del PDF, uguali nei due motori di stampa. */
import { formatEuro } from "./computoStrutturato";

export type RataPdf = {
  descrizione: string; quando: string; termine: string;
  /** Nulla per una rata a misura: l'importo lo dirà il SAL. */
  percentuale: number | null;
  /** Quello che paga il cliente. Nullo se la rata è a misura o se l'IVA non è ancora decisa. */
  importo: number | null;
  /** Rata pagata sull'avanzamento misurato: nel documento non può avere un importo (11/11/2026). */
  aMisura?: boolean;
  /** Per una rata a misura: la quota del contratto che le toccherebbe, come indicazione. */
  quotaIndicativa?: number | null;
  /** L'imponibile della rata, quando serve dirlo a parte. */
  imponibile?: number | null;
};

/** «Restano trattenuti … fino allo svincolo»: la riga della ritenuta a garanzia, se c'è. */
export type RitenutaPdf = { percentuale: number; totale: number; svincolo: string };

export function testoPianoPagamenti(
  rate: RataPdf[] | undefined, ivaApplicata: boolean, mostraImporti = true, ritenuta?: RitenutaPdf | null,
): string {
  if (!mostraImporti || !rate?.length) return "";
  const righe = rate.map(r => {
    const testa = `${r.descrizione} - ${r.quando}${r.termine ? `, pagamento ${r.termine}` : ""}`;
    if (r.aMisura) {
      const quota = r.quotaIndicativa != null && r.quotaIndicativa > 0
        ? ` (quota indicativa ${r.quotaIndicativa.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%)` : "";
      return `${testa}: a misura sull'avanzamento dei lavori${quota}`;
    }
    const pct = r.percentuale == null ? "" : `${r.percentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
    if (r.importo == null) return `${testa}: ${pct || "quota"} del totale`;
    const imponibile = r.imponibile != null && ivaApplicata ? ` (imponibile ${formatEuro(r.imponibile)} €)` : "";
    return `${testa}: ${pct} = ${formatEuro(r.importo)} €${ivaApplicata ? " IVA inclusa" : ""}${imponibile}`;
  });
  if (ritenuta && ritenuta.percentuale > 0) {
    righe.push(`Su ogni pagamento si applica una ritenuta a garanzia del ${ritenuta.percentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}% dell'imponibile, pari a ${formatEuro(ritenuta.totale)} €, svincolata ${ritenuta.svincolo}.`);
  }
  return righe.join("\n");
}
