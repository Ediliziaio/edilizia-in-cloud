/**
 * useBatchCarico — wrapper RPC `batch_carico_from_scans`.
 *
 * Riusato da CaricoRapidoSheet (MP2) e da MP3 per scarico atomico.
 * Invalida warehouse + scan_events queries on success.
 */

import { useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { warehouseRequestStorage, WarehouseRequestSlot, warehouseRequestScope, warehouseCapabilities, warehouseRpc } from "@/lib/magazzino/protocolloMovimenti";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";

export interface CompanyCostInput { date: string; category: string; vat_rate: number; is_paid: boolean; }

export interface BatchCaricoInput {
  companyCost?: CompanyCostInput;
  warehouseId: string;
  supplierId: string | null;
  entries: BatchScanEntry[];
  ddtRicezioneId?: string | null;
  notes?: string;
  /** Sezione/ubicazione di stoccaggio applicata a tutte le righe del carico. */
  sectionId?: string | null;
}

export interface BatchCaricoResult {
  company_cost_id?: string | null;
  company_cost_amount?: number | null;
  created_movements: number;
  created_units: number;
  updated_items: number;
  errors: Array<{ stock_item_id?: string; serial_number?: string; error: string }>;
}

/** Trasforma le BatchScanEntry nel payload JSONB atteso dall'RPC. */
function entriesToScansPayload(entries: BatchScanEntry[], sectionId?: string | null) {
  return entries
    .filter((e) => e.stockItemId !== null) // entries no-match vanno escluse
    .map((e) => ({
      stock_item_id: e.stockItemId,
      quantity: e.quantity,
      serial_numbers: e.serialNumbers.length > 0 ? e.serialNumbers : null,
      raw_code: e.rawCode,
      scan_format: e.scanFormat ?? null,
      offline_client_uuid: e.clientUuid,
      // Entrata merce: prezzo d'acquisto + sezione (additivi, l'RPC li legge se presenti).
      unit_price: e.purchasePrice != null ? e.purchasePrice : null,
      section_id: sectionId ?? null,
    }));
}

export function useBatchCarico() {
  const qc = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const slots = useRef(new Map<string, WarehouseRequestSlot>());

  return useMutation({
    mutationFn: async (input: BatchCaricoInput): Promise<BatchCaricoResult> => {
      const payload = entriesToScansPayload(input.entries, input.sectionId);
      if (payload.length === 0) {
        throw new Error("Nessuna entry valida da caricare");
      }
      if (!effectiveCompany?.id) throw new Error("Seleziona un’azienda.");
      const protocol = await warehouseCapabilities(effectiveCompany.id);
      if (input.companyCost) {
        if (!protocol.atomic_company_cost) throw new Error("Il servizio non supporta ancora carico e costo insieme. Nessuna registrazione eseguita.");
        Object.assign(payload[0], { company_cost: input.companyCost });
      }
      const args = { p_warehouse_id: input.warehouseId, p_supplier_id: input.supplierId,
        p_scans: payload, p_ddt_ricezione_id: input.ddtRicezioneId ?? null, p_notes: input.notes ?? null };
      const scope = warehouseRequestScope(effectiveCompany.id, user?.id, "carico");
      if (!slots.current.has(scope)) slots.current.set(scope, new WarehouseRequestSlot(scope, warehouseRequestStorage()));
      const slot = slots.current.get(scope)!;
      const v2 = protocol.version >= 2 && protocol.idempotent_carichi;
      let data: unknown;
      try {
        const response = await warehouseRpc(v2 ? "warehouse_register_carico_v2" : "batch_carico_from_scans", v2 ? { ...args, p_request_id: slot.request(args) } : args);
        if (response.error) throw response.error;
        data = response.data;
        const result = (Array.isArray(data) ? data[0] : data) as BatchCaricoResult | null;
        if (!result || !Array.isArray(result.errors) || !Number.isInteger(result.created_movements)) throw new Error("Esito del carico non disponibile: controlla i movimenti.");
        if (input.companyCost && (!result.company_cost_id || !/^[0-9a-f-]{36}$/i.test(result.company_cost_id) || typeof result.company_cost_amount !== "number" || result.company_cost_amount <= 0)) throw new Error("Esito del costo non disponibile: verifica la richiesta prima di ripetere il carico.");
        if (v2) slot.succeeded();
      } catch (error) { if (v2) slot.failed(error); throw error; }
      // L'RPC ritorna TABLE → array di 1 riga
      const row = (Array.isArray(data) ? data[0] : data) as BatchCaricoResult | undefined;
      if (!row || !Number.isInteger(row.created_movements) || row.created_movements < 0 || !Array.isArray(row.errors)) {
        throw new Error("Esito del carico non disponibile. Controlla i movimenti prima di ripetere la registrazione.");
      }
      return row;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.unitsAll });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["wh", "valorizzazione"] });
      if (res.company_cost_id) { void qc.invalidateQueries({ queryKey: ["company-costs"] }); }
      const errCount = res.errors?.length ?? 0;
      if (errCount > 0) {
        toast.warning(
          `Caricati ${res.created_movements} articoli con ${errCount} ${errCount === 1 ? "errore" : "errori"}`,
          { description: "Controlla i dettagli nel pannello errori." },
        );
      } else {
        toast.success(res.company_cost_id ? "Carico e costo aziendale registrati" : `Caricati ${res.created_movements} articoli`, {
          description: res.company_cost_id ? `Imponibile ${Number(res.company_cost_amount).toLocaleString("it-IT", {style:"currency",currency:"EUR"})}. Nessun costo duplicato per questa richiesta.` : `${res.created_units} seriali registrati`,
        });
      }
    },
    onError: (err: Error) => {
      toast.error("Errore carico batch", { description: err.message });
    },
  });
}
