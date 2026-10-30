// src/hooks/useGeneraleSimulatore.ts
// Le ipotesi del simulatore prima dell'acquisto (generale_ipotesi) e «Diventa operazione»
// (generale_ipotesi_diventa_operazione). I conti stanno in src/lib/orders/generali/simulatore.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isModelloSimulato, leggiIpotesi, type Ipotesi, type ModelloSimulato } from "@/lib/orders/generali/simulatore";
import type { OperazioneDaCreare } from "@/lib/orders/generali/simulatoreOperazione";

// Tabella e RPC non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviSimulatore = {
  elenco: (companyId: string | undefined) => ["generale-ipotesi", companyId] as const,
};

export interface IpotesiSalvata {
  id: string;
  nome: string;
  modello: ModelloSimulato;
  ipotesi: Ipotesi;
  generaleId: string | null;
  creataIl: string;
  aggiornataIl: string;
}

const meseOggi = () => new Date().toISOString().slice(0, 7);

export function useIpotesiSalvate(abilitato = true) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: chiaviSimulatore.elenco(companyId),
    enabled: !!companyId && abilitato,
    staleTime: 30_000,
    queryFn: async (): Promise<IpotesiSalvata[]> => {
      const { data, error } = await db
        .from("generale_ipotesi")
        .select("id, nome, modello, dati, generale_id, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const oggi = meseOggi();
      return ((data ?? []) as Record<string, unknown>[])
        .filter((r) => isModelloSimulato(r.modello))
        .map((r) => ({
          id: r.id as string,
          nome: (r.nome as string) || "Ipotesi",
          modello: r.modello as ModelloSimulato,
          ipotesi: leggiIpotesi(r.dati, r.modello as ModelloSimulato, oggi),
          generaleId: (r.generale_id as string | null) ?? null,
          creataIl: r.created_at as string,
          aggiornataIl: r.updated_at as string,
        }));
    },
  });
}

/** Salva un'ipotesi: nuova senza id, altrimenti la aggiorna. Restituisce l'id. */
export function useSalvaIpotesi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string | null; nome: string; ipotesi: Ipotesi }): Promise<string> => {
      if (!companyId) throw new Error("Seleziona un’azienda prima di salvare.");
      const riga = { nome: v.nome.trim().slice(0, 200) || "Ipotesi", modello: v.ipotesi.modello, dati: v.ipotesi };
      if (v.id) {
        const { error } = await db.from("generale_ipotesi").update(riga).eq("id", v.id);
        if (error) throw error;
        return v.id;
      }
      const { data, error } = await db.from("generale_ipotesi").insert({ ...riga, company_id: companyId }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: chiaviSimulatore.elenco(companyId) }),
  });
}

export function useEliminaIpotesi() {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("generale_ipotesi").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: chiaviSimulatore.elenco(effectiveCompany?.id) }),
  });
}

/** Crea la commessa generale dall'ipotesi salvata, tutto in una transazione. Restituisce l'id della generale. */
export function useDiventaOperazione() {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { ipotesiId: string; operazione: OperazioneDaCreare }): Promise<string> => {
      const { data, error } = await db.rpc("generale_ipotesi_diventa_operazione", {
        p_ipotesi_id: v.ipotesiId,
        p_nome: v.operazione.nome,
        p_valore: v.operazione.valore,
        p_voci: v.operazione.voci,
        p_fonti: v.operazione.fonti,
        p_unita: v.operazione.unita.length ? v.operazione.unita : null,
      });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("L'operazione non risulta creata. Ricarica la pagina.");
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaviSimulatore.elenco(effectiveCompany?.id) });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
