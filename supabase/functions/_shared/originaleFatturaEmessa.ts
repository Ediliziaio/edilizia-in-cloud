import type { FatturaLetta } from "./fatturapaReader.ts";

const testo = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();
const ugualeNumero = (a: unknown, b: number, tolleranza = 0.000001) => a != null && a !== "" && Number.isFinite(Number(a)) && Math.abs(Number(a) - b) <= tolleranza;

interface OriginaliClient {
  storage: { from(bucket: string): {
    upload(path: string, file: Blob, options: { upsert: boolean }): PromiseLike<{ error: unknown }>;
    remove(paths: string[]): PromiseLike<{ error: unknown }>;
  } };
}

/** Collegare un originale allo storico non deve introdurre una fattura diversa con lo stesso numero. */
export function originaleCorrispondeAllaFattura(archiviata: Record<string, unknown>, letta: FatturaLetta, righe: Record<string, unknown>[]): boolean {
  if (archiviata.invoice_number !== letta.numero || String(archiviata.issue_date).slice(0, 10) !== letta.data ||
    archiviata.document_type !== letta.documentType) return false;
  if (!ugualeNumero(archiviata.subtotal, letta.imponibile, 0.005) || !ugualeNumero(archiviata.tax_amount, letta.imposta, 0.005) || !ugualeNumero(archiviata.total, letta.totale, 0.005)) return false;
  for (const [campo, valore] of [
    ["client_company_name", letta.cliente.nome], ["client_fiscal_code", letta.cliente.cf],
    ["client_vat_number", letta.cliente.piva], ["client_address", letta.cliente.indirizzo],
    ["client_city", letta.cliente.citta], ["client_zip", letta.cliente.cap],
    ["client_country", letta.cliente.paese], ["client_pec", letta.cliente.pec], ["client_sdi_code", letta.cliente.sdi],
    ["due_date", letta.scadenza], ["payment_method", letta.modalitaPagamento], ["bank_iban", letta.iban],
  ] as const) {
    if (testo(archiviata[campo]) && testo(archiviata[campo]) !== testo(valore)) return false;
  }
  // Una testata senza righe non permette di provare la corrispondenza: niente collegamento automatico.
  if (righe.length !== letta.righe.length || righe.length === 0) return false;
  const ordinate = [...righe].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  return ordinate.every((r, i) => {
    const l = letta.righe[i];
    return testo(r.description) === testo(l.description) && testo(r.product_code) === testo(l.product_code) &&
      testo(r.unit) === testo(l.unit) && testo(r.tax_nature) === testo(l.tax_nature) &&
      ugualeNumero(r.quantity, l.quantity) && ugualeNumero(r.unit_price, l.unit_price) &&
      ugualeNumero(r.tax_rate, l.tax_rate) && ugualeNumero(r.line_net, l.line_net, 0.005);
  });
}

/** File nuovo e non sovrascrivibile, nella cartella privata dell'azienda. */
export async function archiviaOriginaleEmessa(client: OriginaliClient, companyId: string, originale: Uint8Array): Promise<string> {
  const percorso = `${companyId}/emesse-importate/${crypto.randomUUID()}.${originale[0] === 0x30 ? "xml.p7m" : "xml"}`;
  const { error } = await client.storage.from("fatture-xml").upload(percorso,
    new Blob([new Uint8Array(originale)], { type: originale[0] === 0x30 ? "application/pkcs7-mime" : "application/xml" }), { upsert: false });
  if (error) throw new Error("Impossibile conservare il file originale della fattura. Riprova: nessuna nuova fattura è stata registrata.");
  return `fatture-xml/${percorso}`;
}

/** Soltanto il file appena creato da questa richiesta, se il collegamento DB fallisce. */
export async function scartaOriginaleNonCollegato(client: OriginaliClient, riferimento: string): Promise<void> {
  try { await client.storage.from("fatture-xml").remove([riferimento.slice("fatture-xml/".length)]); }
  catch { /* Il recupero del file orfano non deve nascondere l'errore di salvataggio. */ }
}
