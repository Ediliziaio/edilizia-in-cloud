/**
 * Drill-down: dettaglio movimenti per (codice voce CE, anno, mese).
 *
 * Usa cg_get_dettaglio_voce_mese_safe (gated dal feature flag).
 * Restituisce:
 *   - meta:           etichette + totale aggregato
 *   - raggruppamento: sub-righe Excel-style per voce_chiave / cliente / dipendente
 *   - righe:          movimenti singoli (fattura, costo, cedolino, cespite…)
 */

import { useQuery } from "@tanstack/react-query";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";
import { supabase } from "@/integrations/supabase/client";

export interface DettaglioRiga {
  id: string;
  source_table: "company_costs" | "bank_transactions" | "prima_nota" | "invoices" | "orders" | "cedolini" | "cespiti";
  data: string;
  descrizione: string;
  controparte: string | null;
  voce_chiave: string | null;
  categoria: string | null;
  importo: number;
}

export interface DettaglioRaggruppamento {
  etichetta: string;
  totale: number;
  count: number;
}

export interface DettaglioVoceMeseResult {
  meta: {
    company_id: string;
    anno: number;
    mese: number | null;
    codice: string;
    label: string;
    totale: number;
    macro_voce: string | null;
    has_cedolini: boolean;
    generato_il: string;
  };
  raggruppamento: DettaglioRaggruppamento[];
  righe: DettaglioRiga[];
}

/** Codici CE per i quali NON ha senso fare drill-down (subtotali / voci stub). */
const CODICI_NO_DRILL = new Set([
  "02", "04", "15",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "L",
]);

export function isDrillDownEnabled(codice: string): boolean {
  return !CODICI_NO_DRILL.has(codice);
}

interface OrderRevenueRow {
  id: string;
  company_id: string;
  created_at: string;
  order_code: string | null;
  description: string | null;
  client_company: string | null;
  client_name: string | null;
  total_amount: number | null;
}

function monthRange(anno: number, mese: number) {
  const start = new Date(Date.UTC(anno, mese - 1, 1));
  const end = new Date(Date.UTC(anno, mese, 1));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function groupByCounterparty(righe: DettaglioRiga[]): DettaglioRaggruppamento[] {
  const grouped = new Map<string, { totale: number; count: number }>();
  for (const riga of righe) {
    const key = riga.controparte ?? "— senza cliente —";
    const current = grouped.get(key) ?? { totale: 0, count: 0 };
    current.totale += riga.importo;
    current.count += 1;
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([etichetta, value]) => ({ etichetta, ...value }))
    .sort((a, b) => b.totale - a.totale);
}

async function getOrderRevenueFallback(
  anno: number,
  mese: number,
): Promise<DettaglioVoceMeseResult | null> {
  const { start, end } = monthRange(anno, mese);
  const { data, error } = await supabase
    .from("orders")
    .select("id, company_id, created_at, order_code, description, client_company, client_name, total_amount")
    .gte("created_at", start)
    .lt("created_at", end)
    .gt("total_amount", 0)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error || !data?.length) return null;

  const righe: DettaglioRiga[] = (data as OrderRevenueRow[]).map((ordine) => {
    const controparte = ordine.client_company || ordine.client_name || null;
    const codiceOrdine = ordine.order_code ?? ordine.id.slice(0, 8);
    return {
      id: ordine.id,
      source_table: "orders",
      data: ordine.created_at,
      descrizione: ordine.description
        ? `${codiceOrdine} · ${ordine.description}`
        : `Commessa ${codiceOrdine}`,
      controparte,
      voce_chiave: "ricavo_commessa",
      categoria: "order",
      importo: Number(ordine.total_amount ?? 0),
    };
  });

  const totale = righe.reduce((acc, riga) => acc + riga.importo, 0);
  const companyId = (data as OrderRevenueRow[])[0]?.company_id ?? "";

  return {
    meta: {
      company_id: companyId,
      anno,
      mese,
      codice: "01",
      label: "Ricavi delle vendite",
      totale,
      macro_voce: null,
      has_cedolini: false,
      generato_il: new Date().toISOString(),
    },
    raggruppamento: groupByCounterparty(righe),
    righe,
  };
}

export function useDettaglioVoceMese(
  anno: number,
  mese: number | null,
  codice: string | null,
) {
  const enabled =
    codice !== null &&
    mese !== null &&
    isDrillDownEnabled(codice);

  return useQuery({
    queryKey: ["cg", "dettaglio-voce-mese", anno, mese, codice] as const,
    enabled,
    queryFn: async (): Promise<DettaglioVoceMeseResult> => {
      const { data, error } = await cgRpc("cg_get_dettaglio_voce_mese_safe", { p_anno: anno, p_mese: mese, p_codice: codice });
      if (error) throw error;
      const result = data as unknown as DettaglioVoceMeseResult;

      if (
        codice === "01" &&
        mese !== null &&
        (!result?.righe?.length || Math.abs(result.meta?.totale ?? 0) < 0.01)
      ) {
        const fallback = await getOrderRevenueFallback(anno, mese);
        if (fallback?.righe.length) return fallback;
      }

      return result;
    },
    staleTime: 60_000,
  });
}
