import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { VocePrevistaFase } from "@/lib/orders/economiaFasi";

/**
 * Voci previste delle lavorazioni (order_work_phase_voci, 29/10/2026): le voci
 * del preventivo o del computo da cui è nata ogni fase, con quantità, unità,
 * tariffa del listino manodopera e costo unitario senza IVA. Sono il costo
 * previsto della fase dove nessuna assegnazione ne ha uno, e la quantità che il
 * dialog della ditta propone. Si leggono solo col permesso sui costi.
 */
export interface VocePrevista extends VocePrevistaFase {
  id: string;
  position: number;
  descrizione: string;
  unita: string | null;
  importo: number | null;
  tariffa_id: string | null;
  origine: "preventivo" | "computo_rst" | "computo" | "listino";
  /** La sottofase che questa voce misura (31/10/2026), se la fase è divisa per voci. */
  subphase_id: string | null;
  origine_codice: string | null;
}

// La tabella è nuova: non è ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaveVociPreviste = (companyId: string | undefined, orderId: string | null | undefined) =>
  ["voci-previste-fasi", companyId, orderId] as const;

export function useVociPrevisteFasi(orderId: string | null | undefined, abilitato: boolean) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: chiaveVociPreviste(companyId, orderId),
    enabled: abilitato && !!orderId && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<VocePrevista[]> => {
      const { data, error } = await db
        .from("order_work_phase_voci")
        .select("id, phase_id, position, descrizione, unita, quantita, costo_manodopera, costo_materiali, importo, tariffa_id, origine, origine_codice, subphase_id")
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((v) => ({
        id: v.id as string,
        phase_id: v.phase_id as string,
        position: Number(v.position) || 0,
        descrizione: (v.descrizione as string) ?? "",
        unita: (v.unita as string | null) ?? null,
        quantita: Number(v.quantita) || 0,
        costo_manodopera: Number(v.costo_manodopera) || 0,
        costo_materiali: Number(v.costo_materiali) || 0,
        importo: v.importo == null ? null : Number(v.importo),
        tariffa_id: (v.tariffa_id as string | null) ?? null,
        origine: v.origine as VocePrevista["origine"],
        origine_codice: (v.origine_codice as string | null) ?? null,
        subphase_id: (v.subphase_id as string | null) ?? null,
      }));
    },
  });
}
