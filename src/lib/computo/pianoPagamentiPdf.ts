/** Il piano dei pagamenti come righe di testo del PDF, uguali nei due motori di stampa. */
import { formatEuro } from "./computoStrutturato";

export type RataPdf = {
  descrizione: string; quando: string; percentuale: number; importo: number; termine: string;
  /** La rata con l'IVA (Dimora Torino, 31/10/2026: il cliente paga questo). Assente se l'IVA non è definita. */
  importoIvato?: number | null;
};

export function testoPianoPagamenti(rate: RataPdf[] | undefined, ivaApplicata: boolean): string {
  if (!rate?.length) return "";
  const righe = rate.map(r => `${r.descrizione} - ${r.quando}${r.termine ? `, pagamento a ${r.termine}` : ""}: ${r.percentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}% = ${formatEuro(r.importo)} €${ivaApplicata ? (r.importoIvato != null ? ` + IVA = ${formatEuro(r.importoIvato)} € IVA inclusa` : " + IVA") : ""}`);
  return righe.join("\n");
}
