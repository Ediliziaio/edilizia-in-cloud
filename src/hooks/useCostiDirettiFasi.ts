// src/hooks/useCostiDirettiFasi.ts
// Fatture e spese della commessa, con quello che serve a dire su quale fase stanno: stesse regole di v_ordine_marginalita.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import type { ContrattoDitta, CostoDiretto, DittaSuFase } from "@/lib/orders/costiDirettiFasi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface DatiCostiDiretti { costi: CostoDiretto[]; ditte: DittaSuFase[]; contratti: ContrattoDitta[] }
type RigaCosto = {
  id: string; name: string | null; due_date: string | null; amount: number; order_id: string | null; order_work_phase_id: string | null; allocations: unknown;
  fornitore: { name: string | null; tipo: string | null; subappaltatore_id: string | null } | null;
};
const COLONNE = "id, name, due_date, amount, order_id, order_work_phase_id, allocations, fornitore:suppliers(name, tipo, subappaltatore_id)";

/** La parte del costo che tocca a questa commessa: tutto, o la quota scritta nelle ripartizioni. Mai negativa. */
export function quotaDellaCommessa(r: Pick<RigaCosto, "amount" | "order_id" | "allocations">, orderId: string): number {
  const importo = Number(r.amount) || 0;
  if (!Array.isArray(r.allocations) || r.allocations.length === 0) return r.order_id === orderId ? importo : 0;
  const quote = r.allocations as Array<{ order_id?: string; pct?: number | string }>;
  return quote.filter((a) => a.order_id === orderId).reduce((s, a) => s + (importo * Math.max(0, Number(a.pct) || 0)) / 100, 0);
}

export function useCostiDirettiFasi(orderId: string | null | undefined, abilitato: boolean) {
  return useQuery({
    queryKey: ["company-costs", "commessa-fasi", orderId],
    enabled: !!orderId && abilitato,
    staleTime: 30_000,
    queryFn: async (): Promise<DatiCostiDiretti> => {
      const id = orderId!;
      const senzaCollegati = (q: ReturnType<typeof db.from>) => q.is("purchase_order_id", null).is("order_external_team_id", null);
      const [diretti, ripartiti, assegnate, contratti, schede] = await Promise.all([
        allPaymentRows((da, a) => senzaCollegati(db.from("company_costs").select(COLONNE)).eq("order_id", id).order("id").range(da, a)),
        allPaymentRows((da, a) => senzaCollegati(db.from("company_costs").select(COLONNE)).contains("allocations", [{ order_id: id }]).order("id").range(da, a)),
        db.from("order_external_teams").select("phase_id, cost_preventivo, team:external_teams(subappaltatore_id)").eq("order_id", id),
        db.from("contratti_subappalto").select("subappaltatore_id, stato, elenco_lavori").eq("order_id", id),
        db.from("subappaltatori_sicurezza").select("id, campo_subappaltatore_id"),
      ]);
      // I contratti hanno il loro permesso: senza, i costi restano «senza fase», non si perde la pagina.
      const schedaACampo = new Map(((schede.data ?? []) as Array<{ id: string; campo_subappaltatore_id: string | null }>).map((s) => [s.id, s.campo_subappaltatore_id]));
      const visti = new Set<string>();
      const costi: CostoDiretto[] = [];
      for (const r of [...(diretti as RigaCosto[]), ...(ripartiti as RigaCosto[])]) {
        if (visti.has(r.id)) continue;
        visti.add(r.id);
        const importo = quotaDellaCommessa(r, id);
        if (importo === 0) continue;
        costi.push({
          id: r.id, importo, phase_id: r.order_work_phase_id ?? null,
          subappaltatore_id: r.fornitore?.subappaltatore_id ?? null, tipo_fornitore: r.fornitore?.tipo ?? null,
          nome: r.name ?? "Costo", data: r.due_date ?? null, fornitore: r.fornitore?.name ?? null,
        });
      }
      return {
        costi,
        ditte: ((assegnate.data ?? []) as Array<{ phase_id: string | null; cost_preventivo: number | null; team: { subappaltatore_id: string | null } | null }>)
          .map((t) => ({ phase_id: t.phase_id, subappaltatore_id: t.team?.subappaltatore_id ?? null, peso: Number(t.cost_preventivo) || 0 })),
        contratti: ((contratti.data ?? []) as Array<{ subappaltatore_id: string; stato: string | null; elenco_lavori: unknown }>)
          .filter((k) => k.stato !== "risolto")
          .map((k) => ({
            subappaltatore_id: schedaACampo.get(k.subappaltatore_id) ?? k.subappaltatore_id,
            righe: Array.isArray(k.elenco_lavori) ? (k.elenco_lavori as Array<{ fase: string; importo: number }>) : [],
          })),
      };
    },
  });
}

/** Mette più costi su una fase. Si controlla quante righe sono cambiate: senza permesso l'aggiornamento non dà errore. */
export function useAssegnaFaseCosti() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, faseId }: { ids: string[]; faseId: string }) => {
      let fatti = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await db.from("company_costs").update({ order_work_phase_id: faseId }).in("id", ids.slice(i, i + 100)).select("id");
        if (error) throw error;
        fatti += data?.length ?? 0;
      }
      if (fatti < ids.length) throw new Error(fatti ? `Assegnati ${fatti} costi su ${ids.length}: gli altri non puoi modificarli.` : "Non puoi modificare questi costi.");
      return fatti;
    },
    onSuccess: (n) => toast.success(n === 1 ? "Costo assegnato" : `${n} costi assegnati`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Costi non assegnati"),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ["company-costs"] }); },
  });
}
