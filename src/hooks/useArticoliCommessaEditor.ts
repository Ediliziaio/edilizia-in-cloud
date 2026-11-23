import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { OrderItem, Posizione } from "@/components/orders/OrderItemsList";
import { useAggiungiPosaManodopera } from "@/components/orders/OrdineArticoli";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { OrderItemData } from "@/lib/orderUtils";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { salvaPreparazioneForniture } from "@/lib/orders/salvaPreparazioneForniture";
import { queryKeys } from "@/lib/queryKeys";

interface OrderItemAttachmentData {
  id: string;
  order_item_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
}

export function useDatiArticoliCommessa(id: string | undefined, abilitato: boolean) {
  const { data: orderItems = [], isPending: orderItemsPending, isError: orderItemsError, refetch: refetchArticoli } = useQuery({
    queryKey: ["order-items", id],
    queryFn: async () => {
      return readAllOrderRows<OrderItemData>((da, a) => supabase
        .from("order_items").select("*").eq("order_id", id!).order("position").order("id")
        .range(da, a).returns<OrderItemData[]>());
    },
    enabled: !!id && abilitato,
    staleTime: 120_000,
    gcTime: 10 * 60 * 1000,
  });

  // Allegati degli articoli, in gruppi compatibili con la lunghezza della richiesta.
  const { data: attachments = [], refetch: refetchAttachments, isError: allegatiErrore, isPending: allegatiInCaricamento } = useQuery({
    queryKey: ["order-item-attachments", id],
    queryFn: async () => {
      const itemIds = orderItems.map(item => item.id);
      const gruppi: Promise<OrderItemAttachmentData[]>[] = [];
      for (let offset = 0; offset < itemIds.length; offset += 100) {
        gruppi.push(readAllOrderRows<OrderItemAttachmentData>((da, a) => supabase
          .from("order_item_attachments").select("*").in("order_item_id", itemIds.slice(offset, offset + 100))
          .order("created_at").order("id").range(da, a).returns<OrderItemAttachmentData[]>()));
      }
      return (await Promise.all(gruppi)).flat();
    },
    enabled: abilitato && orderItems.length > 0,
    staleTime: 120_000,
    gcTime: 10 * 60 * 1000,
  });

  const riprova = () => Promise.all([refetchArticoli(), orderItems.length > 0 ? refetchAttachments() : undefined]);
  return { orderItems, orderItemsPending, orderItemsError, attachments, refetchAttachments, allegatiErrore, allegatiInCaricamento, riprova };
}

export function articoliPerEditor(materiali: readonly OrderItemData[], attachments: readonly OrderItemAttachmentData[]): (OrderItem & { id: string })[] {
  const allegatiDi = new Map<string, NonNullable<OrderItem["attachments"]>>();
  for (const att of attachments) {
    const allegati = allegatiDi.get(att.order_item_id) ?? [];
    allegati.push({ id: att.id, file_name: att.file_name, file_url: att.file_url, file_type: att.file_type, file_size: att.file_size });
    allegatiDi.set(att.order_item_id, allegati);
  }
  return materiali.map(item => ({
    id: item.id, name: item.name, description: item.description || undefined,
    quantity: item.quantity, status: item.status as OrderItem['status'], position: item.position,
    supplier_id: item.supplier_id || undefined, purchase_price: item.purchase_price ?? undefined,
    prezzo_fonte: item.prezzo_fonte ?? null,
    prezzo_da_definire: (item as unknown as {prezzo_da_definire?: boolean}).prezzo_da_definire,
    ddt_riga_origine_id: (item as unknown as {ddt_riga_origine_id?: string | null}).ddt_riga_origine_id,
    costo_stimato_iniziale: (item as unknown as {costo_stimato_iniziale?: number | null}).costo_stimato_iniziale,
    preparazione_prezzo: (item as unknown as OrderItem).preparazione_prezzo,
    vat_rate: item.vat_rate ?? undefined, stock_item_id: item.stock_item_id || undefined,
    unit_price: item.unit_price || undefined, discount_percent: item.discount_percent || undefined,
    standard_cost: item.standard_cost || undefined,
    // Aggancio al listino: senza questi tre campi ogni salvataggio dalla commessa
    // (anche un semplice cambio di stato) li riscriveva vuoti.
    article_template_id: item.article_template_id || undefined,
    product_code: item.product_code || undefined,
    categoria: item.categoria || undefined,
    is_paid: item.is_paid ?? undefined, paid_date: item.paid_date || undefined,
    payment_method: item.payment_method || undefined,
    deposit_amount: item.deposit_amount ?? undefined, deposit_paid: item.deposit_paid ?? undefined,
    deposit_paid_date: item.deposit_paid_date || undefined,
    balance_amount: item.balance_amount ?? undefined, balance_paid: item.balance_paid ?? undefined,
    balance_paid_date: item.balance_paid_date || undefined,
    balance_expected_date: item.balance_expected_date || undefined,
    deposit_expected_date: item.deposit_expected_date || undefined,
    // v8.6.35 — Tracking
    delivery_date: item.delivery_date || undefined,
    posizioni: (item as { posizioni?: Posizione[] | null }).posizioni ?? undefined,
    // Colonne della vista per fase (non sono in OrderItemData).
    phase_id: (item as { phase_id?: string | null }).phase_id ?? null,
    unita_misura: (item as { unita_misura?: string | null }).unita_misura ?? null,
    specifiche: (item as { specifiche?: string | null }).specifiche ?? null,
    ...(item.gruppo_id ? {
      gruppo_id: item.gruppo_id, riferimento: item.riferimento ?? null, family_id: item.family_id ?? null,
      axis_selections: item.axis_selections ?? null, misure_preventivo: item.misure_preventivo ?? null,
      misure_da_ordinare: item.misure_da_ordinare ?? null,
      measure_status: item.measure_status ?? null, prezzo_fonte: item.prezzo_fonte ?? null,
    } : {}),
    attachments: allegatiDi.get(item.id) ?? [],
  }));

}

