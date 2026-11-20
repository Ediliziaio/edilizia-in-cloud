import { supabase } from "@/integrations/supabase/client";
import type { Scadenza } from "@/hooks/useScadenzario";
import { quoteDelCosto } from "@/lib/fatturazione/ripartizioneFattura";
import { readAllPages } from "@/lib/personale/readAllPages";
import { notaLeggibile } from "./dettaglioScadenza";

export const commesseScadenza = (s: Pick<Scadenza, "commesse" | "orders">) =>
  s.commesse?.map(c => c.codice).join(" · ") || s.orders?.order_code || "";

/** Le commesse del costo valgono anche sulle rate che non hanno order_id. Mai una richiesta per riga. */
export async function completaCommesseScadenze(companyId: string, righe: Scadenza[]): Promise<Scadenza[]> {
  const codici = new Map(righe.flatMap(s => s.order_id && s.orders?.order_code ? [[s.order_id, s.orders.order_code] as const] : []));
  const ids = (s: Scadenza) => {
    const quote = quoteDelCosto(s.company_costs);
    return [...new Set(quote.length ? quote.map(q => q.order_id) : s.order_id ? [s.order_id] : [])];
  };
  const mancanti = [...new Set(righe.flatMap(ids))].filter(id => !codici.has(id));
  for (let i = 0; i < mancanti.length; i += 100) {
    const ordini = await readAllPages((from, to) => supabase.from("orders").select("id, order_code")
      .eq("company_id", companyId).in("id", mancanti.slice(i, i + 100)).order("id").range(from, to));
    for (const o of ordini) if (o.order_code) codici.set(o.id, o.order_code);
  }
  return righe.map(s => ({ ...s, commesse: ids(s).map(id => ({ id, codice: codici.get(id) || "Commessa non disponibile" })) }));
}

/** Note della scadenza, del costo e delle fatture ricevute, incluse le fatture che condividono il costo. */
export async function noteFattureScadenze(companyId: string, righe: Scadenza[]): Promise<Map<string, string>> {
  const costi = [...new Set(righe.map(s => s.cost_id).filter((id): id is string => !!id))];
  const perCosto = new Map<string, string[]>();
  for (let i = 0; i < costi.length; i += 100) {
    const ricevute = await readAllPages((from, to) => supabase.from("fatture_ricevute").select("id, company_cost_id, numero_fattura, note_interne")
      .eq("company_id", companyId).in("company_cost_id", costi.slice(i, i + 100)).order("id").range(from, to));
    for (const f of ricevute) {
      const nota = notaLeggibile(f.note_interne);
      if (f.company_cost_id && nota) perCosto.set(f.company_cost_id, [...(perCosto.get(f.company_cost_id) ?? []), `Fatt. ${f.numero_fattura || "senza numero"}: ${nota}`]);
    }
  }
  return new Map(righe.map(s => [s.id, [...new Set([notaLeggibile(s.notes), notaLeggibile(s.company_costs?.notes), ...(perCosto.get(s.cost_id ?? "") ?? [])].filter(Boolean))].join(" | ")]));
}
