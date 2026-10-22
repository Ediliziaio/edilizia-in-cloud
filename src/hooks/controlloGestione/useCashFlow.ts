/**
 * Cash Flow previsionale del Controllo di gestione — hook React Query.
 *
 * Usa lo stesso motore e la stessa lettura della pagina Previsionale
 * (`loadForecastDataset`, chiave condivisa ["cashflow","ledger",azienda,oggi]):
 * qui i movimenti si raggruppano per mese, più le voci manuali del CdG.
 * Così saldo di partenza, scaduti esclusi e saldo dei prossimi mesi sono gli
 * stessi della pagina /azienda/previsionale.
 *
 * Inoltre espone CRUD per cg_cash_flow_manuali (voci editabili dall'utente).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { loadForecastDataset } from "@/hooks/useForecastLedger";
import { dayKey } from "@/lib/finance/forecastLedger";
import {
  cashFlowMensile,
  type VoceManualeCashFlow,
  type CashFlowResult,
} from "@/lib/controlloGestione/cashFlowMensile";

export type { CashFlowResult, CashFlowMese, RigaCashFlow } from "@/lib/controlloGestione/cashFlowMensile";

/**
 * La previsione parte sempre dal mese in corso e arriva a dicembre dell'anno
 * scelto; gli argomenti sui mesi restano per compatibilità con i chiamanti.
 */
export function useCashFlow(anno: number, _meseDa = 1, _meseA = 12) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["cg", "cash-flow", anno, companyId] as const,
    enabled: !!companyId && anno >= new Date().getFullYear(),
    queryFn: async (): Promise<CashFlowResult> => {
      const today = dayKey(new Date());
      const [dataset, manuali] = await Promise.all([
        // Stessa query (e stessa cache) della pagina Previsionale.
        qc.fetchQuery({
          queryKey: ["cashflow", "ledger", companyId, today],
          queryFn: () => loadForecastDataset(companyId!, today),
          staleTime: 60_000,
        }),
        allPaymentRows<VoceManualeCashFlow>((from, to) =>
          // Tabella non ancora nei tipi generati.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("cg_cash_flow_manuali")
            .select("id,anno,mese,tipo,descrizione,importo,ricorrente")
            .eq("company_id", companyId!)
            .gte("anno", Number(today.slice(0, 4)))
            .lte("anno", anno)
            .order("id")
            .range(from, to),
        ),
      ]);
      if (dataset.opening.cents == null)
        throw new Error(
          dataset.opening.warning ||
            "Inserisci il saldo dei conti in Tesoreria per vedere la previsione di cassa.",
        );
      return cashFlowMensile({
        companyId: companyId!,
        anno,
        today,
        openingCents: dataset.opening.cents,
        openingSource: dataset.opening.source,
        openingUpdatedAt: dataset.opening.updatedAt,
        movements: dataset.movements,
        manuali,
        fontiNonLette: dataset.issues,
      });
    },
    staleTime: 60_000,
  });
}

// ── CRUD voci manuali Cash Flow ─────────────────────────────────────────────

export interface CashFlowManuale {
  id: string;
  company_id: string;
  anno: number;
  mese: number;
  tipo: "entrata" | "uscita";
  categoria: string;
  descrizione: string;
  importo: number;
  ricorrente: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export function useCashFlowManuali(anno: number) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "cash-flow-manuali", anno, companyId] as const,
    enabled: !!companyId,
    queryFn: async (): Promise<CashFlowManuale[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("cg_cash_flow_manuali" as any)
        .select("*")
        // Solo QUESTA azienda (il super admin e chi ha più aziende le sommavano).
        .eq("company_id", companyId!)
        .eq("anno", anno)
        .order("mese", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CashFlowManuale[];
    },
    staleTime: 60_000,
  });
}

export interface CashFlowManualeInput {
  anno: number;
  mese: number;
  tipo: "entrata" | "uscita";
  categoria: string;
  descrizione: string;
  importo: number;
  ricorrente?: boolean;
  note?: string | null;
}

export function useUpsertCashFlowManuale() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (
      input: CashFlowManualeInput & { id?: string; company_id?: string },
    ): Promise<CashFlowManuale> => {
      // L'azienda giusta anche per chi ne gestisce più d'una (o il super admin che la sta guardando).
      const payload = { ...input, company_id: input.company_id ?? companyId ?? undefined };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_cash_flow_manuali")
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CashFlowManuale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow-manuali"] });
      // Una voce di un anno vale anche per la previsione degli anni dopo.
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow"] });
      qc.invalidateQueries({ queryKey: ["cg", "rendiconto-cassa"] });
    },
  });
}

export function useDeleteCashFlowManuale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("cg_cash_flow_manuali")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow-manuali"] });
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow"] });
      qc.invalidateQueries({ queryKey: ["cg", "rendiconto-cassa"] });
    },
  });
}
