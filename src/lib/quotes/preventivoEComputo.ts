/**
 * Il preventivo dietro al computo: le righe nate da una voce del computo (`computo_voce_id`)
 * hanno ancora la quantità della voce? Se la pianta o il computo sono cambiati dopo, il
 * preventivo è vecchio: si aggiorna (bozza) o se ne fa una revisione aggiornata (già inviato
 * o firmato: il documento mandato al cliente non si tocca).
 * Si confronta solo la quantità: il prezzo del preventivo l'impresa lo può aver cambiato apposta.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RigaPreventivo {
  id: string;
  name: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number | null;
  computo_voce_id: string | null;
}

export interface VoceAttuale { id: string; quantita: number | null; descrizione_breve: string | null }

export interface RigaVecchia {
  riga: RigaPreventivo;
  nuova: number;
  differenzaImporto: number;
}

export function righeVecchie(righe: readonly RigaPreventivo[], voci: readonly VoceAttuale[]): RigaVecchia[] {
  const perId = new Map(voci.map((v) => [v.id, v]));
  const out: RigaVecchia[] = [];
  for (const r of righe) {
    const v = r.computo_voce_id ? perId.get(r.computo_voce_id) : undefined;
    if (!v || v.quantita == null) continue;
    const nuova = Math.round(Number(v.quantita) * 10000) / 10000;
    if (Math.abs(nuova - Number(r.quantity)) < 0.005) continue;
    const prezzo = Number(r.unit_price) * (1 - Number(r.discount_percent ?? 0) / 100);
    out.push({ riga: r, nuova, differenzaImporto: Math.round((nuova - Number(r.quantity)) * prezzo * 100) / 100 });
  }
  return out;
}

export function usePreventivoEComputo(quoteId: string | undefined, companyId: string | undefined) {
  return useQuery({
    queryKey: ["preventivo-e-computo", quoteId],
    enabled: !!quoteId && !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: righe, error } = await supabase.from("quote_items")
        .select("id, name, quantity, unit_price, discount_percent, computo_voce_id")
        .eq("quote_id", quoteId!).eq("company_id", companyId!).not("computo_voce_id", "is", null);
      if (error) throw new Error("Righe del preventivo non disponibili.");
      const ids = [...new Set((righe ?? []).map((r) => r.computo_voce_id!).filter(Boolean))];
      if (!ids.length) return { righe: [] as RigaPreventivo[], vecchie: [] as RigaVecchia[] };
      const voci: VoceAttuale[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error: e2 } = await supabase.from("computo_voci_estratte")
          .select("id, quantita, descrizione_breve").eq("company_id", companyId!).in("id", ids.slice(i, i + 200));
        if (e2) throw new Error("Voci del computo non disponibili.");
        voci.push(...((data ?? []) as VoceAttuale[]));
      }
      const r = (righe ?? []) as RigaPreventivo[];
      return { righe: r, vecchie: righeVecchie(r, voci) };
    },
  });
}

/** Aggiorna le quantità delle righe di un preventivo (i totali li ricalcola il database). */
export async function aggiornaQuantita(quoteId: string, companyId: string, nuove: ReadonlyMap<string, number>) {
  for (const [rigaId, quantita] of nuove) {
    const { error } = await supabase.from("quote_items").update({ quantity: quantita })
      .eq("id", rigaId).eq("quote_id", quoteId).eq("company_id", companyId);
    if (error) throw new Error("Quantità non aggiornate: riprova tra qualche secondo.");
  }
}
