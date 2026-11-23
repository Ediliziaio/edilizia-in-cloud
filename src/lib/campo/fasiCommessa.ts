import { supabase } from "@/integrations/supabase/client";

/**
 * Le fasi della commessa per l'area campo: UNA lettura per la chiave ["campo-fasi-commessa", orderId].
 *
 * La usano il modulo del rapportino e la pagina del lavoro con la stessa chiave di cache: se le due letture
 * chiedono colonne diverse o costruiscono oggetti diversi, la cache dell'una avvelena l'altra. Per questo sta qui.
 * 23/11/2026: con `end_date`, per dire i ritardi anche nella «Fase attuale».
 */
export interface FaseCommessaCampo {
  id: string;
  name: string;
  status: "da_iniziare" | "in_corso" | "completata";
  percentuale: number;
  end_date: string | null;
}

export const chiaveFasiCommessa = (orderId: string | undefined) => ["campo-fasi-commessa", orderId] as const;

export async function leggiFasiCommessa(orderId: string): Promise<FaseCommessaCampo[]> {
  // order_work_phases.percentuale non è nei tipi generati → cast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("order_work_phases")
    .select("id, name, status, percentuale, end_date")
    .eq("order_id", orderId)
    .order("position", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? "",
    status: (p.status as FaseCommessaCampo["status"]) ?? "da_iniziare",
    percentuale: Number(p.percentuale) || 0,
    end_date: (p.end_date as string | null) ?? null,
  }));
}
