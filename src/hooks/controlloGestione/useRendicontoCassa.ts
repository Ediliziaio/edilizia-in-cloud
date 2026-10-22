/**
 * Dati del rendiconto di cassa (scheda Cash Flow del Controllo di gestione).
 *
 * Una lettura per anno, senza ricariche al ritorno sulla finestra:
 *  - prima nota dell'anno, con la categoria della spesa collegata e il tipo della rata;
 *  - per l'anno in corso e i futuri: i movimenti attesi del Previsionale, dalla STESSA cache della
 *    pagina /azienda/previsionale (chiave ["cashflow","ledger",azienda,oggi]), più mutui e voci manuali;
 *  - per gli anni passati: solo il saldo dei conti di oggi e il totale registrato dopo l'anno
 *    (una RPC aggregata), per ricostruire il saldo all'indietro.
 * Le ipotesi (scaduti, stime) si applicano nel componente: cambiarle non rilegge niente.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { loadForecastDataset } from "@/hooks/useForecastLedger";
import {
  dayKey,
  resolveOpeningBalance,
  toCents,
  type BankRow,
  type ForecastMovement,
} from "@/lib/finance/forecastLedger";
import type {
  MovimentoRegistrato,
  MutuoCG,
  VoceManualeRendiconto,
} from "@/lib/controlloGestione/rendicontoCassa";

export interface DatiRendicontoCassa {
  today: string;
  saldoOggiCents: number | null;
  saldoFonte: "banca" | "prima-nota" | "nessuna";
  saldoAggiornatoAl: string | null;
  registrati: MovimentoRegistrato[];
  flussoDopoAnnoCents: number | null;
  previsti: ForecastMovement[] | null;
  manuali: VoceManualeRendiconto[];
  mutui: MutuoCG[];
  /** Fonti non lette: i numeri riguardano solo il resto. */
  fontiNonLette: string[];
}

interface RigaPrimaNota {
  id: string;
  direction: string;
  amount: number | string | null;
  entry_date: string;
  category: string | null;
  description: string | null;
  supplier_id: string | null;
  order_item_id: string | null;
  order_id: string | null;
  invoice_id: string | null;
  documento_fiscale_id: string | null;
  installment_id: string | null;
  cost: { category: string | null } | null;
  installment: { type: string | null } | null;
  supplier: { name: string | null } | null;
}

