/**
 * useProcurementAnalysis — dati per l'Analisi Acquisti (P2).
 *
 * Legge SOLO dati esistenti (nessuna migration/edge function):
 *   - vista `supplier_procurement_report` → spesa aggregata per fornitore.
 *   - `purchase_order_items` (+ join PO→fornitore, esclusi gli ordini annullati)
 *     → benchmark prezzi articolo.
 *   - `fatture_ricevute` (colonne essenziali) → spesa da fatture passive.
 *
 * L'aggregazione/benchmark è delegata alle funzioni pure di
 * `@/lib/procurement/spendAnalysis` (testate). Qui solo fetch + coercion.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  computePriceBenchmarks,
  summarizeInvoiceSpend,
  summarizeSupplierSpend,
  totalPotentialSaving,
  type InvoiceSpendRow,
  type PurchaseLine,
  type SupplierSpendRow,
} from "@/lib/procurement/spendAnalysis";

/** Limite righe ordini analizzate (benchmark) — protegge da dataset enormi. */
const MAX_PURCHASE_LINES = 5000;
const MAX_INVOICES = 5000;

interface RawPurchaseItem {
  description: string | null;
  sku: string | null;
  article_template_id: string | null;
  unit_of_measure: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  purchase_orders: {
    supplier_id: string | null;
    issue_date: string | null;
    status: string | null;
    suppliers: { name: string | null } | null;
  } | null;
}

export function useProcurementAnalysis() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const supplierSpendQuery = useQuery({
    queryKey: ["procurement", "supplier-spend", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_procurement_report")
        .select(
          "supplier_id, name, product_category, is_active, is_foreign, purchase_order_count, purchase_order_total, open_due_count, open_due_amount, last_purchase_order_date",
        )
        .eq("company_id", companyId!);
      if (error) throw error;
      return summarizeSupplierSpend((data ?? []) as unknown as SupplierSpendRow[]);
    },
  });

  const benchmarkQuery = useQuery({
    queryKey: ["procurement", "price-benchmark", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(
          "description, sku, article_template_id, unit_of_measure, quantity, unit_price, purchase_orders!inner(supplier_id, issue_date, status, suppliers(name))",
        )
        .eq("company_id", companyId!)
        .limit(MAX_PURCHASE_LINES);
      if (error) throw error;

      const lines: PurchaseLine[] = ((data ?? []) as unknown as RawPurchaseItem[])
        // esclude righe di ordini annullati (allineato alla vista spesa)
        .filter((r) => (r.purchase_orders?.status ?? "") !== "annullato")
        .map((r) => ({
          description: r.description,
          sku: r.sku,
          article_template_id: r.article_template_id,
          unit_of_measure: r.unit_of_measure,
          quantity: r.quantity,
          unit_price: r.unit_price,
          supplier_id: r.purchase_orders?.supplier_id ?? null,
          supplier_name: r.purchase_orders?.suppliers?.name ?? null,
          issue_date: r.purchase_orders?.issue_date ?? null,
        }));

      const benchmarks = computePriceBenchmarks(lines);
      return {
        benchmarks,
        totalSaving: totalPotentialSaving(benchmarks),
        analyzedLines: lines.length,
      };
    },
  });

  const invoiceSpendQuery = useQuery({
    queryKey: ["procurement", "invoice-spend", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatture_ricevute")
        .select(
          "cedente_ragione_sociale, cedente_piva, data_fattura, imponibile_totale, totale_documento, tipo_documento",
        )
        .eq("company_id", companyId!)
        .limit(MAX_INVOICES);
      if (error) throw error;
      return summarizeInvoiceSpend((data ?? []) as unknown as InvoiceSpendRow[]);
    },
  });

  return {
    supplierSpend: supplierSpendQuery.data ?? null,
    benchmark: benchmarkQuery.data ?? null,
    invoiceSpend: invoiceSpendQuery.data ?? null,
    isLoading:
      supplierSpendQuery.isLoading || benchmarkQuery.isLoading || invoiceSpendQuery.isLoading,
    isError: supplierSpendQuery.isError || benchmarkQuery.isError || invoiceSpendQuery.isError,
    error: supplierSpendQuery.error || benchmarkQuery.error || invoiceSpendQuery.error,
  };
}
