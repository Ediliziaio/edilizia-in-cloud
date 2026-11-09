import type { DocumentoFiscale } from "@/types/fatturazione";

/** Il cestino: una bozza torna bozza; ciò che è stato annullato col suo numero resta in archivio. */
const FISCALI = ["fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura", "fattura_riepilogativa"];

export function siPuoRipristinare(doc: Pick<DocumentoFiscale, "tipo" | "stato" | "numero">): boolean {
  return !(doc.stato === "annullata" && FISCALI.includes(doc.tipo) && !String(doc.numero ?? "").startsWith("Bozza "));
}
