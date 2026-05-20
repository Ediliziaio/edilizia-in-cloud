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

// ─────────────────────────────────────────────────────────────────────────────
// Order-item link: assegnazione seriali a una RIGA commessa specifica
// ─────────────────────────────────────────────────────────────────────────────

/** Lista seriali assegnati (riservati o consegnati) a una specifica riga commessa. */
export function useStockUnitsByOrderItem(orderItemId: string | undefined) {
  return useQuery<StockUnit[]>({
    queryKey: ["warehouse", "stock-units-by-order-item", orderItemId],
    enabled: !!orderItemId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_units")
        .select("*")
        .or(`reserved_order_item_id.eq.${orderItemId},delivered_order_item_id.eq.${orderItemId}`)
        .order("serial_number", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as StockUnit[];
    },
  });
}

export interface AssignSerialsResult {
  assigned: StockUnit[];
  notFound: string[];      // seriali non trovati in stock
  alreadyReserved: { serial: string; reservedToOrderId: string | null }[];
}

/**
 * Assegna N seriali a una riga commessa.
 * Per ogni serial:
 *  - cerca stock_units WHERE serial_number=? AND status='available'
 *  - UPDATE status='reserved', reserved_order_id, reserved_order_item_id
 * Restituisce: lista assegnati + non trovati + già riservati altrove (per UI feedback).
 *
 * Atomicità: ogni update è independent; se uno fallisce gli altri continuano.
 * Per garanzia transazionale serve RPC server-side (future improvement).
 */
export function useAssignSerialsToOrderItem() {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();

  return useMutation<
    AssignSerialsResult,
    Error,
    { orderId: string; orderItemId: string; serials: string[] }
  >({
    mutationFn: async ({ orderId, orderItemId, serials }) => {
      if (!effectiveCompany?.id) throw new Error("Nessuna azienda attiva");
      if (serials.length === 0) {
        return { assigned: [], notFound: [], alreadyReserved: [] };
      }
      const clean = Array.from(
        new Set(serials.map((s) => s.trim()).filter(Boolean)),
      );

      // Lookup batch dei seriali nello stock corrente
      const { data: foundUnits, error: lookupErr } = await supabase
        .from("stock_units")
        .select("id, serial_number, status, reserved_order_id, stock_item_id")
        .eq("company_id", effectiveCompany.id)
        .in("serial_number", clean);
      if (lookupErr) throw lookupErr;

      const foundMap = new Map(
        ((foundUnits ?? []) as Array<{
          id: string;
          serial_number: string;
          status: string;
          reserved_order_id: string | null;
          stock_item_id: string;
        }>).map((u) => [u.serial_number, u]),
      );

      const notFound: string[] = [];
      const alreadyReserved: { serial: string; reservedToOrderId: string | null }[] = [];
      const toAssign: string[] = [];

      for (const serial of clean) {
        const unit = foundMap.get(serial);
        if (!unit) {
          notFound.push(serial);
          continue;
        }
        if (
          unit.status !== "available" &&
          unit.reserved_order_id !== orderId
        ) {
          alreadyReserved.push({
            serial,
            reservedToOrderId: unit.reserved_order_id,
          });
          continue;
        }
        toAssign.push(unit.id);
      }

      // Update batch (filtro su id già verificati)
      let assigned: StockUnit[] = [];
      if (toAssign.length > 0) {
        const { data: updated, error: updateErr } = await supabase
          .from("stock_units")
          .update({
            status: "reserved",
            reserved_order_id: orderId,
            reserved_order_item_id: orderItemId,
          })
          .in("id", toAssign)
          .select();
        if (updateErr) throw updateErr;
        assigned = (updated ?? []) as unknown as StockUnit[];
      }

      return { assigned, notFound, alreadyReserved };
    },
    onSuccess: (result, vars) => {
      qc.invalidateQueries({
        queryKey: ["warehouse", "stock-units-by-order-item", vars.orderItemId],
      });
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      // Toast riassuntivo (chi consuma può sovrascrivere via onSuccess locale)
      const n = result.assigned.length;
      if (n > 0) {
        toast.success(
          `${n} ${n === 1 ? "seriale assegnato" : "seriali assegnati"} alla commessa`,
        );
      }
      if (result.notFound.length > 0) {
        toast.warning(
          `${result.notFound.length} seriali non trovati in magazzino`,
        );
      }
      if (result.alreadyReserved.length > 0) {
        toast.warning(
          `${result.alreadyReserved.length} seriali già assegnati ad altre commesse`,
        );
      }
    },
    onError: (e) => toast.error(e.message || "Errore assegnazione seriali"),
  });
}

/** Libera un seriale dalla riserva (utile se l'utente sbaglia assegnazione). */
export function useUnassignSerial() {
  const qc = useQueryClient();
  return useMutation<StockUnit, Error, { unitId: string }>({
    mutationFn: async ({ unitId }) => {
      const { data, error } = await supabase
        .from("stock_units")
        .update({
          status: "available",
          reserved_order_id: null,
          reserved_order_item_id: null,
        })
        .eq("id", unitId)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as StockUnit;
    },
    onSuccess: (unit) => {
      qc.invalidateQueries({ queryKey: ["warehouse", "stock-units-by-order-item"] });
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.unitsByItem(unit.stock_item_id) });
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      toast.success(`Seriale ${unit.serial_number} liberato`);
    },
    onError: (e) => toast.error(e.message || "Errore"),
  });
}
