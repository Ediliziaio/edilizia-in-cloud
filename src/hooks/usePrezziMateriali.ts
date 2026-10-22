/**
 * Prezzi d'acquisto proposti per i materiali della commessa che non ne hanno
 * uno: listino collegato, ultimo prezzo pagato, prezzo della scomposizione
 * (regole in lib/distinta/prezziMateriali). Solo per chi vede i costi.
 * «Usa i prezzi proposti» li scrive sulle righe con la fonte.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { chiaviMateriali } from "@/hooks/useMaterialiPerFase";
import { chiaveDescrizione, prezzoAttuale, scegliPrezzo, type PrezzoProposto } from "@/lib/distinta/prezziMateriali";

export interface MaterialePerPrezzo {
  id: string;
  name: string;
  quantity: number;
  unita_misura: string | null;
  purchase_price: number | null;
  prezzo_fonte?: string | null;
  article_template_id?: string | null;
  scomposizione_id?: string | null;
  natura_riga?: string | null;
}

export function usePrezziProposti(orderId: string, materiali: MaterialePerPrezzo[], abilitato: boolean) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  // Solo i materiali senza prezzo: gli altri il prezzo ce l'hanno.
  const senza = useMemo(
    () => materiali.filter((m) => (m.natura_riga ?? "materiale") === "materiale" && !prezzoAttuale(m)),
    [materiali],
  );
  const firma = senza.map((m) => m.id).sort().join(",");

  const query = useQuery({
    queryKey: ["prezzi-proposti-materiali", companyId, orderId, firma],
    enabled: abilitato && !!companyId && senza.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const templateIds = [...new Set(senza.map((m) => m.article_template_id).filter((x): x is string => !!x))];
      const scomposizioneIds = [...new Set(senza.map((m) => m.scomposizione_id).filter((x): x is string => !!x))];
      const [listino, ultimi, componenti] = await Promise.all([
        templateIds.length
          ? supabase.from("article_templates").select("id, name, prezzo_acquisto_netto, standard_cost").in("id", templateIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.rpc("materiali_ultimi_prezzi", { p_company: companyId!, p_descrizioni: [...new Set(senza.map((m) => m.name))] }),
        scomposizioneIds.length
          ? supabase.from("scomposizioni_voce_componenti").select("scomposizione_id, descrizione, prezzo_unitario").in("scomposizione_id", scomposizioneIds).not("prezzo_unitario", "is", null)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (listino.error) throw listino.error;
      if (ultimi.error) throw ultimi.error;
      if (componenti.error) throw componenti.error;
      return {
        listino: (listino.data ?? []) as { id: string; name: string; prezzo_acquisto_netto: number | null; standard_cost: number | null }[],
        ultimi: (ultimi.data ?? []) as { chiave: string; prezzo: number; unita: string | null; data: string | null; oda: string | null }[],
        componenti: (componenti.data ?? []) as { scomposizione_id: string; descrizione: string; prezzo_unitario: number | null }[],
      };
    },
  });

  const proposte = useMemo(() => {
    const out = new Map<string, PrezzoProposto>();
    const d = query.data;
    if (!d) return out;
    for (const m of senza) {
      const chiave = chiaveDescrizione(m.name);
      const t = d.listino.find((x) => x.id === m.article_template_id);
      const p = scegliPrezzo({
        unita: m.unita_misura,
        listino: t ? { nome: t.name, prezzo_acquisto_netto: t.prezzo_acquisto_netto, standard_cost: t.standard_cost } : null,
        ultimoAcquisto: d.ultimi.find((u) => u.chiave === chiave) ?? null,
        scomposizione: d.componenti.find((c) => c.scomposizione_id === m.scomposizione_id && chiaveDescrizione(c.descrizione) === chiave) ?? null,
      });
      if (p) out.set(m.id, p);
    }
    return out;
  }, [query.data, senza]);

  return { proposte, isLoading: query.isLoading, isError: query.isError };
}

export function useApplicaPrezziProposti(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (righe: { id: string; prezzo: PrezzoProposto }[]) => {
      const adesso = new Date().toISOString();
      // Una scrittura per riga: prezzi diversi. Le righe sono poche (una commessa).
      for (const r of righe) {
        const { error } = await supabase.from("order_items")
          .update({ purchase_price: r.prezzo.prezzo, prezzo_fonte: r.prezzo.fonte, prezzo_aggiornato_il: adesso })
          .eq("id", r.id);
        if (error) throw error;
      }
      return righe.length;
    },
    onSuccess: (n) => {
      toast.success(`Prezzo scritto su ${n} materiali`);
      qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
      qc.invalidateQueries({ queryKey: ["order-items", orderId] });
    },
    onError: (e) => toast.error("Prezzi non scritti", { description: e instanceof Error ? e.message : String(e) }),
  });
}
