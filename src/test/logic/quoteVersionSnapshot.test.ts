import { describe, expect, it } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import { parseQuoteVersionSnapshot } from "@/lib/quotes/versionSnapshot";

describe("lettura versioni preventivo dal JSON del database", () => {
  it("mantiene importi storici, decimali, valori null e metadati delle righe", () => {
    const snapshot: { [key: string]: Json | undefined } = {
      quote: { total: 4297.45, subtotal: 3522.5, notes: null, custom_field_values: { riferimento: "Palma" } },
      items: [{ name: "Scavo", quantity: 33.5, unit_price: 54, vat_rate: 22, description: null, line_total: 1809, parent_item_id: "fase-1" }],
      saved_at: "2026-10-17T06:00:00Z",
    };
    expect(parseQuoteVersionSnapshot(snapshot)).toEqual(snapshot);
    expect(parseQuoteVersionSnapshot({ ...snapshot, items: [{ name: "Descrizione", quantity: null, unit_price: null, vat_rate: null }] }).items[0].unit_price).toBeNull();
  });

  it("rifiuta JSON incompleti o importi testuali senza inventare prezzi", () => {
    const invalid: Json[] = [null, [], { quote: {}, items: [], saved_at: "non una data" }, {
      quote: { total: "4.297,45" }, items: [], saved_at: "2026-10-17T06:00:00Z",
    }];
    for (const value of invalid) {
      expect(() => parseQuoteVersionSnapshot(value)).toThrow("dati non leggibili");
    }
  });
});