export function useScritturaArticoliCommessa(id: string) {
  const queryClient = useQueryClient();
  const updateSingleItemMutation = useMutation({
    mutationFn: async (item: OrderItem) => {
      if (!item.id) throw new Error("Item ID required");
      const { data, error } = await supabase.from("order_items").update({
        name: item.name, description: item.description || null,
        quantity: item.quantity, status: item.status,
        supplier_id: item.supplier_id || null, purchase_price: item.purchase_price ?? 0,
        vat_rate: item.vat_rate ?? 22,
        is_paid: item.is_paid ?? false, paid_date: item.paid_date || null,
        payment_method: item.payment_method || null,
        deposit_amount: item.deposit_amount ?? 0, deposit_paid: item.deposit_paid ?? false,
        deposit_paid_date: item.deposit_paid_date || null,
        balance_amount: item.balance_amount ?? 0, balance_paid: item.balance_paid ?? false,
        balance_paid_date: item.balance_paid_date || null,
        balance_expected_date: item.balance_expected_date || null,
        deposit_expected_date: item.deposit_expected_date || null,
        // v8.6.35 — Tracking & ODA
        delivery_date: item.delivery_date || null,
        // Magazzino: persiste il legame con la giacenza, altrimenti un articolo
        // "Da Giacenza" salvato dalla commessa torna silenziosamente "Da Fornitore".
        stock_item_id: item.stock_item_id || null,
        // Aggancio listino: link + categoria + baseline standard (€ listino) per
        // il confronto con il costo reale nel controllo di gestione.
        article_template_id: item.article_template_id || null,
        posizioni: (item.posizioni ?? null) as unknown as Json,
        // Una posizione su misura si corregge con le sue misure e la fonte del costo.
        // `riferimento` c'è nel database ma non ancora nei tipi generati: da qui il cast.
        ...((item.gruppo_id ? {
          riferimento: item.riferimento ?? null, axis_selections: (item.axis_selections ?? null) as unknown as Json,
          misure_preventivo: (item.misure_preventivo ?? null) as unknown as Json, measure_status: item.measure_status ?? null,
          specifiche: item.specifiche ?? null, prezzo_fonte: item.prezzo_fonte ?? null,
        } : {}) as object),
        product_code: item.product_code || null,
        categoria: item.categoria || null,
        standard_cost: item.standard_cost ?? 0,
      }).eq("id", item.id).eq("order_id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Modifica non confermata per questo articolo.");
      // Articolo da magazzino già scaricato o installato: la giacenza segue la nuova quantità.
      if (item.stock_item_id) {
        const { error: magazzinoError } = await supabase.rpc("magazzino_allinea_riga", { p_riga: item.id });
        if (magazzinoError) {
          refreshMaterialQueries(queryClient);
          throw new Error(`Articolo salvato, ma la giacenza non si è aggiornata: ${magazzinoError.message}`);
        }
      }
    },
    onSuccess: () => {
      refreshMaterialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["forecast-pending-items"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-supplier-balances"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-installments"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.itemsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.badgeCountsAll });
      toast.success("Articolo aggiornato");
    },
    onError: (error) => {
      toast.error("Errore", {
        description: error instanceof Error ? error.message : "Errore nell'aggiornamento dell'articolo.",
      });
    },
  });

  // Posa dal listino → Manodopera, dalla finestra dell'articolo.
  const addLaborMutation = useAggiungiPosaManodopera(id);

  // Una o più righe, tutte o nessuna: il prelievo dal magazzino scarica la giacenza lì dentro.
  const addItemMutation = useMutation({
    mutationFn: async (nuove: OrderItem[]) => {
      const { data, error } = await supabase.rpc("commessa_aggiungi_voci", { p_commessa: id, p_voci: nuove as unknown as Json });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data) || data.voci_inserite !== nuove.length) {
        throw new Error("Aggiunta degli articoli non confermata.");
      }
    },
    onSuccess: () => {
      refreshMaterialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.itemsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.badgeCountsAll });
      toast.success("Articolo aggiunto");
    },
    onError: (error) => {
      toast.error("Errore", {
        description: error instanceof Error ? error.message : "Impossibile aggiungere l'articolo.",
      });
    },
  });

  const onSalvaForniture = async (righe: OrderItem[], richiesta: string) => {
    await salvaPreparazioneForniture(id, righe, richiesta);
    refreshMaterialQueries(queryClient);
    toast.success("Preparazione salvata");
  };

  return { updateSingleItemMutation, addItemMutation, addLaborMutation, onSalvaForniture };
}
