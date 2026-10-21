/** Reverse charge nel registro IVA (21/10/2026): l'IVA integrata entra nei due lati. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const radice = join(__dirname, "../../..");
const pagina = readFileSync(join(radice, "src/pages/azienda/fatturazione/RegistroIVA.tsx"), "utf8");
const migrazione = readFileSync(join(radice, "supabase/migrations/20281021160000_reverse_charge_ricevute_nel_registro_iva.sql"), "utf8");
const correzione = readFileSync(join(radice, "supabase/migrations/20281021160500_reverse_charge_imponibile_acquisti_una_volta.sql"), "utf8");

describe("registro IVA: reverse charge", () => {
  it("le ricevute N6.x si integrano con l'aliquota della fattura, 22% se non indicata", () => {
    expect(pagina).toContain('String(natura || "").toUpperCase().startsWith("N6")');
    expect(pagina).toContain("Number(doc.aliquota_reverse_charge ?? 22)");
    expect(migrazione).toContain("coalesce(f.aliquota_reverse_charge, 22) AS aliquota_rc");
    expect(migrazione).toContain("LIKE 'N6%'");
  });
  it("fra le vendite con imponibile e imposta, fra gli acquisti solo l'imposta", () => {
    expect(migrazione).toContain("SELECT aliquota, 'I', imponibile, imposta FROM rc");
    expect(correzione).toContain("SELECT aliquota, 0::numeric, imposta FROM rc");
  });
  it("la TD16 conta fra le vendite e la sua IVA anche fra gli acquisti", () => {
    expect(pagina).toContain('"reverse_charge_interno"];');
    expect(pagina).toContain("TIPI_INTEGRAZIONE.includes(doc.tipo)");
  });
  it("l'aliquota si cambia dalla riga, per fattura", () => {
    expect(pagina).toContain("aliquota_reverse_charge: aliquota");
  });
});
