/**
 * L'ultimo esito della lettura delle bollette, per la riga in Impostazioni → Automazioni:
 * doppioni da decidere, bollette con l'utenza da collegare, oppure l'ultima letta.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { UltimoEsito } from "@/components/settings/automazioni/registroAutomatismi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function testoUltimoEsitoBollette(doppioni: number, daCollegare: number, ultima: string | null): UltimoEsito | null {
  if (doppioni > 0) return { quando: ultima, testo: doppioni === 1 ? "1 bolletta da decidere: possibile doppione" : `${doppioni} bollette da decidere: possibili doppioni`, tono: "attenzione" };
  if (daCollegare > 0) return { quando: ultima, testo: daCollegare === 1 ? "1 bolletta con l'utenza da collegare a sede, immobile o commessa" : `${daCollegare} bollette con l'utenza da collegare a sede, immobile o commessa`, tono: "attenzione" };
  if (!ultima) return null;
  return { quando: ultima, testo: "Ultima bolletta letta", tono: "ok" };
}

export function useUltimoEsitoBollette(companyId: string): UltimoEsito | null | undefined {
  const { data } = useQuery({
    queryKey: ["ultimo-esito-bollette", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [dop, coll, ultima] = await Promise.all([
        db.from("bollette").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("stato", "doppione_sospetto"),
        db.from("bollette").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("costo_esito", "da_collegare"),
        db.from("bollette").select("letta_il").eq("company_id", companyId).order("letta_il", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (dop.error || coll.error || ultima.error) return null;
      return testoUltimoEsitoBollette(dop.count ?? 0, coll.count ?? 0, (ultima.data as { letta_il: string } | null)?.letta_il ?? null);
    },
  });
  return data;
}
