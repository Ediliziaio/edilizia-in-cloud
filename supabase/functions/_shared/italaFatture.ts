import { leggiFatturaPA, normalizzaPiva } from "./fatturapaReader.ts";
import { leggiFatturaRicevuta } from "./fatturaRicevutaXml.ts";
import { LettoreXmlMinimo } from "./xmlMinimo.ts";
import { base64ToBytes } from "./base64.ts";
import { xmlDaFile } from "./ricevuteOpenapi.ts";
import type { ItalaInvoice } from "./italaClient.ts";

export const ITALA_STATUS_MAP: Record<string, "sent" | "delivered" | "issued"> = {
  INVI: "sent", PREN: "sent", CONS: "delivered", NONC: "issued", ERRO: "issued",
  ACCE: "delivered", RIFI: "issued", DECO: "delivered",
};
export function italaDocument(row: ItalaInvoice, vat: string) {
  if (!row.id || normalizzaPiva(row.partita_iva) !== normalizzaPiva(vat)) {
    throw new Error("Fattura del provider senza azienda verificabile o appartenente a un'altra partita IVA.");
  }
  const original = row.sdi_fattura_base64 ? base64ToBytes(row.sdi_fattura_base64) : null;
  const xml = original ? xmlDaFile(original) : row.sdi_fattura_xml;
  if (!xml) throw new Error(`Fattura ${row.id}: manca un XML leggibile. Nessun importo è stato inventato.`);
  const parser = new LettoreXmlMinimo();
  const read = leggiFatturaPA(xml, parser), received = leggiFatturaRicevuta(xml, parser);
  if (!read || !received || !read.numero || !read.data) throw new Error(`Fattura ${row.id}: XML incompleto o non leggibile.`);
  // Existing importers support one body. Fail explicitly, rather than silently losing bodies 2+.
  if (received.fatture_nel_file !== 1) throw new Error(`Fattura ${row.id}: il file contiene più corpi. Importalo dal caricamento XML per controllare tutte le fatture.`);
  const incoming = row.ricezione === 1;
  const party = incoming ? received.cessionario_piva : read.cedentePiva;
  if (normalizzaPiva(party) !== normalizzaPiva(vat)) throw new Error(`Fattura ${row.id}: la direzione non corrisponde alla partita IVA dell'azienda.`);
  return { incoming, xml, original: original ?? new TextEncoder().encode(xml), read, received };
}
export function italaIssued(row: ItalaInvoice, vat: string) {
  const doc = italaDocument(row, vat);
  if (doc.incoming) throw new Error("Una fattura ricevuta non può diventare un ricavo.");
  const r = doc.read;
  return {
    externalId: String(row.id), documentType: r.documentType, number: r.numero,
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
