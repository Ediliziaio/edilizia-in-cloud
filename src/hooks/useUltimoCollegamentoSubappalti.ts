/**
 * L'ultimo esito del collegamento delle fatture dei subappaltatori a contratto e SAL, dalla traccia
 * (`acquisti_collegamenti`, regola `subappalto_controllo_fattura`): quante proposte aspettano e
 * l'ultimo collegamento. Stesso testo della riga comune (`testoUltimoCollegamento`).
 */
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { UltimoEsito } from "@/components/settings/automazioni/registroAutomatismi";
import { testoUltimoCollegamento } from "@/hooks/useUltimoCollegamento";

export const REGOLA_SUBAPPALTI = "subappalto_controllo_fattura";

type Riga = { id: string; company_id: string; stato: string; esito: string; regola: string; updated_at: string };
type Db = { public: { Tables: { acquisti_collegamenti: { Row: Riga; Insert: never; Update: never; Relationships: [] } }; Views: Record<string, never>; Functions: Record<string, never> } };
const db = supabase as unknown as SupabaseClient<Db>;

export function useUltimoCollegamentoSubappalti(companyId: string): UltimoEsito | null | undefined {
  const { data } = useQuery({
    queryKey: ["ultimo-collegamento-subappalti", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [attesa, ultimo] = await Promise.all([
        db.from("acquisti_collegamenti").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("regola", REGOLA_SUBAPPALTI).eq("stato", "proposto"),
        db.from("acquisti_collegamenti").select("stato, esito, updated_at")
          .eq("company_id", companyId).eq("regola", REGOLA_SUBAPPALTI).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (attesa.error || ultimo.error) return null;
      return testoUltimoCollegamento(attesa.count ?? 0, (ultimo.data as Riga | null) ?? null);
    },
  });
  return data;
}
