import type { DDTIndirizzoConsegna } from "@/components/ddt/ShipmentDDTPDF";

function testo(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

/**
 * Il luogo di consegna salvato sul DDT (`ddt_indirizzo_consegna`) come lo stampa il PDF.
 *
 * Il «Luogo di destinazione» scritto a mano nell'editor sta in `free_text`, e l'editor lo mostra al posto dei
 * campi divisi: il PDF fa lo stesso. Prima lo ignorava e stampava il luogo di prima, o nessun luogo.
 */
export function luogoConsegnaDDT(ic: unknown): DDTIndirizzoConsegna | null {
  if (typeof ic === "string") return ic.trim() ? { address: ic.trim() } : null;
  if (!ic || typeof ic !== "object") return null;
  const r = ic as Record<string, unknown>;
  const riferimento = testo(r.riferimento) ?? testo(r.descrizione);
  const libero = testo(r.free_text)?.trim();
  if (libero) return { address: libero, city: null, postal_code: null, province: null, riferimento };
  return {
    address: testo(r.address) ?? testo(r.indirizzo) ?? testo(r.via),
    city: testo(r.city) ?? testo(r.citta) ?? testo(r.comune),
    postal_code: testo(r.postal_code) ?? testo(r.cap),
    province: testo(r.province) ?? testo(r.provincia),
    riferimento,
  };
}
