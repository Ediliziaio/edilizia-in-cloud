/**
 * Chi ha l'area «Tecnico» in Utenti e permessi, nell'azienda aperta.
 * La tabella dei permessi la legge solo chi gestisce le persone: per questo passa da
 * `tecnici_azienda`, che dice soltanto chi è tecnico (migrazione 20290528100200).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const VUOTO: ReadonlySet<string> = new Set();

export function useTecniciAzienda(companyId: string | null | undefined, attivo = true): ReadonlySet<string> {
  const { data } = useQuery({
    queryKey: ["tecnici-azienda", companyId],
    enabled: !!companyId && attivo,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: righe, error } = await supabase.rpc("tecnici_azienda" as never, { p_company: companyId } as never);
      if (error) throw error;
      return new Set(((righe ?? []) as unknown as Array<string | { tecnici_azienda?: string }>)
        .map((r) => (typeof r === "string" ? r : r.tecnici_azienda ?? "")).filter(Boolean));
    },
  });
  return data ?? VUOTO;
}
