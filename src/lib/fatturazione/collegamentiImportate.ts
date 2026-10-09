import { supabase } from "@/integrations/supabase/client";
export interface CollegamentoImportata {
  status: "ok" | "da_verificare";
  motivo?: string;
  anagrafica_id?: string | null;
  customer_id?: string | null;
  order_id?: string | null;
  crea_anagrafica?: boolean;
  cliente_operativo_mancante?: boolean;
}
export async function riconciliaEmessa(companyId: string, invoiceId: string, applica = false, orderId?: string): Promise<CollegamentoImportata> {
  if (!companyId || !invoiceId) throw new Error("Azienda e fattura obbligatorie.");
  // La RPC nuova ha autorizzazione aziendale, lock e controlli fiscali server-side.
  const { data, error } = await supabase.rpc("riconcilia_cliente_emessa_importata" as never, {
    p_company_id: companyId, p_invoice_id: invoiceId, p_apply: applica, p_order_id: orderId ?? null,
  } as never);
  if (error) throw error;
  if (!data || !["ok", "da_verificare"].includes((data as CollegamentoImportata).status)) throw new Error("Risposta di verifica non valida.");
  return data as CollegamentoImportata;
}

/** Importa solo la descrizione: non confonde acconto/NC con contratto, incasso o materiali da ordinare. */
export function datiLavoroDaEmessa(f: { invoice_number: string; document_type: string | null; issue_date: string | null; invoice_lines?: { description: string | null; sort_order?: number | null }[] }) {
  const righe = [...(f.invoice_lines ?? [])].sort((a,b) => (a.sort_order ?? 0)-(b.sort_order ?? 0));
  const descrizione = righe.map(r => r.description?.trim()).filter(Boolean).join("\n");
  return {
    description: descrizione.slice(0, 1000),
    internal_notes: (`Storico da fattura importata ${f.invoice_number}${f.issue_date ? ` del ${f.issue_date}` : ""}. Verificare indirizzo del cantiere, valore del contratto, avanzamento e incassi. L'importo della fattura può essere un acconto e non viene copiato nel valore commessa.${descrizione.length > 1000 ? " Descrizione abbreviata: le righe complete restano nel dettaglio della fattura collegata." : ""}`).slice(0,1000),
  };
}
