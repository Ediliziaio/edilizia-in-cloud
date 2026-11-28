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

/** `conteggio: false` salta il count esatto: chi legge solo le righe non lo usa e ogni conteggio costa una lettura in più. */
export function queryFontiScadenzario(companyId: string, opzioni: { conteggio?: boolean } = {}) {
  return supabase.rpc("scadenzario_fonti", { p_company_id: companyId }, opzioni.conteggio === false ? undefined : { count: "exact" });
}

/** Lista e CSV devono applicare gli stessi filtri, anche alle fonti senza data. */
export function filtraScadenzario<Q>(query: Q, f: ScadenzarioFilters): Q {
  // Mantiene il tipo della select (che può includere relazioni diverse).
  interface Filtrabile {
    eq(k: string, v: string): Filtrabile; neq(k: string, v: string): Filtrabile;
    in(k: string, v: string[]): Filtrabile; is(k: string, v: null): Filtrabile;
    lt(k: string, v: string): Filtrabile; gte(k: string, v: number): Filtrabile; lte(k: string, v: number): Filtrabile; ilike(k: string, v: string): Filtrabile;
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
  if (f.importoMin != null && Number.isFinite(f.importoMin)) q = q.gte("amount", f.importoMin);
  if (f.importoMax != null && Number.isFinite(f.importoMax)) q = q.lte("amount", f.importoMax);
  if (f.soloConNote) q = q.neq("notes", "");
  if (f.soloConDocumento) q = q.or("invoice_id.not.is.null,cost_id.not.is.null");
  if (f.supplierId) q = q.eq("supplier_id", f.supplierId);
  if (f.orderId) q = f.orderCostIds?.length
    ? q.or(`order_id.eq.${f.orderId},cost_id.in.(${f.orderCostIds.join(",")})`)
    : q.eq("order_id", f.orderId);
  return q as unknown as Q;
}

/** Tetto agli id nell'URL: se i costi ripartiti sono di più si usano i primi 150 (per id) e l'interfaccia avvisa che l'elenco è parziale. */
export const MAX_COSTI_RIPARTITI = 150;

/** I costi ripartiti il cui piano (allocations) comprende la commessa: le loro rate non hanno order_id = commessa. */
export async function costiDellaCommessa(companyId: string, orderId: string): Promise<{ ids: string[]; troncato: boolean }> {
  const { data, error } = await supabase.from("company_costs").select("id").eq("company_id", companyId)
    .contains("allocations", JSON.stringify([{ order_id: orderId }]) as never).order("id").limit(MAX_COSTI_RIPARTITI + 1);
  if (error) throw error;
  const ids = (data ?? []).map(r => r.id);
  return { ids: ids.slice(0, MAX_COSTI_RIPARTITI), troncato: ids.length > MAX_COSTI_RIPARTITI };
}
