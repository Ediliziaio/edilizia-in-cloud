/**
 * useBatchCarico — wrapper RPC `batch_carico_from_scans`.
 *
 * Riusato da CaricoRapidoSheet (MP2) e da MP3 per scarico atomico.
 * Invalida warehouse + scan_events queries on success.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";

export interface BatchCaricoInput {
  warehouseId: string;
  supplierId: string | null;
  entries: BatchScanEntry[];
  ddtRicezioneId?: string | null;
  notes?: string;
}

export interface BatchCaricoResult {
  created_movements: number;
  created_units: number;
  updated_items: number;
  errors: Array<{ stock_item_id?: string; serial_number?: string; error: string }>;
}

/** Trasforma le BatchScanEntry nel payload JSONB atteso dall'RPC. */
function entriesToScansPayload(entries: BatchScanEntry[]) {
  return entries
    .filter((e) => e.stockItemId !== null) // entries no-match vanno escluse
    .map((e) => ({
      stock_item_id: e.stockItemId,
      quantity: e.quantity,
      serial_numbers: e.serialNumbers.length > 0 ? e.serialNumbers : null,
      raw_code: e.rawCode,
      scan_format: e.scanFormat ?? null,
      offline_client_uuid: e.clientUuid,
    }));
}

export function useBatchCarico() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: BatchCaricoInput): Promise<BatchCaricoResult> => {
      const payload = entriesToScansPayload(input.entries);
      if (payload.length === 0) {
        throw new Error("Nessuna entry valida da caricare");
      }
      const { data, error } = await supabase.rpc("batch_carico_from_scans", {
        p_warehouse_id: input.warehouseId,
        p_supplier_id: input.supplierId,
        p_scans: payload,
        p_ddt_ricezione_id: input.ddtRicezioneId ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      // L'RPC ritorna TABLE → array di 1 riga
      const row = (Array.isArray(data) ? data[0] : data) as BatchCaricoResult | undefined;
      return (
        row ?? {
          created_movements: 0,
          created_units: 0,
          updated_items: 0,
          errors: [],
        }
      );
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.unitsAll });
      const errCount = res.errors?.length ?? 0;
      if (errCount > 0) {
        toast.warning(
          `Caricati ${res.created_movements} articoli con ${errCount} ${errCount === 1 ? "errore" : "errori"}`,
          { description: "Controlla i dettagli nel pannello errori." },
        );
      } else {
        toast.success(`Caricati ${res.created_movements} articoli`, {
          description: `${res.created_units} seriali registrati`,
        });
      }
    },
    onError: (err: Error) => {
      toast.error("Errore carico batch", { description: err.message });
    },
  });
}
