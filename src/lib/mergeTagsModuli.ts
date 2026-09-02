/**
 * Merge tag nei moduli vendita (Serramenti, Fotovoltaico, Ristrutturazione).
 *
 * I blocchi "Condizioni e termini legali" della libreria Template offerte usano
 * i tag {{cliente.nome_completo}}, {{azienda.ragione_sociale}}, {{cantiere.indirizzo}}…
 * Quando un modulo li importa nel proprio testo, il PDF del modulo deve
 * sostituirli con i dati del progetto: qui si riusa lo stesso composer della
 * edge generate-quote-pdf (file senza dipendenze Deno, importabile dal client).
 */
import { buildMergeContext, substituteMergeTags } from "../../supabase/functions/_shared/quoteTemplateComposer";

export interface DatiMergeModulo {
  companyName?: string | null;
  companyVat?: string | null;
  companyAddress?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  clienteNome?: string | null;
  clienteCognome?: string | null;
  clienteEmail?: string | null;
  clienteTelefono?: string | null;
  clienteIndirizzo?: string | null;
  cantiereIndirizzo?: string | null;
  cantiereCitta?: string | null;
  numero?: string | null;
  totale?: number | string | null;
  dataDocumento?: string | null;
  /** Testo "condizioni di pagamento" del modulo, per {{preventivo.piano_pagamenti}}. */
  pianoPagamenti?: string | null;
}

export function applicaMergeTagModulo(testo: string | null | undefined, dati: DatiMergeModulo): string {
  if (!testo || !testo.includes("{{")) return testo ?? "";
  const nomeCompleto = [dati.clienteNome, dati.clienteCognome].filter(Boolean).join(" ").trim();
  const ctx = buildMergeContext({
    quote: {
      quote_number: dati.numero ?? "",
      client_name: nomeCompleto || undefined,
      client_email: dati.clienteEmail ?? "",
      client_phone: dati.clienteTelefono ?? "",
      client_address: dati.cantiereIndirizzo ?? dati.clienteIndirizzo ?? "",
      total: dati.totale ?? null,
      created_at: dati.dataDocumento ?? new Date().toISOString(),
    },
    company: {
      name: dati.companyName ?? "",
      vat_number: dati.companyVat ?? "",
      address: dati.companyAddress ?? "",
      email: dati.companyEmail ?? "",
      phone: dati.companyPhone ?? "",
    },
    contact: { first_name: dati.clienteNome ?? "", last_name: dati.clienteCognome ?? "", city: dati.cantiereCitta ?? "" },
    cantiere: { indirizzo: dati.cantiereIndirizzo ?? dati.clienteIndirizzo ?? "", citta: dati.cantiereCitta ?? "" },
    template: { payment_terms_text: dati.pianoPagamenti ?? "" },
  });
  return substituteMergeTags(testo, ctx);
}
