/**
 * useCreateShipment — wrapper RPC `create_shipment_atomic` (MP3).
 *
 * Scarico cantiere atomico:
 *   - movimenti scarico in warehouse_movements
 *   - decremento giacenza warehouse_stock
 *   - per articoli serializzati: stock_units → status=shipped + delivered_to_order_id
 *   - generazione DDT in bozza (documenti_fiscali tipo='ddt') con righe pre-popolate
 *   - audit scan_events
 *
 * Toast contestuale + invalidation queries warehouse + documenti_fiscali.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";

export interface CreateShipmentInput {
  /** Ordine collegato. Opzionale: DDT può essere generato anche senza ordine
      (per resi, spostamenti tra cantieri, consegne spot). */
  orderId?: string | null;
  warehouseId: string;
  entries: BatchScanEntry[];
  /** Campi opzionali per pre-popolare il DDT. Tutti facoltativi. */
  ddtExtra?: {
    causale_trasporto?: string;
    aspetto_beni?: string;
    numero_colli?: number;
    peso?: string;
    mezzo_trasporto?: string;
    porto?: string;
    vettore?: string;
    indirizzo_consegna?: string;
    note_documento?: string;
  };
}

export interface CreateShipmentResult {
  documento_id: string | null;
  numero_ddt: string | null;
  created_movements: number;
  updated_units: number;
  errors: Array<{ stock_item_id?: string; serial_number?: string; error: string }>;
}

function entriesToScansPayload(entries: BatchScanEntry[]) {
  return entries
    .filter((e) => e.stockItemId !== null)
    .map((e) => ({
      stock_item_id: e.stockItemId,
      quantity: e.quantity,
      serial_numbers: e.serialNumbers.length > 0 ? e.serialNumbers : null,
      raw_code: e.rawCode,
    }));
}

export function useCreateShipment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateShipmentInput): Promise<CreateShipmentResult> => {
      const payload = entriesToScansPayload(input.entries);
      if (payload.length === 0) {
        throw new Error("Nessuna entry valida da scaricare");
      }
      const { data, error } = await supabase.rpc("create_shipment_atomic", {
        p_order_id: input.orderId ?? null,
        p_warehouse_id: input.warehouseId,
        p_scans: payload,
        p_ddt_extra: input.ddtExtra ?? null,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as CreateShipmentResult | undefined;
      return (
        row ?? {
          documento_id: null,
          numero_ddt: null,
          created_movements: 0,
          updated_units: 0,
          errors: [],
        }
      );
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.unitsAll });
      qc.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });

      if (res.numero_ddt) {
        toast.success(`DDT ${res.numero_ddt} creato`, {
          description: `${res.created_movements} righe scaricate · ${res.updated_units} seriali consegnati`,
        });
      } else {
        toast.warning("Nessuna riga scaricata", {
          description: "Verifica le scansioni e riprova.",
        });
      }
      if (res.errors?.length) {
        toast.warning(`${res.errors.length} errori durante lo scarico`, {
          description: "Controlla i dettagli nel pannello.",
        });
      }
    },
    onError: (err: Error) => {
      toast.error("Errore scarico cantiere", { description: err.message });
    },
  });
}
