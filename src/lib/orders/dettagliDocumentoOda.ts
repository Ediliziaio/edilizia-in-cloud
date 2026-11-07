import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";

/** Solo dati della copia: quantità, prezzi, stato e collegamenti restano nelle colonne dell'ordine. */
export function applicaDettagliOda(base: DocumentoOperativo, json?: Json | null): DocumentoOperativo {
  if (!json || typeof json !== "object" || Array.isArray(json)) return base;
  const testo = (key: string, fallback?: string | null) => typeof json[key] === "string" ? json[key] as string : fallback;
  const tipo = json.tipo === "servizi" || json.tipo === "materiali" ? json.tipo : base.tipo;
  const destinazione = ["cantiere", "magazzino", "ritiro", "altro"].includes(String(json.destinazioneTipo))
    ? json.destinazioneTipo as DocumentoOperativo["destinazioneTipo"] : base.destinazioneTipo;
  return {
    ...base, tipo, destinazioneTipo: destinazione,
    destinatario: {nome:testo("destinatarioNome",base.destinatario.nome) || "",email:testo("destinatarioEmail",base.destinatario.email),indirizzo:testo("destinatarioIndirizzo",base.destinatario.indirizzo),partitaIva:testo("destinatarioPartitaIva",base.destinatario.partitaIva)},
    referente:testo("referente",base.referente),referenteEmail:testo("referenteEmail",base.referenteEmail),referenteTelefono:testo("referenteTelefono",base.referenteTelefono),
    referenteConsegna:testo("referenteConsegna",base.referenteConsegna),noteConsegna:testo("noteConsegna",base.noteConsegna),condizioni:testo("condizioni",base.condizioni),codiceCliente:testo("codiceCliente",base.codiceCliente),
    noteNelMessaggio:typeof json.noteNelMessaggio === "boolean" ? json.noteNelMessaggio : base.noteNelMessaggio,
  };
}

export function aggiornamentoDettagliOda(d: DocumentoOperativo, internalNotes: string, paymentMethod?: string | null): TablesUpdate<"purchase_orders"> {
  return {
    issue_date:d.data!, expected_delivery_date:d.consegna || null, supplier_reference:d.riferimento?.trim() || null,
    delivery_address:d.luogo?.trim() || null, delivery_warehouse_id:d.destinazioneTipo === "magazzino" ? d.magazzinoId || null : null,
    ...(paymentMethod !== undefined ? {payment_method:paymentMethod?.trim() || null} : {}),
    payment_terms:d.pagamento?.trim() || null, notes:d.note?.trim() || null, internal_notes:internalNotes.trim() || null,
    document_details:{tipo:d.tipo,destinatarioNome:d.destinatario.nome,destinatarioEmail:d.destinatario.email ?? null,destinatarioIndirizzo:d.destinatario.indirizzo ?? null,destinatarioPartitaIva:d.destinatario.partitaIva ?? null,
      referente:d.referente ?? null,referenteEmail:d.referenteEmail ?? null,referenteTelefono:d.referenteTelefono ?? null,
      destinazioneTipo:d.destinazioneTipo ?? null,referenteConsegna:d.referenteConsegna ?? null,noteConsegna:d.noteConsegna ?? null,condizioni:d.condizioni ?? null,codiceCliente:d.codiceCliente ?? null,noteNelMessaggio:!!d.noteNelMessaggio},
  };
}
