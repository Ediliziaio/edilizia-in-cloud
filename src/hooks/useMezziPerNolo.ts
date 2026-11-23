import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MezzoAzienda } from "@/lib/distinta/mezziPerNolo";

/** Mezzi e attrezzature dell'azienda, con quanto resta libero di quelle a quantità: per non noleggiare ciò che c'è già. */
export function useMezziPerNolo(companyId: string | null | undefined, attivo = true) {
  return useQuery({
    queryKey: ["mezzi-per-nolo", companyId],
    enabled: !!companyId && attivo,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MezzoAzienda[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [mezzi, liberi] = await Promise.all([
        db.from("mezzi").select("id, nome, tipo, marca, modello, possesso, stato, gestione, assegnato_order_id, unita_misura")
          .eq("company_id", companyId).is("deleted_at", null).limit(1000),
        db.from("mezzi_disponibilita").select("mezzo_id, disponibile").eq("company_id", companyId),
      ]);
      if (mezzi.error) throw mezzi.error;
      // La disponibilità può mancare (vista non leggibile): resta «da verificare», non «zero».
      const perMezzo = new Map<string, number>(((liberi.data ?? []) as { mezzo_id: string; disponibile: number | null }[])
        .filter((r) => r.disponibile != null).map((r) => [r.mezzo_id, Number(r.disponibile)]));
      return ((mezzi.data ?? []) as MezzoAzienda[]).map((m) => ({ ...m, disponibile: perMezzo.get(m.id) ?? null }));
    },
  });
}
