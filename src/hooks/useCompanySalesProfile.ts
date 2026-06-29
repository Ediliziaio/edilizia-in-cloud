/**
 * useCompanySalesProfile — legge/salva il "Profilo vendita azienda"
 * (company_sales_profile): le risposte strategiche riusate dall'AI per generare
 * i testi dei template preventivo, su tutti i moduli. Una riga per azienda.
 *
 * types.ts non conosce la tabella nuova → accesso via cast (convenzione repo).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface CompanySalesProfile {
  attivita: string;
  cliente_tipo: string; // 'privato' | 'condominio' | 'azienda'
  problema: string;
  usp: string;
  prove: string;
  offerta: string;
  obiezioni: string;
  voce: string;
  vietati: string;
}

export const EMPTY_SALES_PROFILE: CompanySalesProfile = {
  attivita: "",
  cliente_tipo: "privato",
  problema: "",
  usp: "",
  prove: "",
  offerta: "",
  obiezioni: "",
  voce: "",
  vietati: "",
};

/** True se il profilo ha almeno un campo significativo compilato. */
export function isSalesProfileFilled(p: CompanySalesProfile): boolean {
  return [p.attivita, p.usp, p.prove, p.offerta, p.problema, p.obiezioni].some((v) => (v ?? "").trim().length > 0);
}

export function useCompanySalesProfile() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["company-sales-profile", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CompanySalesProfile> => {
      const { data, error } = await supabase
        .from("company_sales_profile" as never)
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = (data ?? null) as Record<string, string | null> | null;
      if (!row) return { ...EMPTY_SALES_PROFILE };
      return {
        attivita: row.attivita ?? "",
        cliente_tipo: row.cliente_tipo ?? "privato",
        problema: row.problema ?? "",
        usp: row.usp ?? "",
        prove: row.prove ?? "",
        offerta: row.offerta ?? "",
        obiezioni: row.obiezioni ?? "",
        voce: row.voce ?? "",
        vietati: row.vietati ?? "",
      };
    },
  });

  const save = useMutation({
    mutationFn: async (p: CompanySalesProfile) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const payload = {
        company_id: companyId,
        ...p,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("company_sales_profile" as never)
        .upsert(payload as never, { onConflict: "company_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-sales-profile", companyId] });
    },
  });

  return {
    profile: query.data ?? EMPTY_SALES_PROFILE,
    isLoading: query.isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
  };
}