// Tabelle e join non ancora tutti nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useRendicontoCassa(anno: number) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  const today = dayKey(new Date());
  return useQuery({
    queryKey: ["cg", "rendiconto-cassa", anno, companyId, today] as const,
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DatiRendicontoCassa> => {
      const annoOggi = Number(today.slice(0, 4));
      const futuro = anno >= annoOggi;
      const fontiNonLette: string[] = [];
      const facoltativo = async <T,>(label: string, fn: () => Promise<T>, vuoto: T): Promise<T> => {
        try {
          return await fn();
        } catch {
          fontiNonLette.push(label);
          return vuoto;
        }
      };

      const primaNota = allPaymentRows<RigaPrimaNota>((from, to) =>
        db
          .from("prima_nota_entries")
          .select(
            "id,direction,amount,entry_date,category,description,supplier_id,order_item_id,order_id,invoice_id,documento_fiscale_id,installment_id,cost:company_costs(category),installment:order_installments(type),supplier:suppliers(name)",
          )
          .eq("company_id", companyId)
          .gte("entry_date", `${anno}-01-01`)
          .lt("entry_date", `${anno + 1}-01-01`)
          .order("id")
          .range(from, to),
      );

      const previsione = futuro
        ? qc.fetchQuery({
            // Stessa chiave (e stessa lettura) della pagina Previsionale.
            queryKey: ["cashflow", "ledger", companyId, today],
            queryFn: () => loadForecastDataset(companyId!, today),
            staleTime: 5 * 60_000,
          })
        : null;

      const saldoStorico = futuro
        ? null
        : (async () => {
            const [banche, dopo] = await Promise.all([
              facoltativo("Conti bancari", async () => {
                const { data, error } = await db
                  .from("bank_accounts")
                  .select("id,current_balance,available_balance,currency,balance_updated_at")
                  .eq("company_id", companyId)
                  .eq("is_active", true);
                if (error) throw error;
                return (data ?? []) as BankRow[];
              }, [] as BankRow[]),
              facoltativo("Prima nota dopo l'anno", async () => {
                const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
                  db.rpc("get_prima_nota_saldo", { p_company_id: companyId, p_from_date: `${anno + 1}-01-01`, p_to_date: today }),
                  db.rpc("get_prima_nota_saldo", { p_company_id: companyId, p_to_date: today }),
                ]);
                if (e1 || e2) throw e1 ?? e2;
                return { dopo: toCents(d1?.saldo), totale: toCents(d2?.saldo), righe: Number(d2?.entry_count) || 0 };
              }, null as { dopo: number; totale: number; righe: number } | null),
            ]);
            let opening = resolveOpeningBalance(banche, []);
            // Senza conti, come il Previsionale: il saldo è quello della prima nota.
            if (!banche.length && dopo && dopo.righe > 0)
              opening = { cents: dopo.totale, source: "prima-nota", updatedAt: today };
            return { opening, dopo: dopo?.dopo ?? null };
          })();

      const manuali = futuro
        ? facoltativo("Voci manuali CdG", () =>
            allPaymentRows<VoceManualeRendiconto>((from, to) =>
              db
                .from("cg_cash_flow_manuali")
                .select("id,anno,mese,tipo,categoria,descrizione,importo,ricorrente")
                .eq("company_id", companyId)
                .gte("anno", annoOggi)
                .lte("anno", anno)
                .order("id")
                .range(from, to),
            ), [] as VoceManualeRendiconto[])
        : Promise.resolve([] as VoceManualeRendiconto[]);

      const mutui = futuro
        ? facoltativo("Mutui", async () => {
            const { data, error } = await db
              .from("cg_loans")
              .select("id,banca,descrizione,capitale_residuo,tasso_pct,rata_mensile,data_inizio,data_fine,is_active")
              .eq("company_id", companyId)
              .eq("is_active", true);
            if (error) throw error;
            return (data ?? []) as MutuoCG[];
          }, [] as MutuoCG[])
        : Promise.resolve([] as MutuoCG[]);

      const [righe, dataset, storico, vociManuali, finanziamenti] = await Promise.all([
        primaNota,
        previsione,
        saldoStorico,
        manuali,
        mutui,
      ]);

      const registrati: MovimentoRegistrato[] = righe.map((r) => ({
        id: r.id,
        direction: r.direction,
        amount: r.amount,
        entry_date: r.entry_date,
        category: r.category,
        description: r.description,
        costCategory: r.cost?.category ?? null,
        installmentType: r.installment?.type ?? null,
        supplierId: r.supplier_id,
        supplierName: r.supplier?.name ?? null,
        orderItemId: r.order_item_id,
        invoiceId: r.invoice_id,
        documentoFiscaleId: r.documento_fiscale_id,
        installmentId: r.installment_id,
        orderId: r.order_id,
      }));

      const opening = dataset?.opening ?? storico?.opening ?? { cents: null, source: "nessuna" as const, updatedAt: null };
      return {
        today,
        saldoOggiCents: opening.cents,
        saldoFonte: opening.source,
        saldoAggiornatoAl: opening.updatedAt,
        registrati,
        flussoDopoAnnoCents: storico ? storico.dopo : null,
        previsti: dataset?.movements ?? null,
        manuali: vociManuali,
        mutui: finanziamenti,
        fontiNonLette: [...(dataset?.issues ?? []), ...fontiNonLette].sort(),
      };
    },
  });
}
