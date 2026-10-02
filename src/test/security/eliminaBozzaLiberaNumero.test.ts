// Eliminare una bozza di fattura restituisce il numero alla serie (02/10/2026).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20281002120000_elimina_bozza_libera_il_numero.sql", "utf8");
const hook = readFileSync("src/hooks/useDocumentiFiscali.ts", "utf8");

describe("documento_elimina_bozza", () => {
  it("mette il segnaposto «Bozza» al posto del numero e riporta il contatore al più alto in uso", () => {
    expect(sql).toContain("numero = 'Bozza ' || upper(left(replace(id::text, '-', ''), 8))");
    expect(sql).toContain("d.numero not like 'Bozza %'");
    expect(sql).toContain("set ultimo_numero_fattura = v_massimo");
  });
  it("non tocca le fatture emesse e controlla i permessi", () => {
    expect(sql).toContain("if v_doc.stato <> 'bozza' and v_doc.stato <> 'annullata' then");
    expect(sql).toContain("user_can_access_company(v_doc.company_id)");
    expect(sql).toContain("puo_gestire_documento_fiscale(v_doc.company_id, v_doc.tipo)");
    expect(sql).toMatch(/revoke all on function public\.documento_elimina_bozza\(uuid\) from public, anon;/);
  });
  it("«Elimina» dall'editor passa da lì per le bozze dei documenti fiscali", () => {
    expect(hook).toContain('"documento_elimina_bozza"');
    expect(hook).toMatch(/stato === "bozza" && tipo &&/);
  });
});
