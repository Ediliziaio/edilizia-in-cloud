import { supabase } from "@/integrations/supabase/client";
import { filtroMetodo } from "./metodoScadenza";
import type { Scadenza, ScadenzarioFilters } from "@/hooks/useScadenzario";

export const scadenzaDaFonte = (s: Pick<Scadenza, "auto_source">) =>
  s.auto_source === "fonte_costo" || s.auto_source === "fonte_commessa";

export function linkFonteScadenza(s: Pick<Scadenza, "auto_source" | "cost_id" | "order_id">) {
  if (s.auto_source === "fonte_costo" && s.cost_id) return `/azienda/costi?costo=${encodeURIComponent(s.cost_id)}`;
  if (s.auto_source === "fonte_commessa" && s.order_id) return `/azienda/ordini/${s.order_id}`;
  return null;
}

export function queryFontiScadenzario(companyId: string) {
  return supabase.rpc("scadenzario_fonti", { p_company_id: companyId }, { count: "exact" });
}

/** Lista e CSV devono applicare gli stessi filtri, anche alle fonti senza data. */
export function filtraScadenzario<Q>(query: Q, f: ScadenzarioFilters): Q {
  // Mantiene il tipo della select (che può includere relazioni diverse).
  interface Filtrabile {
    eq(k: string, v: string): Filtrabile; neq(k: string, v: string): Filtrabile;
    in(k: string, v: string[]): Filtrabile; is(k: string, v: null): Filtrabile;
    lt(k: string, v: string): Filtrabile; ilike(k: string, v: string): Filtrabile;
    or(v: string): Filtrabile;
  }
  let q = query as unknown as Filtrabile;
  if (f.search?.trim()) q = q.ilike("description", `%${f.search.trim()}%`);
  if (f.direction) q = q.eq("direction", f.direction);
  q = f.status ? q.eq("status", f.status) : q.neq("status", "annullata");
  if (f.soloAperte || f.soloScadute || f.soloSenzaData) q = q.in("status", ["da_pagare", "parziale"]);
  if (f.soloSenzaData) q = q.is("due_date", null);
  else {
    const dates = [f.dateFrom ? `due_date.gte.${f.dateFrom}` : "", f.dateTo ? `due_date.lte.${f.dateTo}` : ""].filter(Boolean);
    const groups: string[] = [];
    if (dates.length) groups.push(f.includiSenzaData ? `or(and(${dates.join(",")}),due_date.is.null)` : `and(${dates.join(",")})`);
    if (f.metodo) groups.push(`or(${filtroMetodo(f.metodo)})`);
    if (groups.length) q = q.or(`and(${groups.join(",")})`);
  }
  if (f.soloSenzaData && f.metodo) q = q.or(filtroMetodo(f.metodo));
  if (f.soloScadute) q = q.lt("due_date", new Date().toLocaleDateString("en-CA"));
  if (f.tipo) q = q.eq("tipo", f.tipo);
  return q as unknown as Q;
}
