import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OrderItem } from "@/components/orders/OrderItemsList";

/**
 * useQuotePrefill — legge un preventivo (quotes + quote_items) e lo mappa in
 * dati pronti per precompilare la creazione commessa (/azienda/ordini/nuovo).
 *
 * Porta con sé la "spina misure" dei prodotti su misura: per ogni riga con
 * `family_id` valorizzato copia famiglia + assi + misura INIZIALE e imposta
 * measure_status='da_rilevare' (verrà poi rilevata in sopralluogo).
 *
 * Nota: NON precompila il cliente. I preventivi vivono nel modulo marketing e
 * usano `contact_id`/`opportunity_id`, non il `customer_id` della commessa:
 * il mapping cross-modulo è ambiguo, quindi il cliente lo conferma l'utente.
 */

const SKIP_CATEGORIES = new Set(["subtotale", "sconto", "nota"]);

export interface QuotePrefill {
  description: string;
  quoteNumber: string | null;
  orderItems: OrderItem[];
}

export function useQuotePrefill(quoteId: string | null | undefined) {
  return useQuery<QuotePrefill | null>({
    queryKey: ["quote-prefill", quoteId],
    enabled: !!quoteId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!quoteId) return null;

      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .select("id, description, quote_number")
        .eq("id", quoteId)
        .single();
      if (qErr) throw qErr;

      const { data: rows, error: iErr } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quoteId)
        .order("sort_order", { ascending: true });
      if (iErr) throw iErr;

      const orderItems: OrderItem[] = ((rows ?? []) as Array<Record<string, unknown>>)
        .filter((r) => !SKIP_CATEGORIES.has(String(r.item_category ?? "")))
        .map((r, idx): OrderItem => {
          const isCustom = !!r.family_id;
          const mx = r.misura_x as number | null | undefined;
          const my = r.misura_y as number | null | undefined;
          const misurePreventivo =
            mx != null || my != null
              ? {
                  ...(mx != null ? { larghezza: Number(mx) } : {}),
                  ...(my != null ? { altezza: Number(my) } : {}),
                }
              : null;

          return {
            name: String(r.name ?? ""),
            description: (r.description as string | null) ?? undefined,
            quantity: Number(r.quantity) || 1,
            status: "da_ordinare",
            position: idx,
            unit_price: r.unit_price != null ? Number(r.unit_price) : undefined,
            purchase_price: r.prezzo_acquisto != null ? Number(r.prezzo_acquisto) : undefined,
            vat_rate: r.vat_rate != null ? Number(r.vat_rate) : undefined,
            // ── spina misure (solo prodotti su misura) ──
            family_id: isCustom ? (r.family_id as string) : null,
            axis_selections: isCustom ? ((r.axis_selections as Record<string, string> | null) ?? null) : null,
            misure_preventivo: isCustom ? misurePreventivo : null,
            measure_status: isCustom ? "da_rilevare" : null,
          };
        });

      return {
        description: (quote?.description as string | null) ?? "",
        quoteNumber: (quote?.quote_number as string | null) ?? null,
        orderItems,
      };
    },
  });
}
