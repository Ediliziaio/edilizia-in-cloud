/**
 * L'indirizzo di un contatto del CRM (via, città, CAP, provincia), per chi deve proporlo come indirizzo dei lavori.
 * Si legge dalla scheda del contatto collegato: i preventivi edili non hanno un indirizzo del cliente proprio.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Indirizzo } from "@/lib/preventivatore/indirizzoLavori";

export const chiaveIndirizzoContatto = (contattoId: string) => ["indirizzo-contatto", contattoId] as const;

export function useIndirizzoContatto(contattoId: string | null | undefined) {
  return useQuery({
    queryKey: chiaveIndirizzoContatto(contattoId ?? ""),
    enabled: !!contattoId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Indirizzo | null> => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("address, city, province, postal_code")
        .eq("id", contattoId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { indirizzo: data.address, citta: data.city, cap: data.postal_code, provincia: data.province };
    },
  });
}
