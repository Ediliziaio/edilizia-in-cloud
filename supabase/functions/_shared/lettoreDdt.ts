import { buildStableAiIdempotencyKey } from "./directAiLedger.ts";

export const PROMPT_LETTORE_DDT = `Sei un assistente esperto di logistica edile che legge i Documenti Di Trasporto (DDT) italiani.
Estrai i dati in JSON STRUTTURATO. Non inventare: se un dato non è leggibile metti null.

REGOLE:
- "quantity": numero (usa il punto come separatore decimale). Se non c'è, null.
- "unit": unità di misura (es. "pz", "mq", "ml", "kg", "cf", "bancale"). Se assente o illeggibile, null: non dedurre i pezzi da peso, confezioni o misure.
- "unit_price": prezzo unitario in euro come numero (punto decimale, niente simbolo €). null se il DDT non riporta prezzi (spesso i DDT non hanno prezzi).
- "code": codice articolo/fornitore se presente, altrimenti null.
- "barcode": codice a barre/EAN se presente, altrimenti null.
- "ddt_date": formato ISO "YYYY-MM-DD".
- "document_type": "ddt" per bolla/documento di trasporto, "scontrino" per scontrino o ricevuta di cassa, "fattura" per fattura, altrimenti "altro".
- "total_amount": totale del documento in euro come numero, null se non c'è (le bolle spesso non hanno prezzi).
- "delivery_address": indirizzo di consegna o destinazione merce, null se assente.
- "order_reference": numero d'ordine citato (es. «Rif. Vs ordine 2025/128»), null se assente.
- Includi UNA riga per ogni articolo elencato nel documento. Ignora righe di intestazione, totali, note di trasporto.

OUTPUT JSON ESATTO (no markdown):
{
  "document_type": "ddt" | "scontrino" | "fattura" | "altro",
  "total_amount": "number | null",
  "delivery_address": "string | null",
  "order_reference": "string | null",
  "supplier_name": "string | null",
  "supplier_vat": "string | null (P.IVA fornitore)",
  "ddt_number": "string | null",
  "ddt_date": "string | null (YYYY-MM-DD)",
  "items": [
    { "description": "string", "quantity": number|null, "unit": "string|null", "unit_price": number|null, "code": "string|null", "barcode": "string|null" }
  ],
  "confidenza_estrazione": "alta" | "media" | "bassa"
}`;

/** Foto e PDF hanno contratti diversi nel provider: i PDF non sono image_url. */
export function parteFileDdt(input: {
  base64?: string;
  url?: string;
  mime?: string;
  fileName?: string;
}) {
  const mime = (
    input.mime ||
    (/\.pdf(?:$|[?#])/i.test(input.fileName || input.url || "")
      ? "application/pdf"
      : "image/jpeg")
  )
    .split(";")[0]
    .trim()
    .toLowerCase();
  const source = input.base64
    ? `data:${mime};base64,${input.base64}`
    : input.url;
  if (!source) throw new Error("Documento DDT mancante");
  if (mime === "application/pdf")
    return {
      type: "file" as const,
      file: { filename: input.fileName || "documento.pdf", file_data: source },
    };
  return {
    type: "image_url" as const,
    image_url: { url: source, detail: "high" as const },
  };
}

/** Anche due foto con la stessa intestazione devono avere impronte differenti. */
export function improntaDdt(base64: string): Promise<string> {
  return buildStableAiIdempotencyKey("ddt_file", [base64]);
}
