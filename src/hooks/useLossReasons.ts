/**
 * Motivi di perdita per azienda — la tabella opportunity_loss_reasons
 * esisteva (con RLS) ma nessuno la leggeva: il select restava hardcoded a
 * 7 voci. Ora: i motivi dell'azienda si sommano ai default, e chi vende
 * puo' aggiungerne di suoi ("misure sbagliate", "condominio non delibera").
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface MotivoPerdita {
  value: string;
  label: string;
  /** true = voce di default del prodotto, non cancellabile. */
  predefinito: boolean;
}

export const MOTIVI_PERDITA_DEFAULT: MotivoPerdita[] = [
  { value: "prezzo", label: "Prezzo troppo alto", predefinito: true },
  { value: "concorrente", label: "Scelta concorrente", predefinito: true },
  { value: "budget_non_disponibile", label: "Budget non disponibile", predefinito: true },
  { value: "timing", label: "Timing non giusto", predefinito: true },
  { value: "prodotto_non_adatto", label: "Prodotto non adatto", predefinito: true },
  { value: "nessuna_risposta", label: "Nessuna risposta del cliente", predefinito: true },
  { value: "altro", label: "Altro", predefinito: true },
];

export function useLossReasons() {
  const companyId = useEffectiveCompanyId();

  const query = useQuery({
    queryKey: ["loss-reasons", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<MotivoPerdita[]> => {
      const { data, error } = await supabase
        .from("opportunity_loss_reasons")
        .select("id, label, position")
        .eq("company_id", companyId!)
        .order("position");
      if (error) return MOTIVI_PERDITA_DEFAULT;
      const custom: MotivoPerdita[] = (data ?? []).map((r) => ({
        // Il value custom e' l'etichetta stessa: lost_reason_category e' text
        // libero in DB, i report raggruppano per valore.
        value: r.label,
        label: r.label,
        predefinito: false,
      }));
      // Default prima, custom in coda; niente doppioni per etichetta.
      const etichette = new Set(MOTIVI_PERDITA_DEFAULT.map((m) => m.label.toLowerCase()));
      return [
        ...MOTIVI_PERDITA_DEFAULT,
        ...custom.filter((c) => !etichette.has(c.label.toLowerCase())),
      ];
    },
  });

  return { motivi: query.data ?? MOTIVI_PERDITA_DEFAULT, isLoading: query.isLoading };
}

export function useAddLossReason() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (label: string) => {
      const pulita = label.trim();
      if (!pulita) throw new Error("Scrivi il motivo prima di aggiungerlo");
      if (!companyId) throw new Error("Contesto azienda mancante");
      const { data: esistenti } = await supabase
        .from("opportunity_loss_reasons")
        .select("position")
        .eq("company_id", companyId)
        .order("position", { ascending: false })
        .limit(1);
      const posizione = ((esistenti?.[0]?.position as number | undefined) ?? 0) + 1;
      const { error } = await supabase
        .from("opportunity_loss_reasons")
        .insert({ company_id: companyId, label: pulita, position: posizione });
      if (error) throw error;
      return pulita;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loss-reasons", companyId] });
    },
  });
}
