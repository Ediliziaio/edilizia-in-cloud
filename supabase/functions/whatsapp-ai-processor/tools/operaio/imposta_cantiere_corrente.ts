// MP02 — Setta whatsapp_sessions.current_cantiere_id per il from_phone corrente.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";

export const impostaCantiereCorrenteDef: Omit<ToolDef, "handler"> = {
  name: "imposta_cantiere_corrente",
  description:
    "Imposta il cantiere corrente nella sessione dell'operaio (valido per le prossime 4 ore). " +
    "Utile all'inizio della giornata quando l'operaio dice 'oggi sto a cantiere X'.",
  parameters: {
    type: "object",
    properties: {
      order_id: { type: "string" },
      cantiere_hint: { type: "string" },
    },
    additionalProperties: false,
  },
  requires_grants: ["cantieri.read_assigned"],
};

export async function impostaCantiereCorrente(
  ctx: ToolCtx,
  args: { order_id?: string; cantiere_hint?: string },
): Promise<ToolResult<{ order_id: string; cantiere_nome: string }>> {
  if (!ctx.sessionId) {
    return errResult("no_session", "Sessione non trovata, riprova tra poco.");
  }

  let orderId = args.order_id;
  let nome = "";

  if (!orderId) {
    const resolved = await resolveCantiere(ctx, args.cantiere_hint);
    if (!resolved.cantiere_id) {
      return errResult("cantiere_ambiguous", resolved.ask_user ?? "Quale cantiere?");
    }
    orderId = resolved.cantiere_id;
    nome = resolved.cantiere_nome ?? "";
  } else {
    const { data: c } = await ctx.supabase
      .from("orders")
      .select("description, order_code")
      .eq("id", orderId)
      .eq("company_id", ctx.company_id)
      .maybeSingle();
    nome = c?.description || c?.order_code || "cantiere";
  }

  await ctx.supabase
    .from("whatsapp_sessions")
    .update({
      current_cantiere_id: orderId,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", ctx.sessionId);

  return okResult(
    { order_id: orderId, cantiere_nome: nome },
    `✅ Cantiere corrente: ${nome}. Le prossime azioni si riferiscono a questo cantiere.`,
  );
}
