/** Il listino del contratto in corso di un committente, per le voci del preventivo classico (10/11/2026). */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { contrattoDiOggi } from "@/lib/appalto/contratti";
import type { TariffaContratto } from "@/lib/preventivi/preventiviCommittente";

interface Listino {
  contratto: { id: string; nome: string } | null;
  tariffe: TariffaContratto[];
}

/**
 * Il listino del contratto in corso del committente. Vuoto se il cliente non è un committente, se non ha
 * contratti o se chi guarda non ha il permesso sugli importi (la policy di appalto_tariffe non dà righe).
 */
export function useListinoCommittente(customerId: string | null | undefined, companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["preventivo-listino-committente", companyId, customerId],
    enabled: !!customerId && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<Listino> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: profilo } = await db.from("profiles").select("customer_type").eq("id", customerId).eq("company_id", companyId).maybeSingle();
      if (profilo?.customer_type !== "appaltatore") return { contratto: null, tariffe: [] };
      const { data: contratti, error } = await db.from("appalto_contratti")
        .select("id, nome, valido_dal, valido_al, attivo")
        .eq("company_id", companyId).eq("committente_id", customerId)
        .order("valido_dal", { ascending: false });
      if (error) throw error;
      const contratto = contrattoDiOggi((contratti ?? []) as Array<{ id: string; nome: string; valido_dal: string; valido_al: string | null; attivo: boolean }>);
      if (!contratto) return { contratto: null, tariffe: [] };
      const { data: tariffe, error: e2 } = await db.from("appalto_tariffe")
        .select("id, tipo, codice, descrizione, unita_misura, prezzo_unitario, qualifica, note, attivo")
        .eq("contratto_id", contratto.id).eq("attivo", true)
        .order("ordine", { ascending: true }).order("descrizione", { ascending: true });
      if (e2) throw e2;
      return { contratto: { id: contratto.id, nome: contratto.nome }, tariffe: (tariffe ?? []) as TariffaContratto[] };
    },
  });
}
