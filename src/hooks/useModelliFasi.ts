// src/hooks/useModelliFasi.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { assemblaModelli, type ModelloFasi, type ModelloPerServer, type PayloadModello } from "@/lib/orders/modelliFasi";

// Le tabelle non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ModelliAzienda {
  modelli: ModelloFasi[];
  /** I modelli di partenza sono già stati fatti suoi dall'azienda. */
  inizializzati: boolean;
  /** La lettura è andata a buon fine (le tabelle ci sono): senza, si offrono i modelli di partenza e non si tenta nulla. */
  disponibile: boolean;
}
const NESSUNO: ModelliAzienda = { modelli: [], inizializzati: false, disponibile: false };

export const chiaveModelliFasi = (companyId: string | undefined) => ["modelli-fasi", companyId] as const;

/** Messaggi in italiano per gli errori che l'utente può causare. */
export function messaggioModello(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "23505") return "Esiste già un modello con questo nome.";
  if (err?.code === "42501") return "Non hai il permesso di modificare i modelli di fasi.";
  return err?.message || "Operazione non riuscita. Riprova.";
}

/** I modelli di fasi dell'azienda. */
export function useModelliFasi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveModelliFasi(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ModelliAzienda> => {
      // Una lettura fallita deve restare distinguibile dall'assenza di modelli.
        const [m, f, s, impostazioni] = await Promise.all([
          db.from("work_phase_templates").select("id, name, hint, position").eq("company_id", companyId!).order("position"),
          db.from("work_phase_template_phases").select("id, template_id, name, position").eq("company_id", companyId!).order("position"),
          db.from("work_phase_template_subphases").select("id, template_phase_id, name, position, peso").eq("company_id", companyId!).order("position"),
          db.from("company_fasi_settings").select("modelli_inizializzati").eq("company_id", companyId!).maybeSingle(),
        ]);
        for (const r of [m, f, s, impostazioni]) if (r.error) throw r.error;
        return {
          modelli: assemblaModelli(m.data ?? [], f.data ?? [], s.data ?? []),
          inizializzati: Boolean(impostazioni.data?.modelli_inizializzati),
          disponibile: true,
        };
    },
  });

  const riparti = () => qc.invalidateQueries({ queryKey: chiaveModelliFasi(companyId) });
  const onError = (e: unknown) => toast.error(messaggioModello(e));

  const salva = useMutation({
    mutationFn: async (modello: PayloadModello): Promise<string> => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data, error } = await db.rpc("salva_modello_fasi", { p_company_id: companyId, p_modello: modello });
      if (error) throw error;
      return data as string;
    },
    onSuccess: riparti,
    onError,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await db.rpc("elimina_modello_fasi", { p_company_id: companyId, p_id: id });
      if (error) throw error;
    },
    onSuccess: riparti,
    onError,
  });

  // I modelli di partenza diventano dell'azienda (una volta), o si rimettono quelli che mancano.
  const inizializza = useMutation({
    mutationFn: async ({ modelli, soloMancanti }: { modelli: ModelloPerServer[]; soloMancanti: boolean }): Promise<number> => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data, error } = await db.rpc("inizializza_modelli_fasi", {
        p_company_id: companyId, p_modelli: modelli, p_solo_mancanti: soloMancanti,
      });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: riparti,
    onError,
  });

  return {
    modelli: query.data?.modelli ?? NESSUNO.modelli,
    inizializzati: query.data?.inizializzati ?? false,
    disponibile: query.data?.disponibile ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    salva, elimina, inizializza,
  };
}
