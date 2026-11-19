/**
 * useReceiveFromOda — wrapper RPC `receive_from_oda_via_scans`.
 *
 * Riceve merce da una ODA via batch scansioni. Aggiorna
 * purchase_order_items.quantity_received + warehouse_movements +
 * warehouse_stock + (se serialized) stock_units + scan_events.
 * Auto-update status ODA a 'ricevuto' o 'parziale'.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { warehouseCapabilities } from "@/lib/magazzino/protocolloMovimenti";
import { useWarehouseOperation } from "./useWarehouseOperations";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";

export interface ReceiveFromOdaInput {
  odaId: string;
  warehouseId: string;
  entries: BatchScanEntry[];
  ddtNumber?: string;
  ddtRicezioneId?: string | null;
}

export interface ReceiveFromOdaResult {
  shipped_items: number;
  created_units: number;
  oda_now_complete: boolean;
  errors: Array<{ stock_item_id?: string; serial_number?: string; error: string }>;
}

function entriesToScansPayload(entries: BatchScanEntry[]) {
  return entries
    .filter((e) => e.stockItemId !== null)
    .map((e) => ({
      stock_item_id: e.stockItemId,
      oda_item_id: e.odaItemId ?? null,
      quantity: e.quantity,
      serial_numbers: e.serialNumbers.length > 0 ? e.serialNumbers : null,
      raw_code: e.rawCode,
      scan_format: e.scanFormat ?? null,
    }));
}

export function useReceiveFromOda() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const operation = useWarehouseOperation("oda-receive");
  const flight = useRef(false);

  return useMutation({
    mutationFn: async (input: ReceiveFromOdaInput): Promise<ReceiveFromOdaResult> => {
      const payload = entriesToScansPayload(input.entries);
      if (payload.length === 0) {
        throw new Error("Nessuna entry valida da ricevere");
      }
      if (!effectiveCompany?.id) throw new Error("Seleziona un’azienda.");
      if (flight.current) throw new Error("Ricezione già in corso.");
      flight.current = true;
      try {
      const args = {
        p_oda_id: input.odaId, p_warehouse_id: input.warehouseId, p_scans: payload,
        p_ddt_number: input.ddtNumber ?? null, p_ddt_ricezione_id: input.ddtRicezioneId ?? null,
      };
      const capabilities = await warehouseCapabilities(effectiveCompany.id);
      const { data, error } = capabilities.idempotent_oda_receipts
        ? { data: await operation.mutateAsync({ rpc: "warehouse_receive_oda_v3", payload: args }), error: null }
        : await supabase.rpc("receive_from_oda_via_scans", args);
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as ReceiveFromOdaResult | undefined;
      if (!row || !Number.isSafeInteger(row.shipped_items) || row.shipped_items < 0
        || !Number.isSafeInteger(row.created_units) || row.created_units < 0
        || typeof row.oda_now_complete !== "boolean" || !Array.isArray(row.errors)) {
        throw new Error("Esito della ricezione non verificato. Controlla l’ODA e i movimenti prima di riprovare.");
      }
      return row;
      } finally { flight.current = false; }
    },
    onSuccess: (res, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.unitsAll });
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(input.odaId) });
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(input.odaId) });

      if (res.shipped_items === 0 && res.errors.length) {
        toast.warning("Nessuna riga ricevuta", { description: "Controlla gli errori prima di riprovare." });
      } else if (res.oda_now_complete) {
        toast.success("ODA completata", {
          description: `${res.shipped_items} righe ricevute · ${res.created_units} seriali`,
        });
      } else {
        toast.success(`Ricezione parziale (${res.shipped_items} righe)`, {
          description: "L'ODA resta in stato parziale.",
        });
      }
      if (res.errors?.length) {
        toast.warning(`${res.errors.length} errori durante la ricezione`, {
          description: "Controlla i dettagli nel pannello.",
        });
      }
    },
    onError: (err: Error) => {
      toast.error("Errore ricezione ODA", { description: err.message });
    },
  });
}
