// src/hooks/useSalMatura.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { salMaturaValido, type SalMatura } from "@/lib/orders/salMaturazione";

// La tabella non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Missing settings row uses the DB default; a failed/unresolved read never implies maturity. */
export function useSalMatura(companyId: string | undefined): SalMatura | null {
  const { data, isError } = useQuery({
    queryKey: ["sal-matura", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SalMatura> => {
      const { data: riga, error } = await db.from("company_pagamenti_settings").select("sal_matura_quando").eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      if(riga && riga.sal_matura_quando!=="emesso" && riga.sal_matura_quando!=="approvato")throw new Error("Regola SAL aziendale non valida.");
      return salMaturaValido(riga?.sal_matura_quando);
    },
  });
  return !isError && (data === "emesso" || data === "approvato") ? data : null;
}
