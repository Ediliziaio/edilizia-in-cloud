// Ore lavorate su un cantiere con la stessa regola dell'approvazione (campo_presenze_effettive):
// solo rapportini inviati o approvati; le presenze della squadra quando ci sono, altrimenti le ore
// di chi ha compilato. Bozze e rifiutati non contano.

import type { ToolCtx } from "./types.ts";

interface RigaOre {
  stato: string | null;
  ore_lavorate: number | string | null;
  ore_straordinario: number | string | null;
  presenze: unknown;
}

export function oreDelRapportino(r: RigaOre): number {
  if (Array.isArray(r.presenze) && r.presenze.length > 0) {
    return r.presenze.reduce((s: number, p: unknown) => {
      const ore = p && typeof p === "object" ? Number((p as { ore?: unknown }).ore) : 0;
      return s + (Number.isFinite(ore) ? ore : 0);
    }, 0);
  }
  return (Number(r.ore_lavorate) || 0) + (Number(r.ore_straordinario) || 0);
}

export async function oreCantiere(ctx: ToolCtx, orderId: string): Promise<number> {
  const { data } = await ctx.supabase
    .from("campo_rapportini")
    .select("stato, ore_lavorate, ore_straordinario, presenze")
    .eq("company_id", ctx.company_id)
    .eq("order_id", orderId)
    .in("stato", ["inviato", "approvato"]);
  return Math.round(((data ?? []) as RigaOre[]).reduce((s, r) => s + oreDelRapportino(r), 0) * 100) / 100;
}
