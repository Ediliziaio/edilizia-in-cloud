import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { useEffectiveCompanyId } from "./useEffectiveCompanyId";

export function useEdificiPriorita(generaleId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["generale-unita", generaleId, "edifici-priorita", companyId],
    enabled: !!companyId && !!generaleId,
    staleTime: 30_000,
    queryFn: ({ signal }) => readAllOrderRows<{ order_id: string; edificio: string | null }>((da, a) => supabase
      .from("unita_immobiliari")
      .select("order_id,edificio,ordine:orders!unita_immobiliari_order_id_fkey!inner(id)")
      .eq("company_id", companyId!).eq("ordine.company_id", companyId!).eq("ordine.commessa_generale_id", generaleId!)
      .is("ordine.deleted_at", null).not("edificio", "is", null).order("id").range(da, a).abortSignal(signal)),
  });
}

export function useReferentiPriorita(commesse: string[]) {
  const companyId = useEffectiveCompanyId();
  const ids = [...new Set(commesse)].sort();
  return useQuery({
    queryKey: ["orders", "referenti-priorita", companyId, ids],
    enabled: !!companyId && ids.length > 0,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { data: ordini, error } = await supabase.from("orders").select("id,assigned_to")
        .eq("company_id", companyId!).in("id", ids).is("deleted_at", null).abortSignal(signal);
      if (error) throw error;
      const assegnatari = [...new Set((ordini ?? []).flatMap(o => o.assigned_to ? [o.assigned_to] : []))];
      const nomi = new Map<string, string>();
      if (assegnatari.length > 0) {
        const { data: profili, error: erroreProfili } = await supabase.from("profiles").select("id,first_name,last_name")
          .in("id", assegnatari).abortSignal(signal);
        if (erroreProfili) throw erroreProfili;
        for (const p of profili ?? []) {
          const nome = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          if (nome) nomi.set(p.id, nome);
        }
      }
      return Object.fromEntries((ordini ?? []).map(o => [o.id, o.assigned_to ? nomi.get(o.assigned_to) : null]));
    },
  });
}

type FaseCollegata = { id: string; order_id: string; name: string };

export function useFasiConsegna(odaId: string, commesse: ReadonlySet<string>) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["priorita-fasi-consegna", companyId, odaId, [...commesse].sort()],
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const righe = await readAllOrderRows<{ materiale: { order_id: string; fase: FaseCollegata | null } | null }>(async (da, a) => {
        const { data, error } = await supabase.from("purchase_order_items")
          .select("materiale:order_items!purchase_order_items_order_item_id_fkey(order_id,fase:order_work_phases!order_items_phase_id_fkey(id,order_id,name))")
          .eq("company_id", companyId!).eq("purchase_order_id", odaId).order("id").range(da, a).abortSignal(signal);
        return { data: data as { materiale: { order_id: string; fase: FaseCollegata | null } | null }[] | null, error };
      });
      const fasi = new Map<string, FaseCollegata>();
      for (const { materiale } of righe) {
        const fase = materiale?.fase;
        if (fase && materiale.order_id === fase.order_id && commesse.has(fase.order_id)) fasi.set(fase.id, fase);
      }
      return [...fasi.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
    },
  });
}
