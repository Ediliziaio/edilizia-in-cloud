import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import type { Json } from "@/integrations/supabase/types";
export type ProcurementContext = {
  tipo: "oda" | "rdo";
  id: string;
  documento: DocumentoOperativo;
  modo: "testo" | "pdf";
};
export function serializeProcurement(
  context: ProcurementContext | undefined,
): Json | null {
  return context ? (JSON.parse(JSON.stringify(context)) as Json) : null;
}
const labels: Record<string, string> = {
  description: "Descrizione",
  descrizione: "Descrizione",
  quantity: "Quantità",
  quantita: "Quantità",
  unit_price: "Prezzo unitario",
  prezzo_unitario: "Prezzo unitario",
  price_pending: "Prezzo da confermare",
  quantity_received: "Quantità ricevuta",
  status: "Stato",
  notes: "Note",
  note: "Note",
  internal_notes: "Note interne",
  payment_terms: "Pagamento",
  condizioni_pagamento: "Pagamento",
  expected_delivery_date: "Consegna prevista",
  data_fabbisogno: "Materiale necessario entro",
  scadenza_offerte: "Scadenza offerte",
  titolo: "Titolo",
  supplier_id: "Fornitore",
  order_id: "Commessa",
  delivery_address: "Indirizzo consegna",
  supplier_reference: "Riferimento fornitore",
  document_details: "Dettagli documento",
  totale_offerto: "Totale documento",
  giorni_consegna: "Giorni di consegna",
  validita_offerta: "Validità offerta",
  trasporto_tipo: "Trasporto",
  costo_trasporto: "Costo trasporto",
  disponibilita_note: "Disponibilità",
  disponibile: "Disponibile",
  discount_percent: "Sconto %",
  sconto_percentuale: "Sconto %",
  vat_rate: "IVA %",
  aliquota_iva: "IVA %",
  unit_of_measure: "Unità di misura",
  unita_misura: "Unità di misura",
  subtotal: "Imponibile",
  vat_total: "IVA",
  total: "Totale",
  attachment_url: "Documento fornitore",
  allegato_url: "Offerta allegata",
  supplier_id_aggiudicato: "Fornitore scelto",
  motivazione_scelta: "Motivazione scelta",
  purchase_order_id: "Ordine generato",
  aggancio_da_confermare: "Risposta da verificare",
  inviata_via: "Canale richiesta",
  inviata_at: "Prima richiesta",
  risposta_at: "Risposta ricevuta",
  confirmed_at: "Confermato il",
  actual_delivery_date: "Consegna effettiva",
  sent_at: "Inviato il",
};
export function record(
  value: Json | undefined,
): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
export function modificheEvento(payload: Json) {
  const p = record(payload),
    before = record(p.before),
    after = record(p.after);
  const out = Object.keys({ ...before, ...after })
    .filter(
      (k) =>
        labels[k] &&
        k !== "document_details" &&
        JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    )
    .map((k) => ({ campo: labels[k], prima: before[k], dopo: after[k] }));
  const details: Record<string, string> = {
    tipo: "Tipo documento",
    destinatarioNome: "Destinatario",
    destinatarioEmail: "Email destinatario",
    destinatarioIndirizzo: "Indirizzo fornitore",
    destinatarioPartitaIva: "Partita IVA destinatario",
    referente: "Referente",
    referenteEmail: "Email referente",
    referenteTelefono: "Telefono referente",
    destinazioneTipo: "Destinazione",
    referenteConsegna: "Referente consegna",
    noteConsegna: "Istruzioni consegna",
    condizioni: "Condizioni documento",
    codiceCliente: "Codice cliente",
    noteNelMessaggio: "Note nel messaggio",
  };
  const a = record(before.document_details),
    b = record(after.document_details);
  for (const k of Object.keys({ ...a, ...b }))
    if (details[k] && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      out.push({ campo: details[k], prima: a[k], dopo: b[k] });
  return out;
}
export function valoreStorico(value: Json | undefined): string {
  if (value == null || value === "") return "Non indicato";
  if (typeof value === "boolean") return value ? "Sì" : "No";
  if (typeof value === "number") return value.toLocaleString("it-IT");
  if (typeof value === "object") return "Dettagli aggiornati";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return value.split("-").reverse().join("/");
  return value;
}
