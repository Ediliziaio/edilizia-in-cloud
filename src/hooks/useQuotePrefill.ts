import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { prefillDaPreventivo, type QuotePrefill } from "@/lib/preventivi/prefillPreventivo";

export {
  prefillDaPreventivo, righePreventivoPerCommessa, type QuotePrefill, type QuotePrefillClient,
} from "@/lib/preventivi/prefillPreventivo";

/**
 * useQuotePrefill — legge un preventivo (quotes + quote_items) e lo mappa in
 * dati pronti per precompilare la creazione commessa (/azienda/ordini/nuovo).
 * Il conto sta in `prefillDaPreventivo` (src/lib/preventivi/prefillPreventivo.ts),
 * lo stesso che usa il lettore del preventivo di Silvio.
 */
export function useQuotePrefill(quoteId: string | null | undefined) {
  return useQuery<QuotePrefill | null>({
    queryKey: ["quote-prefill", quoteId],
    enabled: !!quoteId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!quoteId) return null;

      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .single();
      if (qErr) throw qErr;

      const { data: rows, error: iErr } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quoteId)
        .order("sort_order", { ascending: true });
      if (iErr) throw iErr;

      return prefillDaPreventivo(quote as Record<string, unknown>, (rows ?? []) as Array<Record<string, unknown>>);
    },
  });
}
