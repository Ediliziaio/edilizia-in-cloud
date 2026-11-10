import type { SupplierFormData } from "@/lib/suppliers/anagraficaFornitore";
const testo = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** Solo dati del mittente: la destinazione della merce non è l'indirizzo del fornitore. */
export function fornitoreDaBolla(
  documento: Record<string, unknown> | null,
  nome: string | null,
): Partial<SupplierFormData> {
  const m = (documento?.mittente ?? {}) as Record<string, unknown>;
  return {
    name: testo(m.ragione_sociale) || nome || "",
    vat_number: testo(m.partita_iva).replace(/^IT/i, ""),
    fiscal_code: testo(m.codice_fiscale),
    address: testo(m.indirizzo),
    city: testo(m.comune),
    province: testo(m.provincia),
    postal_code: testo(m.cap),
    notes:
      "Anagrafica proposta dalla lettura di un DDT. Dati verificati alla creazione.",
  };
}
