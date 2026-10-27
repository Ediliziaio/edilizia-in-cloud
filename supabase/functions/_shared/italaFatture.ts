import { leggiFatturaPA, normalizzaPiva } from "./fatturapaReader.ts";
import { leggiFatturaRicevuta } from "./fatturaRicevutaXml.ts";
import { LettoreXmlMinimo } from "./xmlMinimo.ts";
import { base64ToBytes } from "./base64.ts";
import { xmlDaFile } from "./ricevuteOpenapi.ts";
import type { ItalaInvoice } from "./italaClient.ts";

export const ITALA_STATUS_MAP: Record<string, "sent" | "delivered" | "issued" | "draft"> = {
  INVI: "sent", PREN: "draft", CONS: "delivered", NONC: "issued", ERRO: "draft",
  ACCE: "delivered", RIFI: "issued", DECO: "delivered",
};
export function italaDocument(row: ItalaInvoice, vat: string, indiceCorpo = 0) {
  if (!row.id || (row.partita_iva && normalizzaPiva(row.partita_iva) !== normalizzaPiva(vat))) {
    throw new Error("Fattura del provider senza azienda verificabile o appartenente a un'altra partita IVA.");
  }
  const original = row.sdi_fattura_base64 ? base64ToBytes(row.sdi_fattura_base64) : null;
  const xml = original ? xmlDaFile(original) : row.sdi_fattura_xml;
  if (!xml) throw new Error(`Fattura ${row.id}: manca un XML leggibile. Nessun importo è stato inventato.`);
  const parser = new LettoreXmlMinimo();
  const read = leggiFatturaPA(xml, parser, indiceCorpo), received = leggiFatturaRicevuta(xml, parser, indiceCorpo);
  if (!read || !received || !read.numero || !read.data) throw new Error(`Fattura ${row.id}: XML incompleto o non leggibile.`);

  const incoming = row.ricezione === 1;
  const party = incoming ? received.cessionario_piva : read.cedentePiva;
  if (normalizzaPiva(party) !== normalizzaPiva(vat)) throw new Error(`Fattura ${row.id}: la direzione non corrisponde alla partita IVA dell'azienda.`);
  return { incoming, indiceCorpo, xml, original: original ?? new TextEncoder().encode(xml), read, received };
}
export function italaIssued(row: ItalaInvoice, vat: string, indiceCorpo = 0) {
  const doc = italaDocument(row, vat, indiceCorpo);
  if (doc.incoming) throw new Error("Una fattura ricevuta non può diventare un ricavo.");
  const r = doc.read;
  // Autofatture e integrazioni non sono ricavi dell'azienda.
  const documentType = ["TD16", "TD17", "TD18", "TD19", "TD20", "TD21", "TD22", "TD23", "TD26", "TD27", "TD28", "TD29"].includes(r.tipoDocumentoSdi ?? "") ? r.tipoDocumentoSdi! : r.documentType;
  return {
    externalId: doc.received.fatture_nel_file > 1 ? `${row.id}_${indiceCorpo + 1}` : String(row.id), documentType, number: r.numero,
    externalStatus: row.sdi_stato, sdiId: row.sdi_identificativo?.toString(),
    externalTaxSummary: r.riepilogoIva, externalDocumentType: r.tipoDocumentoSdi,
    status: ITALA_STATUS_MAP[row.sdi_stato ?? ""] ?? "issued",
    clientName: r.cliente.nome, clientVat: r.cliente.piva, clientFiscalCode: r.cliente.cf,
    clientAddress: r.cliente.indirizzo, clientCity: r.cliente.citta, clientZip: r.cliente.cap,
    clientCountry: r.cliente.paese, clientPec: r.cliente.pec, clientSdi: r.cliente.sdi,
    issueDate: r.data, dueDate: r.scadenza, total: r.totale, subtotal: r.imponibile,
    taxAmount: r.imposta, paymentMethod: r.modalitaPagamento, iban: r.iban,
    lines: r.righe.map(l => ({ description: l.description, productCode: l.product_code,
      unit: l.unit, quantity: l.quantity, unitPrice: l.unit_price, discountPercent: l.discount_percent,
      taxRate: l.tax_rate, taxNature: l.tax_nature, lineNet: l.line_net,
      lineTax: l.line_tax, lineGross: l.line_gross })),
  };
}
