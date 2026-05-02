import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrRichiesta, RichiestaStato } from "@/types/hr";
import { toast } from "sonner";

export type RichiestaWithProfilo = HrRichiesta & {
  profilo?: { id: string; nome: string; cognome: string; colore_avatar: string; reparto: string | null; mansione: string | null };
};

export function useRichieste(filters?: { stato?: RichiestaStato; meseAnno?: string }) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-richieste", companyId, filters],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("hr_richieste")
        .select("*, profilo:hr_profili!hr_richieste_profilo_id_fkey(id, nome, cognome, colore_avatar, reparto, mansione)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });

      if (filters?.stato) {
        q = q.eq("stato", filters.stato);
      }
      if (filters?.meseAnno) {
        const [y, m] = filters.meseAnno.split("-");
        const start = `${y}-${m}-01`;
        const endDate = new Date(Number(y), Number(m), 0);
        const end = `${y}-${m}-${String(endDate.getDate()).padStart(2, "0")}`;
        q = q.gte("data_inizio", start).lte("data_inizio", end);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as RichiestaWithProfilo[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useCreateRichiesta() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<HrRichiesta>) => {
      if (!companyId) throw new Error("companyId required");
      if (!data.profilo_id) throw new Error("Profilo HR obbligatorio");
      if (!data.data_inizio || !data.data_fine) throw new Error("Periodo richiesta obbligatorio");
      if (data.data_fine < data.data_inizio) {
        throw new Error("La data fine non può essere precedente alla data inizio");
      }
      if (data.ore_richieste != null && (!Number.isFinite(data.ore_richieste) || data.ore_richieste <= 0)) {
        throw new Error("Le ore richieste devono essere maggiori di zero");
      }

      const { data: profilo, error: profiloError } = await supabase
        .from("hr_profili")
        .select("id")
        .eq("company_id", companyId)
        .eq("id", data.profilo_id)
        .maybeSingle();

      if (profiloError) throw profiloError;
      if (!profilo) throw new Error("Profilo HR non valido per questa azienda");

      const { error } = await supabase.from("hr_richieste").insert({
        company_id: companyId,
        profilo_id: data.profilo_id!,
        tipo: data.tipo || "ferie",
        data_inizio: data.data_inizio!,
        data_fine: data.data_fine!,
        ore_richieste: data.ore_richieste ?? null,
        motivo: data.motivo ?? null,
        stato: "in_attesa",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-richieste"] });
      toast.success("Richiesta creata con successo");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}

export function useUpdateRichiestaStato() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stato, note_risposta }: { id: string; stato: RichiestaStato; note_risposta?: string }) => {
      if (!companyId) throw new Error("companyId required");
      const { error } = await supabase
        .from("hr_richieste")
        .update({
          stato,
          note_risposta: note_risposta ?? null,
          approvata_il: stato === "approvata" ? new Date().toISOString() : null,
        } as any)
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-richieste"] });
      toast.success("Stato richiesta aggiornato");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}
