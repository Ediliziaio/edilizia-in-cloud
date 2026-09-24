// src/lib/fatturazione/generateXML.ts
// «Scarica XML» dell'app: lo stesso generatore che spedisce allo SDI.
//
// Fino al 24/09/2026 qui c'era una copia a parte, e le due erano divergite: il
// file scaricato (che si può caricare a mano sul portale dell'Agenzia) e quello
// inviato non erano la stessa fattura, e questo aveva i suoi difetti (condizioni
// di pagamento invertite, banca dopo l'IBAN, caratteri non ammessi dallo schema).
// Ora c'è un generatore solo: supabase/functions/_shared/generateXML.ts.

import type { DocumentoFiscale, AnagraficaAzienda } from "@/types/fatturazione";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";

export function generateFatturaPAXML(
  doc: DocumentoFiscale,
  azienda: AnagraficaAzienda,
  progressivoInvio?: string
): string {
  return generateXML(
    doc as unknown as Record<string, unknown>,
    azienda as unknown as Record<string, unknown>,
    progressivoInvio,
  );
}

// ─── Validation ──────────────────────────────────────────────

export interface XMLValidationError {
  field: string;
  message: string;
}

export function validateXML(xml: string): XMLValidationError[] {
  const errors: XMLValidationError[] = [];

  const requiredElements = [
    "IdTrasmittente",
    "ProgressivoInvio",
    "FormatoTrasmissione",
    "CodiceDestinatario",
    "CedentePrestatore",
    "CessionarioCommittente",
    "TipoDocumento",
    "Divisa",
    "Data",
    "Numero",
    "DettaglioLinee",
    "DatiRiepilogo",
  ];

  for (const el of requiredElements) {
    if (!xml.includes(`<${el}>`)) {
      errors.push({ field: el, message: `Elemento obbligatorio mancante: ${el}` });
    }
  }

  // Check for empty required values
  if (xml.includes("<IdCodice></IdCodice>")) {
    errors.push({ field: "IdCodice", message: "P.IVA cedente mancante" });
  }
  if (xml.includes("<Denominazione></Denominazione>")) {
    errors.push({ field: "Denominazione", message: "Denominazione mancante" });
  }

  return errors;
}
