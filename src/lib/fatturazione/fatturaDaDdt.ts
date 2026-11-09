// «Fattura da questo DDT» (09/11/2026): cliente, righe e commessa arrivano dal DDT, e
// numero e data del DDT finiscono nell'XML (fattura differita, art. 21 c.4 DPR 633/72).
// Il DDT risulta fatturato solo quando la fattura viene emessa (documento_emetti).

import type { DocumentoFiscale, RigaDocumento } from "@/types/fatturazione";

export function datiFatturaDaDdt(ddt: DocumentoFiscale): Partial<DocumentoFiscale> {
  return {
    anagrafica_id: ddt.anagrafica_id,
    cliente_snapshot: ddt.cliente_snapshot,
    ordine_id: ddt.ordine_id,
    righe: (ddt.righe ?? []).map((riga: RigaDocumento, i) => ({ ...riga, id: crypto.randomUUID(), numero_linea: i + 1 })),
    riferimenti_ddt: [{ numero: ddt.numero, data: ddt.data_emissione }],
  };
}
