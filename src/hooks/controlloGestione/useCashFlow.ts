/**
 * Cash Flow Mensile Prospettico — hook React Query.
 *
 * Tenant-scoped paginated reads, residual payment commitments only.
 * Every future month has
 *   saldo iniziale, entrate breakdown, uscite breakdown, saldo finale.
 *
 * Inoltre espone CRUD per cg_cash_flow_manuali (voci editabili dall'utente).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { allPaymentRows } from '@/hooks/useSupplierPayments';
import { projectedCashFlow, type ForecastManual, type ForecastRate } from '@/lib/controlloGestione/projectedCashFlow';

export interface CashFlowEntrateBreakdown {
  scadenze: number;
  manuali: number;
  fatture: number;
  commesse?: number;
}

export interface CashFlowUsciteBreakdown {
  scadenze: number;
  personale: number;
  mutui: number;
  manuali: number;
  costi: number;
}

export interface CashFlowDettaglio {
  etichetta: string;
  importo: number;
}

export interface CashFlowMese {
  mese: number;
  saldo_inizio: number;
  entrate: CashFlowEntrateBreakdown;
  entrate_totali: number;
  uscite: CashFlowUsciteBreakdown;
  uscite_totali: number;
  saldo_fine: number;
  flusso_netto: number;
  sotto_zero: boolean;
  dettaglio_entrate: CashFlowDettaglio[];
  dettaglio_uscite: CashFlowDettaglio[];
}

export interface CashFlowResult {
  verifiche?: { id: string; origine: 'scadenza' | 'costo' | 'rata' | 'manuale'; etichetta: string; motivo: string; order_id?: string | null }[];
  meta: {
    company_id: string;
    anno: number;
    mese_da: number;
    mese_a: number;
    saldo_apertura: number;
    saldo_chiusura: number;
    generato_il: string;
    ancorato_al?: string;
    scaduti?: number;
    da_verificare?: number;
    saldi_aggiornati_al?: string | null;
  };
  mesi: CashFlowMese[];
}

export function useCashFlow(anno: number, meseDa = 1, meseA = 12) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "cash-flow", anno, meseDa, meseA, companyId] as const,
    enabled: !!companyId && anno >= new Date().getFullYear(),
    queryFn: async (): Promise<CashFlowResult> => {
      const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const [accounts,dues,payments,costs,rates,manuals]=await Promise.all([
        allPaymentRows((from,to)=>supabase.from('bank_accounts').select('id,current_balance,available_balance,balance_updated_at,currency').eq('company_id',companyId!).eq('is_active',true).order('id').range(from,to)),
        allPaymentRows((from,to)=>supabase.from('scadenze').select('id,direction,description,amount,paid_amount,due_date,status,cost_id,invoice_id,order_id,notes,auto_source').eq('company_id',companyId!).order('id').range(from,to)),
        allPaymentRows((from,to)=>supabase.from('prima_nota_entries').select('id,direction,amount,entry_date,scadenza_id,cost_id,installment_id,invoice_id,documento_fiscale_id').eq('company_id',companyId!).lte('entry_date',today).order('id').range(from,to)),
        allPaymentRows((from,to)=>supabase.from('company_costs').select('id,name,amount,vat_rate,due_date,is_paid,payment_method').eq('company_id',companyId!).or('is_paid.eq.false,is_paid.is.null').order('id').range(from,to)),
        allPaymentRows((from,to)=>supabase.from('order_installments').select('id,order_id,label,amount,expected_date,is_paid,invoice_id,documento_fiscale_id,orders!inner(company_id,deleted_at)').eq('orders.company_id',companyId!).is('orders.deleted_at',null).order('id').range(from,to)),
        // This table is not yet present in generated Supabase types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allPaymentRows((from,to)=>(supabase as any).from('cg_cash_flow_manuali').select('id,anno,mese,tipo,descrizione,importo,ricorrente').eq('company_id',companyId!).gte('anno',now.getFullYear()).lte('anno',anno).order('id').range(from,to)),
      ]);
      const eur=accounts.filter(a=>a.currency==='EUR'&&a.current_balance!=null&&Number.isFinite(Number(a.current_balance)));
      if(!eur.length||eur.length!==accounts.filter(a=>a.currency==='EUR').length)throw new Error('Inserisci o aggiorna il saldo di tutti i conti EUR per usare il previsionale.');
      const result=projectedCashFlow({companyId:companyId!,year:anno,from:meseDa,to:meseA,today,opening:eur.reduce((s,a)=>s+Number(a.current_balance),0),dues,payments,costs,rates:rates as ForecastRate[],manuals:manuals as ForecastManual[]});
      result.meta.saldi_aggiornati_al=eur.some(a=>!a.balance_updated_at)?null:eur.map(a=>a.balance_updated_at!).sort()[0];
      return result;
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
  return useMutation({
    mutationFn: async (
      input: CashFlowManualeInput & { id?: string; company_id?: string },
    ): Promise<CashFlowManuale> => {
      const payload = { ...input };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_cash_flow_manuali")
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CashFlowManuale;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow-manuali", vars.anno] });
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow", vars.anno] });
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
    },
  });
}
