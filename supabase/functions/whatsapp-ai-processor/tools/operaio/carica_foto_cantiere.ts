// MP02 — Carica foto cantiere (Storage già popolato dal media handler).
// Inserisce riga in foto_cantiere con url + tags + riferimento all'operaio.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";

export const caricaFotoCantiereDef: Omit<ToolDef, "handler"> = {
  name: "carica_foto_cantiere",
  description:
    "Associa una foto di cantiere (già caricata su Storage) al cantiere con tag e descrizione.",
  parameters: {
    type: "object",
    properties: {
      media_url: { type: "string", description: "URL pubblico Storage della foto (obbligatorio)" },
      order_id: { type: "string" },
      cantiere_hint: { type: "string" },
      descrizione: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["media_url"],
    additionalProperties: false,
  },
  requires_grants: ["foto.write"],
};

interface Args {
  media_url: string;
  order_id?: string;
  cantiere_hint?: string;
  descrizione?: string;
  tags?: string[];
}

export async function caricaFotoCantiere(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult<{ id: string }>> {
  if (!ctx.user_id) return errResult("no_user_id", "Non riesco a identificarti.");

  if (!args.media_url) {
    return errResult("no_media", "Manca la foto. Mandamela e poi riprova.");
  }

  let orderId = args.order_id;
  if (!orderId) {
    const resolved = await resolveCantiere(ctx, args.cantiere_hint);
    if (!resolved.cantiere_id) {
      return errResult("cantiere_ambiguous", resolved.ask_user ?? "A quale cantiere?");
    }
    orderId = resolved.cantiere_id;
  }

  const { data: inserted, error } = await ctx.supabase
    .from("foto_cantiere")
    .insert({
      company_id: ctx.company_id,
      order_id: orderId,
      user_id: ctx.user_id,
      url: args.media_url,
      descrizione: args.descrizione ?? null,
      tags: args.tags ?? [],
      source: "whatsapp",
    })
    .select("id")
    .single();

  if (error) return errResult(error.message, "Errore salvando la foto.");

  return okResult({ id: inserted.id }, "✅ Foto salvata sul cantiere.");
}
