/**
 * Le regole di prezzo dell'azienda, da «Prezzo e margini»
 * (preventivo_impostazioni): spese generali, margine minimo, margine obiettivo.
 * Valgono per il listino come per il preventivo, con gli stessi predefiniti
 * del preventivo (spese generali 0%, minimo 15%, obiettivo 25%).
 *
 * Prima il listino usava la soglia di «Approvazioni» (un'altra impostazione con
 * lo stesso nome) e ignorava le spese generali: il margine mostrato era più
 * alto di quello vero. La soglia di Approvazioni resta per approvare i preventivi.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ricaricoDaMargine } from "@/lib/tariffe/prezzoDalCosto";

export interface RegolePrezzo {
  speseGeneraliPct: number;
  margineMinimoPct: number;
  margineObiettivoPct: number;
  /** il ricarico sul costo pieno che dà il margine obiettivo (25% → 33,33%) */
  ricaricoObiettivoPct: number;
  /** false = l'azienda non ha ancora scritto niente: valgono i predefiniti */
  impostate: boolean;
}

const PREDEFINITE = { speseGeneraliPct: 0, margineMinimoPct: 15, margineObiettivoPct: 25 };

export function regoleDa(imp: { overhead_percentuale?: number | null; margine_minimo_percentuale?: number | null; margine_target_default?: number | null } | null | undefined): RegolePrezzo {
  const num = (v: unknown, ripiego: number) => (typeof v === "number" && Number.isFinite(v) ? v : v != null && Number.isFinite(Number(v)) ? Number(v) : ripiego);
  const speseGeneraliPct = Math.max(0, num(imp?.overhead_percentuale, PREDEFINITE.speseGeneraliPct));
  const margineMinimoPct = num(imp?.margine_minimo_percentuale, PREDEFINITE.margineMinimoPct);
  const margineObiettivoPct = num(imp?.margine_target_default, PREDEFINITE.margineObiettivoPct);
  return {
    speseGeneraliPct,
    margineMinimoPct,
    margineObiettivoPct,
    ricaricoObiettivoPct: ricaricoDaMargine(margineObiettivoPct) ?? 0,
    impostate: !!imp && (imp.overhead_percentuale != null || imp.margine_minimo_percentuale != null || imp.margine_target_default != null),
  };
}

export function useRegolePrezzo(companyId: string | null | undefined) {
  return useQuery({
    // sotto la chiave di «Prezzo e margini» (salvando lì, il listino si aggiorna)
    // ma non la stessa: altre pagine ci mettono una riga con meno colonne, e il
    // listino leggeva spese generali a 0% senza saperlo
    queryKey: ["preventivo-impostazioni", companyId, "regole-prezzo"],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.from("preventivo_impostazioni") as any)
        .select("*").eq("company_id", companyId).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    select: (data) => regoleDa(data as Parameters<typeof regoleDa>[0]),
  });
}
