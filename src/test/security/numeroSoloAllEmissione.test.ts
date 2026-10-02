// «Se l'ultima fattura emessa è la 73, la prossima è la 74» (02/10/2026, Renova):
// una bozza non ha numero e non ne consuma; il numero lo dà l'emissione.
// Collaudato su dati veri in una transazione annullata: due bozze → contatore fermo
// a 73; prima emissione FPR 74/26, seconda FPR 75/26.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const sql = leggi("supabase/migrations/20281002140000_numero_solo_all_emissione.sql");
const campo = leggi("src/pages/azienda/fatturazione/editor/NumeroDocumentoField.tsx");

describe("numero all'emissione", () => {
  it("documento_crea mette il segnaposto «Bozza XXXXXXXX» e non tocca il contatore", () => {
    expect(sql).toContain("v_numero := 'Bozza ' || upper(substr(replace(v_id::text, '-', ''), 1, 8));");
    expect(sql).toContain("v_prog := 0;");
    const crea = sql.slice(sql.indexOf("create or replace function public.documento_crea"));
    expect(crea).not.toMatch(/documento_numero_nella_serie/);
    // Il solo punto che chiama genera_numero_documento_native è il ramo dei documenti NON fiscali.
    const fiscale = crea.slice(crea.indexOf("v_numero := 'Bozza '"), crea.indexOf("  else\n"));
    expect(fiscale).not.toMatch(/genera_numero_documento_native/);
  });
  it("la ripresa della bozza senza cliente riconosce anche le bozze col segnaposto", () => {
    expect(sql).not.toMatch(/d\.numero not like 'Bozza %'/);
    expect(sql).toContain("'riutilizzata', true");
  });
  it("l'editor non assegna più il numero all'apertura della bozza", () => {
    expect(campo).not.toMatch(/assegna\(null\)/);
    expect(campo).toContain("Bozza (senza numero)");
  });
});
