/**
 * useMetaAbTests — MP-ADS-04 GAP-2 · backend A/B test per campagne Meta.
 *
 * Incapsula il flusso completo (prima ASSENTE):
 *  • createTest: duplica la campagna base (pubblicata) → Variant B via
 *    meta-ads-update-campaign action:duplicate, applica l'UNICA variabile,
 *    traccia il test in meta_ab_tests, opzionalmente attiva entrambe.
 *  • evaluateTest: legge CPL di base+variant da meta_insights_cache (frontend)
 *    e propone il vincitore.
 *  • decideTest: marca il test deciso + (opzionale) mette in pausa il perdente.
 *
 * Nota: meta-ads-update-campaign usa il campo `patch` (non `payload`) e su
 * `duplicate` forza il nome "[COPIA] …" → rinominiamo con un action:update.
 * La valutazione è frontend perché qui c'è un utente autenticato (il titolare),
 * quindi può invocare meta-ads-update-campaign (che richiede company_admin).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface MetaAbTest {
  id: string;
  company_id: string;
  base_campaign_id: string;
  variant_campaign_id: string | null;
  variable: string;
  hypothesis: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new_value: any;
  status: "running" | "decided" | "stopped";
  winner: "base" | "variant" | null;
  started_at: string;
  decided_at: string | null;
}

export interface AbEvaluation {
  base_cpl: number | null;
  variant_cpl: number | null;
  suggested: "base" | "variant" | null;
}

export function useMetaAbTests(companyId?: string) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["meta-ab-tests", companyId],
    queryFn: async (): Promise<MetaAbTest[]> => {
      if (!companyId) return [];
      const { data, error } = await sb.from("meta_ab_tests")
        .select("*").eq("company_id", companyId).order("started_at", { ascending: false });
      if (error) {
        if (String(error.message ?? "").includes("does not exist")) return [];
        throw error;
      }
      return (data ?? []) as MetaAbTest[];
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  /** Duplica la campagna base → variante, applica la variabile, traccia, (opz.) attiva entrambe. */
  const createTest = useMutation({
    mutationFn: async (input: {
      base_campaign_id: string;
      variable: string;
      hypothesis: string;
      new_value?: string | number;
      variant_name?: string;
      activate?: boolean;
    }) => {
      if (!companyId) throw new Error("no_company");
      // a) duplica la base (la copia nasce in PAUSED/draft)
      const dup = await supabase.functions.invoke<{ success?: boolean; new_campaign_id?: string; error?: string }>(
        "meta-ads-update-campaign",
        { body: { company_id: companyId, campaign_id: input.base_campaign_id, action: "duplicate" } },
      );
      if (dup.error || dup.data?.error) throw new Error(dup.data?.error || dup.error?.message || "duplicate_failed");
      const variantId = dup.data?.new_campaign_id ?? null;

      // b) applica l'UNICA variabile cambiata sulla copia (+ rinomina)
      if (variantId) {
        const patch: Record<string, unknown> = {};
        if (input.variant_name) patch.name = input.variant_name;
        if (input.variable === "budget" && typeof input.new_value === "number") {
          patch.daily_budget_cents = Math.round(input.new_value * 100);
        }
        if (Object.keys(patch).length > 0) {
          await supabase.functions.invoke("meta-ads-update-campaign", {
            body: { company_id: companyId, campaign_id: variantId, action: "update", patch },
          });
        }
        // copy/creative/audience: il cambio va fatto nel builder della copia e ripubblicato;
        // qui registriamo l'ipotesi e lasciamo la copia pronta da personalizzare.
      }

      // c) registra il test
      const { error: insErr } = await sb.from("meta_ab_tests").insert({
        company_id: companyId,
        base_campaign_id: input.base_campaign_id,
        variant_campaign_id: variantId,
        variable: input.variable,
        hypothesis: input.hypothesis,
        new_value: input.new_value != null ? { value: input.new_value } : null,
      });
      if (insErr) throw insErr;

      // d) (opzionale) attiva entrambe con budget equo
      if (input.activate && variantId) {
        await supabase.functions.invoke("meta-ads-update-campaign", { body: { company_id: companyId, campaign_id: input.base_campaign_id, action: "activate" } });
        await supabase.functions.invoke("meta-ads-update-campaign", { body: { company_id: companyId, campaign_id: variantId, action: "activate" } });
      }
      return { variantId };
    },
    onSuccess: () => {
      toast.success("A/B test creato", { description: "Variante duplicata e tracciata." });
      void qc.invalidateQueries({ queryKey: ["meta-ab-tests", companyId] });
      void qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
    },
    onError: (e) => toast.error("A/B test non riuscito", { description: e instanceof Error ? e.message : String(e) }),
  });

  /** Legge il CPL di base+variant da meta_insights_cache e propone il vincitore. */
  async function evaluateTest(test: MetaAbTest): Promise<AbEvaluation> {
    const localIds = [test.base_campaign_id, test.variant_campaign_id].filter(Boolean) as string[];
    const { data: camps } = await sb.from("meta_campaigns").select("id, meta_campaign_id").in("id", localIds);
    const metaIdByLocal = new Map<string, string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (camps ?? []).map((c: any) => [c.id, c.meta_campaign_id]),
    );
    const { data: rows } = await sb.from("meta_insights_cache")
      .select("payload_json").eq("company_id", test.company_id).eq("level", "campaign");

    const cplFor = (localId: string | null): number | null => {
      if (!localId) return null;
      const metaId = metaIdByLocal.get(localId);
      if (!metaId) return null;
      let spend = 0, leads = 0;
      for (const r of rows ?? []) {
        const arr = Array.isArray(r.payload_json) ? r.payload_json : [];
        for (const el of arr) {
          if (String(el.campaign_id) !== String(metaId)) continue;
          spend += parseFloat(el.spend ?? "0") || 0;
          const actions = Array.isArray(el.actions) ? el.actions : [];
          for (const a of actions) if (/lead/i.test(String(a.action_type))) leads += parseFloat(a.value ?? "0") || 0;
        }
      }
      return leads > 0 ? spend / leads : null;
    };

    const base_cpl = cplFor(test.base_campaign_id);
    const variant_cpl = cplFor(test.variant_campaign_id);
    let suggested: "base" | "variant" | null = null;
    if (base_cpl != null && variant_cpl != null) suggested = variant_cpl < base_cpl ? "variant" : "base";
    else if (variant_cpl != null) suggested = "variant";
    else if (base_cpl != null) suggested = "base";
    return { base_cpl, variant_cpl, suggested };
  }

  /** Marca il test deciso + (opzionale) mette in pausa il perdente. */
  const decideTest = useMutation({
    mutationFn: async (input: { test: MetaAbTest; winner: "base" | "variant"; pause_loser?: boolean }) => {
      const { test, winner, pause_loser } = input;
      const loserLocalId = winner === "base" ? test.variant_campaign_id : test.base_campaign_id;
      if (pause_loser && loserLocalId && companyId) {
        await supabase.functions.invoke("meta-ads-update-campaign", {
          body: { company_id: companyId, campaign_id: loserLocalId, action: "pause" },
        });
      }
      const { error } = await sb.from("meta_ab_tests")
        .update({ status: "decided", winner, decided_at: new Date().toISOString() })
        .eq("id", test.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vincitore registrato");
      void qc.invalidateQueries({ queryKey: ["meta-ab-tests", companyId] });
      void qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
    },
    onError: (e) => toast.error("Operazione non riuscita", { description: e instanceof Error ? e.message : String(e) }),
  });

  /** Registrazione leggera (best-effort) di un esperimento avviato dal builder bozze. */
  async function recordExperiment(input: { base_campaign_id: string; variable: string; hypothesis: string; new_value?: string | number }) {
    if (!companyId) return;
    try {
      await sb.from("meta_ab_tests").insert({
        company_id: companyId,
        base_campaign_id: input.base_campaign_id,
        variant_campaign_id: null,
        variable: input.variable,
        hypothesis: input.hypothesis,
        new_value: input.new_value != null ? { value: input.new_value } : null,
      });
      void qc.invalidateQueries({ queryKey: ["meta-ab-tests", companyId] });
    } catch { /* best-effort: non bloccare la creazione della variante */ }
  }

  return {
    tests: list.data ?? [],
    isLoading: list.isLoading,
    createTest,
    evaluateTest,
    decideTest,
    recordExperiment,
  };
}
