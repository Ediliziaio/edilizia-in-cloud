import { supabase } from "@/integrations/supabase/client";
import type { DocumentoFiscale, RigaDocumento } from "@/types/fatturazione";

/**
 * Creates a credit note (Nota di Credito) from an existing invoice.
 * @param fatturaOriginaleId - ID of the original invoice
 * @param modalita - 'totale' for full reversal, 'parziale' for partial (empty lines)
 */
export async function creaNotaCredito(
  fatturaOriginaleId: string,
  modalita: "totale" | "parziale"
): Promise<Partial<DocumentoFiscale>> {
  // Load original invoice
  const { data, error } = await supabase
    .from("documenti_fiscali" as never)
    .select("*")
    .eq("id", fatturaOriginaleId)
    .single();

  if (error) throw new Error("Impossibile caricare la fattura originale");
  const fattura = data as unknown as DocumentoFiscale;

  const righe: RigaDocumento[] =
    modalita === "totale"
      ? fattura.righe.map((r, i) => ({
          ...r,
          id: crypto.randomUUID(),
          numero_linea: i + 1,
          quantita: Math.abs(r.quantita) * -1,
          imponibile: Math.abs(r.imponibile) * -1,
          imposta: Math.abs(r.imposta) * -1,
          totale_riga: Math.abs(r.totale_riga) * -1,
        }))
      : [];

  return {
    tipo: "nota_credito",
    documento_correlato_id: fatturaOriginaleId,
    anagrafica_id: fattura.anagrafica_id,
    cliente_snapshot: fattura.cliente_snapshot,
    righe,
    metodo_pagamento_codice: fattura.metodo_pagamento_codice,
    iban_pagamento: fattura.iban_pagamento,
    note_documento: `Nota di Credito a storno ${modalita === "totale" ? "totale" : "parziale"} della fattura N° ${fattura.numero} del ${fattura.data_emissione}`,
  };
}

/**
 * After a credit note is emitted, update the original invoice's payment status.
 */
export async function applicaStornoSuFattura(
  fatturaId: string,
  importoNC: number
): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from("documenti_fiscali" as never)
    .select("totale_da_pagare, importo_pagato")
    .eq("id", fatturaId)
    .single();

  if (fetchErr) throw fetchErr;
  const doc = data as unknown as { totale_da_pagare: number; importo_pagato: number };

  const nuovoPagato = doc.importo_pagato + Math.abs(importoNC);
  const nuovoStato = nuovoPagato >= doc.totale_da_pagare ? "stornata" : "parzialmente_pagata";

  const { error } = await supabase
    .from("documenti_fiscali" as never)
    .update({
      importo_pagato: nuovoPagato,
      stato: nuovoStato,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", fatturaId);

  if (error) throw error;
}
