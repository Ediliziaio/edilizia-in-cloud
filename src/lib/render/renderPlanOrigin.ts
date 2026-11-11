import { supabase } from "@/integrations/supabase/client";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { renderSessionSource } from "./renderSources";

export interface RenderPlanOrigin {
  planId: string;
  roomName: string;
  version: number;
  projectTitle?: string;
  projectPath: string;
  roomId?: string;
  level?: string;
  scope?: string;
  projectAvailable?: boolean;
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
    roomId: plan.locale_id,
    ...(typeof plan.livello_id === "string" ? { level: plan.livello_id } : {}),
    ...(typeof plan.ambito === "string" ? { scope: plan.ambito } : {}),
    version: plan.versione,
    projectPath: `${percorsiPlanimetrie.pianta(plan.planimetria_id)}${query.size ? `?${query}` : ""}`,
  };
}

/** Legge soltanto le configurazioni delle sessioni visibili, raggruppate per tabella. */
export async function loadRenderPlanOrigins(rows: Array<{ id: string; render_type: string }>, companyId: string) {
  const origins: Record<string, RenderPlanOrigin> = {};
  if (!companyId || !rows.length) return origins;
  const groups = new Map<string, { column: string; snapshot: boolean; ids: Set<string> }>();
  for (const row of rows) {
    let source;
    try { source = renderSessionSource(row.render_type); } catch { continue; }
    const group = groups.get(source.table) ?? { column: source.configColumn, snapshot: source.technical || row.render_type === "pergole" || row.render_type === "piscine", ids: new Set<string>() };
    group.ids.add(row.id); groups.set(source.table, group);
  }
  await Promise.all([...groups].map(async ([table, group]) => {
    const ids = [...group.ids];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { data, error } = await supabase.from(table as never).select(`id,${group.column}${group.snapshot ? ",config_snapshot" : ""}`).eq("company_id", companyId).in("id", ids.slice(offset, offset + 100));
      if (error) throw error;
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const origin = renderPlanOrigin(record(row.config_snapshot) && Object.keys(record(row.config_snapshot)!).length ? row.config_snapshot : row[group.column]);
        if (origin) origins[String(row.id)] = origin;
      }
    }
  }));
  const planIds = [...new Set(Object.values(origins).map((origin) => origin.planId))];
  if (!planIds.length) return origins;
  const { data: plans, error: plansError } = await supabase.from("planimetrie" as never)
    .select("id,titolo").eq("company_id", companyId).is("deleted_at", null).in("id", planIds);
  if (plansError) throw plansError;
  const titles = new Map(((plans ?? []) as Array<{ id: string; titolo: string }>).map((plan) => [plan.id, plan.titolo]));
  for (const origin of Object.values(origins)) { origin.projectTitle = titles.get(origin.planId); origin.projectAvailable = titles.has(origin.planId); }
  return origins;
}
