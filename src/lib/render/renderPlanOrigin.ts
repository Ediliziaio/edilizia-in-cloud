import { supabase } from "@/integrations/supabase/client";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";

export interface RenderPlanOrigin {
  planId: string;
  roomName: string;
  version: number;
  projectTitle?: string;
  projectPath: string;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Legge il riferimento salvato con QUESTO render, senza dedurlo dalla foto. */
export function renderPlanOrigin(config: unknown): RenderPlanOrigin | null {
  const cfg = record(config);
  const plan = record(cfg?.planimetria);
  if (!plan || typeof plan.planimetria_id !== "string" || !/^[\w-]+$/.test(plan.planimetria_id)
    || typeof plan.locale_id !== "string" || !plan.locale_id.trim()
    || typeof plan.versione !== "number" || !Number.isInteger(plan.versione) || plan.versione < 1) return null;
  const name = typeof plan.locale_nome === "string" ? plan.locale_nome.trim() : "";
  const type = typeof cfg?.tipo_stanza === "string" ? cfg.tipo_stanza.replace(/_/g, " ").trim() : "";
  const query = new URLSearchParams();
  if (typeof plan.livello_id === "string") query.set("livello", plan.livello_id);
  const scope = typeof plan.materiali_ambito === "string" ? plan.materiali_ambito : plan.ambito;
  if (typeof scope === "string") query.set("ambito", scope);
  return {
    planId: plan.planimetria_id,
    roomName: name || type || "Stanza",
    version: plan.versione,
    projectPath: `${percorsiPlanimetrie.pianta(plan.planimetria_id)}${query.size ? `?${query}` : ""}`,
  };
}

/** Una lettura per i render stanza, una per i titoli; nessuna richiesta per gli altri moduli. */
export async function loadRenderPlanOrigins(rows: Array<{ id: string; render_type: string }>, companyId: string) {
  const ids = [...new Set(rows.filter((row) => row.render_type === "stanza").map((row) => row.id))];
  const origins: Record<string, RenderPlanOrigin> = {};
  if (!companyId || !ids.length) return origins;
  const { data, error } = await supabase.from("render_stanza_sessions")
    .select("id,config").eq("company_id", companyId).in("id", ids);
  if (error) throw error;
  for (const row of data ?? []) {
    const origin = renderPlanOrigin(row.config);
    if (origin) origins[row.id] = origin;
  }
  const planIds = [...new Set(Object.values(origins).map((origin) => origin.planId))];
  if (!planIds.length) return origins;
  const { data: plans, error: plansError } = await supabase.from("planimetrie" as never)
    .select("id,titolo").eq("company_id", companyId).is("deleted_at", null).in("id", planIds);
  if (plansError) throw plansError;
  const titles = new Map(((plans ?? []) as Array<{ id: string; titolo: string }>).map((plan) => [plan.id, plan.titolo]));
  for (const origin of Object.values(origins)) origin.projectTitle = titles.get(origin.planId);
  return origins;
}
