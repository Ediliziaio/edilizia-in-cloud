import { supabase } from "@/integrations/supabase/client";
export interface RiepilogoVersioni { versioni: Array<{ versione: number | null; numero: number }>; totale: number; parziale: boolean }
export function riepilogaVersioni(versioni: unknown[], totale = versioni.length): RiepilogoVersioni {
  const conteggi = new Map<number | null, number>();
  for (const v of versioni) {
    const n = typeof v === "number" || typeof v === "string" ? Number(v) : NaN;
    const versione = Number.isInteger(n) && n > 0 ? n : null;
    conteggi.set(versione, (conteggi.get(versione) ?? 0) + 1);
  }
  return { versioni: [...conteggi].map(([versione, numero]) => ({ versione, numero })).sort((a, b) => (b.versione ?? 0) - (a.versione ?? 0)), totale, parziale: totale > versioni.length };
}

export async function caricaUtilizziPianta(companyId: string, id: string, conMisure: boolean) {
  const [render, misure] = await Promise.all([
    supabase.from("render_stanza_sessions" as never).select("planimetria:config->planimetria", { count: "exact" }).eq("company_id", companyId).eq("status", "completed").eq("config->planimetria->>planimetria_id", id).order("created_at", { ascending: false }).limit(200),
    conMisure ? supabase.from("computo_voci_misure" as never).select("planimetria_versione", { count: "exact" }).eq("company_id", companyId).eq("planimetria_id", id).order("id").limit(200) : Promise.resolve(null),
  ]);
  if (render.error || misure?.error) throw new Error("Le versioni usate da render e misure non sono disponibili.");
  const renderRows = (render.data ?? []) as unknown as Array<{ planimetria: { versione?: unknown } | null }>;
  const misureRows = (misure?.data ?? []) as unknown as Array<{ planimetria_versione: unknown }>;
  return { render: riepilogaVersioni(renderRows.map((r) => r.planimetria?.versione), render.count ?? renderRows.length), misure: misure ? riepilogaVersioni(misureRows.map((r) => r.planimetria_versione), misure.count ?? misureRows.length) : null };
}
