import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OrderItem } from "@/components/orders/OrderItemsList";
import type { Installment } from "@/lib/orderUtils";
import { parseQuotePaymentPhases } from "@/lib/preventivi/paymentTerms";
import { type BonusLine, parseBonusLines } from "@/lib/orders/bonusFiscali";

/**
 * useQuotePrefill — legge un preventivo (quotes + quote_items) e lo mappa in
 * dati pronti per precompilare la creazione commessa (/azienda/ordini/nuovo).
 *
 * Porta con sé:
 *  - righe (articoli/prezzi/costi/IVA) + "spina misure" dei prodotti su misura;
 *  - FASI DI PAGAMENTO strutturate → rate della commessa (order_installments),
 *    stesso schema `type` (deposit/balance/financing);
 *  - MODALITÀ di pagamento;
 *  - dati CLIENTE del preventivo (per creare/collegare l'anagrafica in commessa).
 */

const SKIP_CATEGORIES = new Set(["subtotale", "sconto", "nota"]);

export interface QuotePrefillClient {
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  fiscalCode: string;
  vatNumber: string;
  contactId: string | null;
}

export interface QuotePrefill {
  description: string;
  quoteNumber: string | null;
  orderItems: OrderItem[];
  paymentMethod: string | null;
  installments: Installment[];
  /** Il preventivo ha un finanziamento (financing_table_id o importo finanziato). */
  hasFinancing: boolean;
  /** Ripartizione tra bonus edilizi decisa in preventivo (vuota se non usata). */
  bonusLines: BonusLine[];
  client: QuotePrefillClient;
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

      // ── Fasi di pagamento del preventivo → rate della commessa ──
      const q = quote as Record<string, unknown>;
      const installments: Installment[] = parseQuotePaymentPhases(q.payment_phases).map((p, idx) => ({
        position: idx,
        label: p.label,
        type: p.type,
        amount: p.amount,
        is_paid: false,
      }));
      const paymentMethod = typeof q.payment_method === "string" ? q.payment_method : null;
      const hasFinancing = (Number(q.financing_amount) || 0) > 0 || q.financing_table_id != null;
      const bonusLines = parseBonusLines(q.bonus_lines);

      const quoteTyped = quote as {
        description?: string | null;
        quote_number?: string | null;
        client_name?: string | null;
        client_email?: string | null;
        client_phone?: string | null;
        client_company?: string | null;
        client_address?: string | null;
        client_fiscal_code?: string | null;
        client_vat_number?: string | null;
        contact_id?: string | null;
      };

      return {
        description: quoteTyped.description ?? "",
        quoteNumber: quoteTyped.quote_number ?? null,
        orderItems,
        paymentMethod,
        installments,
        hasFinancing,
        bonusLines,
        client: {
          name: quoteTyped.client_name ?? "",
          email: quoteTyped.client_email ?? "",
          phone: quoteTyped.client_phone ?? "",
          company: quoteTyped.client_company ?? "",
          address: quoteTyped.client_address ?? "",
          fiscalCode: quoteTyped.client_fiscal_code ?? "",
          vatNumber: quoteTyped.client_vat_number ?? "",
          contactId: quoteTyped.contact_id ?? null,
        },
      };
    },
  });
}
