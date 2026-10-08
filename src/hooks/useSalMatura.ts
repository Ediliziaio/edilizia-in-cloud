// src/hooks/useSalMatura.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { salMaturaValido, type SalMatura } from "@/lib/orders/salMaturazione";

// La tabella non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Quando matura la rata di un SAL per questa azienda. Senza scelta (o se la lettura fallisce): «emesso», come di partenza. */
export function useSalMatura(companyId: string | undefined): SalMatura {
  const { data } = useQuery({
    queryKey: ["sal-matura", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<SalMatura> => {
      try {
        // «*»: la colonna c'è solo dopo la seconda migrazione dei pagamenti, e la lettura non deve fallire senza.
        const { data: riga, error } = await db.from("company_pagamenti_settings").select("*").eq("company_id", companyId!).maybeSingle();
        if (error) throw error;
        return salMaturaValido(riga?.sal_matura_quando);
      } catch {
        return "emesso";
      }
    },
  });
  return data ?? "emesso";
}
