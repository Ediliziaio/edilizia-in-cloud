import { supabase } from "@/integrations/supabase/client";
import { importoConSegno, tutteLePagine, unisciRegistroVendite, type RigaVendite } from "./registroVendite";

export async function caricaRegistroVendite(companyId: string): Promise<RigaVendite[]> {
  if (!companyId) throw new Error("Seleziona un'azienda per consultare il registro.");
  const [native, importate] = await Promise.all([
    tutteLePagine((from, to) => supabase.from("documenti_fiscali")
      .select("id, numero, data_emissione, data_scadenza, tipo, stato, anagrafica_id, cliente_snapshot, imponibile_totale, iva_totale, totale_documento, importo_pagato")
      .eq("company_id", companyId).is("deleted_at", null).order("id").range(from, to)),
    tutteLePagine((from, to) => supabase.from("invoices")
      .select("id, invoice_number, issue_date, document_type, status, client_company_name, client_vat_number, client_fiscal_code, subtotal, tax_amount, total, paid_amount")
      .eq("company_id", companyId).is("deleted_at", null).not("external_provider", "is", null).order("id").range(from, to)),
  ]);
  const n: RigaVendite[] = native.map(d => ({
    ...d, origine: "nativa", cliente_snapshot: (d.cliente_snapshot ?? {}) as RigaVendite["cliente_snapshot"],
    imponibile_totale: importoConSegno(d.tipo, d.imponibile_totale), iva_totale: importoConSegno(d.tipo, d.iva_totale),
    totale_documento: importoConSegno(d.tipo, d.totale_documento), importo_pagato: importoConSegno(d.tipo, d.importo_pagato),
  }));
  const i: RigaVendite[] = importate.map(d => ({
    id: d.id, origine: "importata", numero: d.invoice_number, data_emissione: d.issue_date ?? "", tipo: d.document_type ?? "", stato: d.status ?? "",
    cliente_snapshot: { ragione_sociale: d.client_company_name ?? "", partita_iva: d.client_vat_number ?? "", codice_fiscale: d.client_fiscal_code ?? "" },
    imponibile_totale: importoConSegno(d.document_type, d.subtotal), iva_totale: importoConSegno(d.document_type, d.tax_amount),
    totale_documento: importoConSegno(d.document_type, d.total), importo_pagato: importoConSegno(d.document_type, d.paid_amount),
  }));
  return unisciRegistroVendite(n, i);
}
