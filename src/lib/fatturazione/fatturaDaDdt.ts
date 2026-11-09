// «Fattura da questo DDT» (09/11/2026): cliente, righe e commessa arrivano dal DDT, e
// numero e data del DDT finiscono nell'XML (fattura differita, art. 21 c.4 DPR 633/72).
// Il DDT risulta fatturato solo quando la fattura viene emessa (documento_emetti).

import { calcolaRiga, calcolaTotaliDocumento } from "./calcoli";
import type { DocumentoFiscale, RigaDocumento } from "@/types/fatturazione";

export function datiFatturaDaDdt(ddt: DocumentoFiscale): Partial<DocumentoFiscale> {
  const righe = (ddt.righe ?? []).map((riga: RigaDocumento, i) => calcolaRiga({ ...riga, id: crypto.randomUUID(), numero_linea: i + 1 }));
  // I totali subito: dal dettaglio si emette senza riaprire l'editor.
  const totali = calcolaTotaliDocumento(righe, {});
  return {
    anagrafica_id: ddt.anagrafica_id,
    cliente_snapshot: ddt.cliente_snapshot,
    ordine_id: ddt.ordine_id,
    righe,
    riepilogo_iva: totali.riepilogo_iva,
    subtotale: totali.subtotale,
    imponibile_totale: totali.imponibile_totale,
    iva_totale: totali.iva_totale,
    totale_documento: totali.totale_documento,
    totale_da_pagare: totali.totale_da_pagare,
    riferimenti_ddt: [{ numero: ddt.numero, data: ddt.data_emissione }],
  };
}
