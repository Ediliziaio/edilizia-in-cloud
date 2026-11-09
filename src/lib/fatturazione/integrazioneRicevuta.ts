// Dalla fattura ricevuta all'integrazione (09/11/2026): reverse charge interno (TD16)
// o acquisto dall'estero (TD17, TD18, TD19). Nell'XML il cedente è il fornitore, noi
// siamo il cessionario, e la fattura ricevuta va in DatiFattureCollegate.

import { calcolaRiga, calcolaTotaliDocumento } from "./calcoli";
import type { DocumentoFiscale, RigaDocumento } from "@/types/fatturazione";

export type TipoIntegrazione =
  | "reverse_charge_interno" | "integrazione_servizi_estero" | "integrazione_beni_ue" | "integrazione_beni_extra_ue";

export const TIPI_INTEGRAZIONE: { tipo: TipoIntegrazione; etichetta: string }[] = [
  { tipo: "reverse_charge_interno", etichetta: "TD16 · Reverse charge interno (subappalto, edilizia)" },
  { tipo: "integrazione_servizi_estero", etichetta: "TD17 · Servizi acquistati dall'estero" },
  { tipo: "integrazione_beni_ue", etichetta: "TD18 · Beni acquistati in UE" },
  { tipo: "integrazione_beni_extra_ue", etichetta: "TD19 · Beni ex art. 17 c.2 (già in Italia)" },
];

export interface RicevutaDaIntegrare {
  id: string;
  cedente_ragione_sociale: string;
  cedente_piva?: string | null;
  cedente_cf?: string | null;
  cedente_paese?: string | null;
  cedente_indirizzo?: string | null;
  cedente_cap?: string | null;
  cedente_comune?: string | null;
  cedente_provincia?: string | null;
  tipo_documento: string;
  numero_fattura: string;
  data_fattura: string;
  imponibile_totale?: number | null;
  aliquota_reverse_charge?: number | null;
  riepilogo_iva?: unknown;
}

type RigaRiepilogo = { natura?: string | null; imponibile?: number | string | null };

const righeRiepilogo = (f: RicevutaDaIntegrare): RigaRiepilogo[] => (Array.isArray(f.riepilogo_iva) ? f.riepilogo_iva as RigaRiepilogo[] : []);
const inReverseCharge = (r: RigaRiepilogo) => String(r.natura ?? "").toUpperCase().replace("_", ".").startsWith("N6");
const estera = (f: RicevutaDaIntegrare) => !!f.cedente_paese && f.cedente_paese.toUpperCase() !== "IT";

/** Note di credito e autofatture ricevute non si integrano da qui. */
export function serveIntegrazione(f: RicevutaDaIntegrare): boolean {
  if (["TD04", "TD08", "TD16", "TD17", "TD18", "TD19", "TD20", "TD28"].includes(f.tipo_documento)) return false;
  return estera(f) || righeRiepilogo(f).some(inReverseCharge);
}

export function tipoProposto(f: RicevutaDaIntegrare): TipoIntegrazione {
  return estera(f) ? "integrazione_servizi_estero" : "reverse_charge_interno";
}

/** La bozza: una riga per ogni importo in reverse charge, con l'IVA che la fattura non ha. */
export function datiIntegrazione(f: RicevutaDaIntegrare, aliquota: number): Partial<DocumentoFiscale> & { fattura_ricevuta_id: string } {
  const importi = righeRiepilogo(f).filter(inReverseCharge).map((r) => Number(r.imponibile) || 0).filter((v) => v !== 0);
  const basi = importi.length > 0 ? importi : [Number(f.imponibile_totale) || 0];
  const righe: RigaDocumento[] = basi.map((imponibile, i) => calcolaRiga({
    id: crypto.randomUUID(),
    numero_linea: i + 1,
    descrizione: `Integrazione fattura n. ${f.numero_fattura} del ${f.data_fattura} di ${f.cedente_ragione_sociale}`,
    quantita: 1,
    unita_misura: "pz",
    prezzo_unitario: imponibile,
    imponibile,
    aliquota_iva: String(aliquota),
    imposta: 0,
    totale_riga: imponibile,
  }));
  const totali = calcolaTotaliDocumento(righe, {});
  const nazione = (f.cedente_paese || "IT").toUpperCase();
  return {
    fattura_ricevuta_id: f.id,
    cliente_snapshot: {
      ragione_sociale: f.cedente_ragione_sociale,
      partita_iva: f.cedente_piva ?? undefined,
      codice_fiscale: f.cedente_cf ?? undefined,
      indirizzo_via: f.cedente_indirizzo ?? undefined,
      indirizzo_cap: f.cedente_cap ?? undefined,
      indirizzo_comune: f.cedente_comune ?? undefined,
      indirizzo_provincia: f.cedente_provincia ?? undefined,
      indirizzo_nazione: nazione,
      tipo_cliente: nazione === "IT" ? "B2B" : "Estero",
    },
    righe,
    riepilogo_iva: totali.riepilogo_iva,
    subtotale: totali.subtotale,
    imponibile_totale: totali.imponibile_totale,
    iva_totale: totali.iva_totale,
    totale_documento: totali.totale_documento,
    totale_da_pagare: totali.totale_da_pagare,
    note_documento: `Integrazione della fattura n. ${f.numero_fattura} del ${f.data_fattura}.`,
  };
}
