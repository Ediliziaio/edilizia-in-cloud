import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/personale/readAllPages";
import { riassumiStorni, type StornoRiga } from "@/lib/fatturazione/notaCreditoStorno";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Quali fatture storna ogni nota di credito ricevuta dell'azienda, e quanto riceve ogni fattura. */
export function useStorniNoteCredito(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["note-credito-storni", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const righe = await readAllPages<StornoRiga>((from, to) =>
        db.from("note_credito_storni")
          .select("nota_id, fattura_id, importo, credito_residuo")
          .eq("company_id", companyId!)
          .order("id")
          .range(from, to),
      );
      return riassumiStorni(righe);
    },
  });
}
