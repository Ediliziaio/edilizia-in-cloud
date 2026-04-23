// MP02 — Tool carica_ddt (stub safe).
// Lo schema ddt_ricezione richiede purchase_order_id + warehouse_id esistenti:
// un flusso "foto DDT spot" dall'operaio non è sufficiente. Rinviato a MP3
// quando il flusso DDT-to-PO sarà completo.
// In MP02: persistiamo i dati estratti in cantiere_segnalazioni come
// tipo_problema='ddt_da_registrare' per tracciabilità + notifica al titolare.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";

export const caricaDDTDef: Omit<ToolDef, "handler"> = {
  name: "carica_ddt",
  description:
    "Registra un DDT (Documento di Trasporto) ricevuto al cantiere. In questa versione (MP02) " +
    "apre una segnalazione 'ddt_da_registrare' al titolare con i dati estratti dalla foto, " +
    "perché la registrazione completa richiede purchase_order già esistente. " +
    "Chiama dopo aver mostrato all'operaio i dati estratti e ricevuto conferma.",
  parameters: {
    type: "object",
    properties: {
      numero_ddt: { type: "string" },
      fornitore: { type: "string" },
      data_ddt: { type: "string" },
      righe: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descrizione: { type: "string" },
            quantita: { type: "number" },
            unita_misura: { type: "string" },
          },
          required: ["descrizione"],
        },
      },
      order_id: { type: "string" },
      cantiere_hint: { type: "string" },
      media_url: { type: "string" },
      note: { type: "string" },
    },
    required: ["numero_ddt", "fornitore"],
    additionalProperties: false,
  },
  requires_grants: ["ddt.write"],
};

interface Args {
  numero_ddt: string;
  fornitore: string;
  data_ddt?: string;
  righe?: Array<{ descrizione: string; quantita?: number; unita_misura?: string }>;
  order_id?: string;
  cantiere_hint?: string;
  media_url?: string;
  note?: string;
}

export async function caricaDDT(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult> {
  let orderId = args.order_id;
  if (!orderId && args.cantiere_hint) {
    const resolved = await resolveCantiere(ctx, args.cantiere_hint);
    if (resolved.cantiere_id) orderId = resolved.cantiere_id;
  }

  const righeStr = (args.righe ?? [])
    .map((r) => `- ${r.descrizione}${r.quantita ? ` x ${r.quantita}${r.unita_misura ? " " + r.unita_misura : ""}` : ""}`)
    .join("\n");

  const descrizione = [
    `DDT #${args.numero_ddt} di ${args.fornitore}` +
      (args.data_ddt ? ` del ${args.data_ddt}` : ""),
    righeStr ? `Righe:\n${righeStr}` : "",
    args.note ? `Note: ${args.note}` : "",
  ].filter(Boolean).join("\n");

  const { data: inserted, error } = await ctx.supabase
    .from("cantiere_segnalazioni")
    .insert({
      company_id: ctx.company_id,
      order_id: orderId ?? null,
      employee_id: ctx.employee_id,
      user_id: ctx.user_id,
      descrizione,
      urgenza: "media",
      tipo_problema: "ddt_da_registrare",
      photo_urls: args.media_url ? [args.media_url] : [],
      source: "whatsapp",
    })
    .select("id")
    .single();

  if (error) return errResult(error.message, "Errore salvando il DDT.");

  return okResult(
    { id: inserted.id, numero_ddt: args.numero_ddt },
    `📄 DDT #${args.numero_ddt} ricevuto. Segnalazione aperta al titolare per completare la registrazione sul gestionale.`,
  );
}
