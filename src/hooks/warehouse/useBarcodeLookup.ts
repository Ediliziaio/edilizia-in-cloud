/**
 * useBarcodeLookup — wrapper RPC `warehouse_scan_lookup` con parser GS1
 * + decisione UI cascata.
 *
 * Flow:
 *   1. parser GS1 (se applicabile) estrae primary key (serial > gtin > raw)
 *   2. RPC ritorna array di righe con match_type
 *   3. decideUiAction sceglie l'azione UI da mostrare
 */

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeScanForLookup, type Gs1ParseResult } from "@/lib/barcode/gs1Parser";
import { decideUiAction, type RawMatchRow, type UiAction } from "@/lib/barcode/scanMatchLogic";

export type { UiAction, RawMatchRow } from "@/lib/barcode/scanMatchLogic";

export interface LookupInput {
  rawScan: string;
  supplierId?: string;
  supplierUsesGs1?: boolean;
}

export interface LookupResult {
  rawScan: string;
  parsedPrimary: string;
  gs1Detected: boolean;
  gs1?: Gs1ParseResult;
  rows: RawMatchRow[];
  action: UiAction;
}

/**
 * Mutation hook: scansiona un codice e ritorna l'azione UI da mostrare.
 *
 * Esempio d'uso (in BarcodeScanner / BatchBarcodeScanner):
 *   const lookup = useBarcodeLookup();
 *   const result = await lookup.mutateAsync({ rawScan: code, supplierId, supplierUsesGs1 });
 *   switch (result.action.kind) {
 *     case "accept_unit": ...
 *     case "accept_item": ...
 *     case "confirm_ambiguous": ...
 *     case "offer_create_new": ...
 *   }
 */
export function useBarcodeLookup() {
  return useMutation({
    mutationFn: async (input: LookupInput): Promise<LookupResult> => {
      const norm = normalizeScanForLookup(input.rawScan, input.supplierUsesGs1);

      // v8.6.104 — DUAL LOOKUP per QR fotovoltaico/industriale dove ogni
      // pezzo ha serial UNICO ma GTIN COMUNE per modello. Prima il primo
      // arrivo di un modello nuovo generava 'Codice non riconosciuto' per
      // OGNI scan -> UX disastrosa (30 popup per 30 pannelli).
      // Ora: 1) tenta serial, 2) se vuoto e c'e' GTIN -> retry con GTIN.
      const { data: data1, error: err1 } = await supabase.rpc("warehouse_scan_lookup", {
        p_code: norm.primary,
        p_supplier_id: input.supplierId ?? null,
      });
      if (err1) throw err1;
      let rows = ((data1 ?? []) as unknown as RawMatchRow[]) ?? [];

      if (rows.length === 0 && norm.gs1?.gtin && norm.gs1.gtin !== norm.primary) {
        const { data: data2 } = await supabase.rpc("warehouse_scan_lookup", {
          p_code: norm.gs1.gtin,
          p_supplier_id: input.supplierId ?? null,
        });
        const fallbackRows = (data2 as unknown as RawMatchRow[]) ?? [];
        if (fallbackRows.length > 0) rows = fallbackRows;
      }

      const action = decideUiAction(rows);

      return {
        rawScan: input.rawScan,
        parsedPrimary: norm.primary,
        gs1Detected: !!norm.gs1?.isGs1,
        gs1: norm.gs1,
        rows,
        action,
      };
    },
  });
}
