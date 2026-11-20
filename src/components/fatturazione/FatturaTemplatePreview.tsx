import type { AnagraficaAzienda } from "@/types/fatturazione";
import { FoglioFatturaAdattabile } from "./FoglioFatturaAdattabile";
import { PreviewFattura } from "./PreviewFattura";

export type TipoAnteprimaFiscale = "fattura" | "nota_credito" | "proforma" | "ddt";

/** L'anteprima delle impostazioni usa il foglio della fattura vera, adattato al pannello. */
export function FatturaTemplatePreview({ azienda, logoAziendale, numero, tipo = "fattura" }: {
  azienda: AnagraficaAzienda;
  logoAziendale?: string | null;
  numero: string;
  tipo?: TipoAnteprimaFiscale;
}) {
  return (
    <FoglioFatturaAdattabile className="max-h-[68dvh] overflow-y-auto rounded-b-lg">
      <PreviewFattura azienda={azienda} logoAziendale={logoAziendale} scale={1} documento={{
        tipo, numero, data_emissione: new Date().toLocaleDateString("sv-SE"),
        cliente_snapshot: { tipo_cliente: "B2B", ragione_sociale: "Cliente Esempio S.r.l.", indirizzo_via: "Via Roma 1", indirizzo_cap: "00100", indirizzo_comune: "Roma", indirizzo_nazione: "IT" },
        righe: [{ id: "esempio", numero_linea: 1,
          descrizione: tipo === "nota_credito" ? "Storno della lavorazione" : tipo === "ddt" ? "Materiale per il cantiere" : "Lavorazioni eseguite come da accordi",
          quantita: 1, unita_misura: "corpo", prezzo_unitario: 1000, imponibile: 1000, aliquota_iva: "22", imposta: 220, totale_riga: 1220 }],
        imponibile_totale: 1000, iva_totale: 220, totale_documento: 1220, totale_da_pagare: 1220,
      }} />
    </FoglioFatturaAdattabile>
  );
}
