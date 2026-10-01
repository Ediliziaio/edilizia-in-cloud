import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20281001140000_costi_mezzi_commessa.sql"),
  "utf8",
);

describe("Costi di mobilita e mezzi della commessa", () => {
  it("porta nel margine soltanto i rimborsi km approvati o rimborsati", () => {
    expect(migration).toMatch(/r\.stato in \('approvato', 'rimborsato'\)/i);
    expect(migration).toMatch(/\+ coalesce\(km\.costo_rimborsi_km, 0::numeric\) as consuntivo/i);
    expect(migration).toContain("rimborsi_km_da_approvare");
  });

  it("lascia il costo dei mezzi in una vista gestionale separata", () => {
    expect(migration).toContain("v_ordine_costi_mezzi_stimati");
    expect(migration).toMatch(/costo_annuo[\s\S]*giorni[\s\S]*365::numeric/i);
    expect(migration).toMatch(/security_invoker = true/i);
  });

  it("ripartisce assicurazione, bollo, rate e manutenzioni", () => {
    expect(migration).toMatch(/d\.categoria in \('assicurazione', 'bollo'\)/i);
    expect(migration).toMatch(/m\.rata_mensile[\s\S]*12::numeric/i);
    expect(migration).toMatch(/mm\.data >= p\.oggi - 365/i);
  });
});
