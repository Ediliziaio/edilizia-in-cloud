import { supabase } from "@/integrations/supabase/client";
import type { DocumentoFiscale, RigaDocumento } from "@/types/fatturazione";
import { calcolaRiepilogoIVA, calcolaTotaliDocumento } from "./calcoli";

/**
 * Converts a proforma or preventivo into a fattura.
 * - Creates a new fattura with same data
 * - Marks original as 'annullata' with a reference note
 */
export async function convertiProformaInFattura(proformaId: string): Promise<DocumentoFiscale> {
  // Load original
  const { data: orig, error: fetchErr } = await supabase
    .from("documenti_fiscali" as never)
    .select("*")
    .eq("id", proformaId)
    .is("deleted_at", null)
    .single();

  if (fetchErr) throw fetchErr;
  const doc = orig as Record<string, unknown>;

  if (!["proforma", "preventivo"].includes(doc.tipo as string)) {
    throw new Error("Solo proforma e preventivi possono essere convertiti");
  }

  const companyId = doc.company_id as string;

  // Generate new number
  const { data: numero, error: rpcErr } = await supabase.rpc(
    "genera_numero_documento_native" as never,
    { p_company_id: companyId, p_tipo: "fattura", p_anno: new Date().getFullYear() } as never
  );
  if (rpcErr) throw rpcErr;

  const progressivo = parseInt((numero as string).split("-").pop() ?? "1", 10);

  // Ricalcola totali e riepilogo_iva dalle righe per garantire consistenza
  const righe = (doc.righe as RigaDocumento[]) || [];
  const totali = calcolaTotaliDocumento(righe, {
    bolloVirtuale: doc.bollo_virtuale as boolean | undefined,
    ritenutaAcconto: doc.ritenuta_acconto as boolean | undefined,
    ritenutaAliquota: doc.ritenuta_aliquota as number | undefined,
    cassaPrevidenziale: doc.cassa_previdenziale as boolean | undefined,
    cassaAliquota: doc.cassa_aliquota as number | undefined,
    cassaImponibile: doc.cassa_importo as number | undefined,
  });

  // Create fattura
  const { data: newDoc, error: createErr } = await supabase
    .from("documenti_fiscali" as never)
    .insert({
      company_id: companyId,
      tipo: "fattura",
      numero: numero as string,
      numero_progressivo: progressivo,
      anno: new Date().getFullYear(),
      data_emissione: new Date().toISOString().split("T")[0],
      anagrafica_id: doc.anagrafica_id,
      cliente_snapshot: doc.cliente_snapshot,
      stato: "bozza",
      righe: doc.righe,
      riepilogo_iva: totali.riepilogo_iva,
      subtotale: totali.subtotale,
      imponibile_totale: totali.imponibile_totale,
      iva_totale: totali.iva_totale,
      totale_documento: totali.totale_documento,
      totale_da_pagare: totali.totale_da_pagare,
      scadenze_pagamento: doc.scadenze_pagamento,
      metodo_pagamento_codice: doc.metodo_pagamento_codice,
      iban_pagamento: doc.iban_pagamento,
      note_documento: doc.note_documento,
      documento_correlato_id: proformaId,
      bollo_virtuale: doc.bollo_virtuale,
      ritenuta_acconto: doc.ritenuta_acconto,
      ritenuta_tipo: doc.ritenuta_tipo,
      ritenuta_aliquota: doc.ritenuta_aliquota,
      ritenuta_importo: doc.ritenuta_importo,
      cassa_previdenziale: doc.cassa_previdenziale,
      cassa_tipo: doc.cassa_tipo,
      cassa_aliquota: doc.cassa_aliquota,
      cassa_importo: doc.cassa_importo,
    } as never)
    .select()
    .single();

  if (createErr) throw createErr;

  // Mark original as annullata
  const { error: updateErr } = await supabase
    .from("documenti_fiscali" as never)
    .update({
      stato: "annullata",
      note_interne: `Convertito in fattura ${numero}`,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", proformaId);

  if (updateErr) {
    console.error('[proforma] Errore aggiornamento stato proforma originale:', updateErr.message, updateErr.code);
    throw new Error(`Impossibile aggiornare lo stato del documento originale: ${updateErr.message}`);
  }

  return newDoc as unknown as DocumentoFiscale;
}
