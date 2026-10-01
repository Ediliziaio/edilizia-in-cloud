import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { valoreUscita } from "@/hooks/warehouse/useWarehouseUscita";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20281001130000_costo_materiali_magazzino_nel_margine.sql"),
  "utf8",
);

describe("Materiali da magazzino nel margine commessa", () => {
  it("fotografa automaticamente il costo unitario su ogni movimento", () => {
    expect(migration).toContain("warehouse_movement_snapshot_unit_cost");
    expect(migration).toMatch(/before insert on public\.warehouse_movements/i);
    expect(migration).toMatch(/if new\.unit_cost is null/i);
    expect(migration).toMatch(/new\.company_id is null or ws\.company_id = new\.company_id/i);
  });

  it("tratta i carichi sulla commessa come resi e non duplica gli ODA collegati", () => {
    expect(migration).toMatch(/when 'carico' then -wm\.quantity/i);
    expect(migration).toMatch(/poi\.order_item_id = wm\.order_item_id/i);
    expect(migration).toMatch(/po2\.order_id = wm\.order_id/i);
  });

  it("espone consumi e movimenti senza costo nella fonte canonica", () => {
    expect(migration).toContain("costo_materiali_magazzino");
    expect(migration).toContain("movimenti_magazzino_senza_costo");
    expect(migration).toMatch(/coalesce\(po\.costo_acquisti[\s\S]*\+ coalesce\(wh\.costo_materiali_magazzino/i);
    expect(migration).toMatch(/alter view public\.v_ordine_marginalita set \(security_invoker = true\)/i);
  });

  it("accoda le colonne nuove senza rinominare quelle già pubblicate dalla vista", () => {
    const select = migration.split("create or replace view public.v_ordine_marginalita as")[1].split("from public.orders o")[0];
    expect(select.indexOf("as costo_diretto")).toBeLessThan(select.indexOf("as costo_materiali_magazzino"));
    expect(select.indexOf("as costo_materiali_magazzino")).toBeLessThan(select.indexOf("as movimenti_magazzino_senza_costo"));
    expect(select.indexOf("as movimenti_magazzino_senza_costo")).toBeLessThan(select.indexOf("as percentuale_avanzamento"));
  });

  it("calcola il valore dell'uscita da imponibile o quantità per prezzo", () => {
    expect(valoreUscita([
      { descrizione: "Cemento", quantita: 2, imponibile: 18 },
      { descrizione: "Colla", quantita: 3, prezzo_unitario: 4 },
    ])).toBe(30);
  });
});
