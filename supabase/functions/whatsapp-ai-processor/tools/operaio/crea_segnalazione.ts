// MP02 — Segnalazione problema cantiere con urgenza. Urgenza alta → notify titolare.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";

export const creaSegnalazioneDef: Omit<ToolDef, "handler"> = {
  name: "crea_segnalazione",
  description:
    "Crea una segnalazione di problema/anomalia su un cantiere. Se urgenza='alta' il titolare riceve un alert.",
  parameters: {
    type: "object",
    properties: {
      descrizione: { type: "string" },
      urgenza: { type: "string", enum: ["alta", "media", "bassa"] },
      tipo_problema: { type: "string", description: "Categoria: sicurezza, qualità, tempistica, materiali, altro" },
      order_id: { type: "string" },
      cantiere_hint: { type: "string" },
      photo_urls: { type: "array", items: { type: "string" } },
    },
    required: ["descrizione"],
    additionalProperties: false,
  },
  requires_grants: ["segnalazione.write"],
};

interface Args {
  descrizione: string;
  urgenza?: "alta" | "media" | "bassa";
  tipo_problema?: string;
  order_id?: string;
  cantiere_hint?: string;
  photo_urls?: string[];
}

export async function creaSegnalazione(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult<{ id: string; urgenza: string }>> {
  if (!args.descrizione || args.descrizione.trim().length < 3) {
    return errResult(
      "descrizione_troppo_breve",
      "Dimmi meglio cosa succede (3+ caratteri).",
    );
  }

  let orderId = args.order_id;
  if (!orderId && args.cantiere_hint) {
    const resolved = await resolveCantiere(ctx, args.cantiere_hint);
    if (resolved.cantiere_id) orderId = resolved.cantiere_id;
  }
  // Non è obbligatorio avere un order_id: segnalazione generale possibile.

  const urgenza = args.urgenza ?? "media";

  const { data: inserted, error } = await ctx.supabase
    .from("cantiere_segnalazioni")
    .insert({
      company_id: ctx.company_id,
      order_id: orderId ?? null,
      employee_id: ctx.employee_id,
      user_id: ctx.user_id,
      descrizione: args.descrizione,
      urgenza,
      tipo_problema: args.tipo_problema ?? null,
      // La foto mandata con il messaggio (il modello non ne conosce il link).
      photo_urls: args.photo_urls?.length
        ? args.photo_urls
        : ctx.mediaCorrente?.tipo === "image" ? [ctx.mediaCorrente.url] : [],
      source: "whatsapp",
    })
    .select("id")
    .single();

  if (error) return errResult(error.message, "Errore creando la segnalazione.");

  const emoji = urgenza === "alta" ? "🔴" : urgenza === "media" ? "🟠" : "🟡";
  const msg = `${emoji} Segnalazione registrata (${urgenza})` +
    (urgenza === "alta" ? ". Il titolare riceverà un alert." : ".");

  return okResult({ id: inserted.id, urgenza }, msg);
}
