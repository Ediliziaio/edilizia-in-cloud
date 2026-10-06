import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OrderItem } from "@/components/orders/OrderItemsList";
import type { Installment } from "@/lib/orderUtils";
import { parseQuotePaymentPhases } from "@/lib/preventivi/paymentTerms";
import { type BonusLine, parseBonusLines } from "@/lib/orders/bonusFiscali";
import { righeCommessaDaPreventivo } from "../../supabase/functions/_shared/righeCommessaDaPreventivo";

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

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Le righe del preventivo come righe di commessa: lo stesso conto della
 * conversione automatica (converti-preventivo-cantiere), che usa la stessa
 * funzione. Senza opzionali, con lo sconto di riga, e con le quantità decimali
 * portate a 1 × totale (order_items.quantity è un intero).
 */
export function righePreventivoPerCommessa(rows: Array<Record<string, unknown>>): OrderItem[] {
  return righeCommessaDaPreventivo(rows).map((r, idx): OrderItem => ({
    name: r.name,
    description: r.description ?? undefined,
    quantity: r.quantity,
    status: "da_ordinare",
    position: idx,
    unit_price: r.unit_price ?? undefined,
    purchase_price: r.purchase_price,
    vat_rate: r.vat_rate ?? undefined,
    discount_percent: r.discount_percent ?? undefined,
    // ── spina misure (solo prodotti su misura) ──
    family_id: r.family_id,
    axis_selections: r.axis_selections,
    misure_preventivo: r.misure_preventivo,
    measure_status: r.measure_status,
  }));
}

/**
 * Prezzo scritto a mano (21/09/2026): le righe del preventivo restano a 0€
 * per chi non carica il listino, quindi non sommano più all'imponibile vero.
 * Il form di /azienda/ordini/nuovo non precompila mai `total_amount` da
 * questa importazione (lo scrive sempre chi crea la commessa): questa
 * funzione dà comunque un riferimento corretto nella lista voci, invece di
 * righe tutte a 0€ senza spiegazione — stessa riga di aggiustamento della
 * conversione automatica (`converti-preventivo-cantiere`) e dei moduli edili
 * (`convertiInCommessa.ts`). Pura e testabile: nessun accesso a rete.
 */
export function rigaAggiustamentoPrezzoManuale(
  orderItems: Pick<OrderItem, "unit_price" | "quantity">[],
  quote: { prezzo_manuale?: unknown; prezzo_manuale_iva_pct?: unknown; subtotal?: unknown; discount_amount?: unknown },
): OrderItem | null {
  const manuale = Number(quote.prezzo_manuale ?? 0);
  if (!(manuale > 0) || orderItems.length === 0) return null;
  const imponibile = round2(Number(quote.subtotal ?? 0) - Number(quote.discount_amount ?? 0));
  const sommaRighe = round2(
    orderItems.reduce((s, r) => s + (Number(r.unit_price) || 0) * (Number(r.quantity) || 1), 0),
  );
  const differenza = round2(imponibile - sommaRighe);
  if (Math.abs(differenza) < 0.01) return null;
  return {
    name: differenza > 0 ? "Prezzo a corpo" : "Sconto commerciale",
    description: "Differenza tra il prezzo scritto a mano nel preventivo e le righe di dettaglio.",
    quantity: 1,
    status: "da_ordinare",
    position: orderItems.length,
    unit_price: differenza,
    purchase_price: 0,
    vat_rate: Number(quote.prezzo_manuale_iva_pct ?? 0),
  };
}

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

      const orderItems: OrderItem[] = righePreventivoPerCommessa((rows ?? []) as Array<Record<string, unknown>>);

      const q = quote as Record<string, unknown>;

      // Prezzo scritto a mano: le righe sopra sono a 0€, questa riga dà un
      // riferimento corretto (vedi commento sulla funzione più sopra).
      const rigaAggiustamento = rigaAggiustamentoPrezzoManuale(orderItems, q);
      if (rigaAggiustamento) orderItems.push(rigaAggiustamento);

      // ── Fasi di pagamento del preventivo → rate della commessa ──
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
