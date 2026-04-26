/**
 * useStockUnits — gestione unità seriali (stock_units).
 *
 * Una stock_unit è un singolo pezzo fisico con seriale univoco. Si
 * applica a tracking_mode='serialized' (es. pannelli FV, caldaie).
 * Per gli articoli fungibili la giacenza resta su warehouse_stock.quantity.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

export type StockUnitStatus =
  | "available"
  | "reserved"
  | "shipped"
  | "installed"
  | "returned"
  | "defective"
  | "scrapped";

export interface StockUnit {
  id: string;
  stock_item_id: string;
  serial_number: string;
  status: StockUnitStatus;
  warehouse_id: string | null;
  section_id: string | null;
  supplier_id: string | null;
  lotto_id: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  reserved_order_id: string | null;
  delivered_to_order_id: string | null;
  delivered_shipment_id: string | null;
  delivered_at: string | null;
  warranty_start_date: string | null;
  warranty_months: number | null;
  warranty_expires_at: string | null;
  manufacturer_warranty_code: string | null;
  installed_at: string | null;
  installed_at_location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Lista unità seriali per un articolo specifico.
 * Disabilitato finché stockItemId non è valido.
 */
export function useStockUnitsByItem(stockItemId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.warehouse.unitsByItem(stockItemId),
    queryFn: async () => {
      if (!stockItemId) return [] as StockUnit[];
      const { data, error } = await supabase
        .from("stock_units")
        .select("*")
        .eq("stock_item_id", stockItemId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as StockUnit[];
    },
    enabled: !!stockItemId,
    staleTime: 60_000,
  });
}

export interface CreateUnitInput {
  stock_item_id: string;
  serial_number: string;
  supplier_id?: string | null;
  warehouse_id?: string | null;
  section_id?: string | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  warranty_start_date?: string | null;
  warranty_months?: number | null;
  manufacturer_warranty_code?: string | null;
  notes?: string | null;
}

/**
 * Mutations per stock_units: create singolo + updateStatus.
 * I batch carico/scarico li gestisce l'RPC dedicata in MP2/MP3.
 */
export function useStockUnitsMutations() {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async (input: CreateUnitInput) => {
      if (!effectiveCompany?.id) throw new Error("Nessuna azienda attiva");
      const { data, error } = await supabase
        .from("stock_units")
        .insert({
          ...input,
          company_id: effectiveCompany.id,
          status: "available" as const,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as StockUnit;
    },
    onSuccess: (unit) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.unitsByItem(unit.stock_item_id) });
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      toast.success(`Seriale ${unit.serial_number} registrato`);
    },
    onError: (e: Error) => {
      if (e.message?.includes("duplicate key")) {
        toast.error("Seriale già registrato per questa azienda");
      } else {
        toast.error(e.message || "Errore registrazione seriale");
      }
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (input: {
      id: string;
      status: StockUnitStatus;
      extra?: Partial<StockUnit>;
    }) => {
      const { data, error } = await supabase
        .from("stock_units")
        .update({ status: input.status, ...input.extra })
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as StockUnit;
    },
    onSuccess: (unit) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.unitsByItem(unit.stock_item_id) });
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
    },
  });

  return { create, updateStatus };
}
