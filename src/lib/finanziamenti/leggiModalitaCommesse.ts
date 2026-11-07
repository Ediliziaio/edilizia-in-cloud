import { supabase } from "@/integrations/supabase/client";
import { withClientTimeout } from "@/lib/query-timeout";
import type { ModalitaCostoFinanziaria } from "./costoFinanziaria";

type Commessa = { id: string; payment_type?: string | null; financing_cost?: number | null; financing_cost_mode?: ModalitaCostoFinanziaria | null };
/** Lettura compatibile durante l'aggiornamento: solo una colonna realmente assente
 * autorizza la regola storica. Errori di rete e permessi non diventano importi falsi. */
export async function leggiModalitaCommesse<T extends Commessa>(companyId: string, rows: T[]): Promise<Array<T & { financing_cost_mode?: ModalitaCostoFinanziaria | null }>> {
  const ids = [...new Set(rows.filter(r => r.financing_cost_mode === undefined && r.payment_type === "financing" && Number(r.financing_cost) > 0).map(r => r.id))];
  if (!ids.length) return rows;
  if (!companyId) throw new Error("Azienda non disponibile per verificare i finanziamenti.");
  const modes = new Map<string, ModalitaCostoFinanziaria | null>();
  for (let start = 0; start < ids.length; start += 200) {
    const batch = ids.slice(start, start + 200);
    const { data, error } = await withClientTimeout(
      supabase.from("orders").select("id,financing_cost_mode").eq("company_id", companyId).in("id", batch),
      "Verifica modalità finanziamenti", 12000,
    );
    if (error) {
      if ((error.code === "42703" || error.code === "PGRST204") && error.message.includes("financing_cost_mode")) return rows;
      throw new Error("Modalità dei finanziamenti non disponibili. Riprova.");
    }
    const raw: unknown = data;
    if (!Array.isArray(raw)) throw new Error("Risposta dei finanziamenti non valida.");
    for (const item of raw) {
      const row: unknown = item;
      if (!row || typeof row !== "object" || !("id" in row) || typeof row.id !== "string" || !("financing_cost_mode" in row)) throw new Error("Risposta dei finanziamenti non valida.");
      const mode = row.financing_cost_mode;
      if (mode !== null && mode !== "trattenuto" && mode !== "separato") throw new Error("Modalità del finanziamento da verificare.");
      modes.set(row.id, mode === "trattenuto" || mode === "separato" ? mode : null);
    }
    if (batch.some(id => !modes.has(id))) throw new Error("Una commessa finanziata non è più disponibile. Aggiorna l’elenco.");
  }
  return rows.map(row => modes.has(row.id) ? { ...row, financing_cost_mode: modes.get(row.id)! } : row);
}
