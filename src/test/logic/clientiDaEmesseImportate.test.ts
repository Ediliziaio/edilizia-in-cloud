import { describe, expect, it } from "vitest";
import { emailTecnicaClienteImportato, stessaIdentitaFattura } from "../../../supabase/functions/_shared/clienteDaEmessaImportata";
import { datiLavoroDaEmessa } from "@/lib/fatturazione/collegamentiImportate";
import { readFileSync } from "node:fs";

describe("Recupero cliente da fattura importata", () => {
  it("esige identità fiscale e non accetta nomi come identificativo", () => {
    expect(stessaIdentitaFattura({}, {})).toBe(false);
    expect(stessaIdentitaFattura({fiscal_code:"RSSMRA80A01H501U"}, {fiscal_code:" rssmra80a01h501u "})).toBe(true);
    expect(stessaIdentitaFattura({fiscal_code:"RSSMRA80A01H501U"}, {fiscal_code:"ALTRO"})).toBe(false);
    expect(stessaIdentitaFattura({fiscal_code:"CF",vat_number:"IVA"},{fiscal_code:"CF",vat_number:"ALTRA"})).toBe(false);
  });
  it("account shadow deterministico, separato per azienda, senza CF leggibile nella mail", async () => {
    const id = {fiscal_code:"RSSMRA80A01H501U"};
    const a = await emailTecnicaClienteImportato("a",id);
    expect(await emailTecnicaClienteImportato("a",{fiscal_code:" rssmra80a01h501u "})).toBe(a);
    expect(await emailTecnicaClienteImportato("b",id)).not.toBe(a);
    expect(a).not.toContain(id.fiscal_code); expect(a).toMatch(/@no-email\.ediliziaincloud\.local$/);
    expect(a.split("@")[0].length).toBeLessThanOrEqual(64);
  });
  it("prefill lavoro: solo descrizione e provenienza, mai quantità da acquistare o valore contratto", () => {
    const f = {invoice_number:"FPR 64/26",issue_date:"2026-09-08",document_type:"invoice",invoice_lines:[{description:"Seconda riga",sort_order:2},{description:"Acconto 10% impianto",sort_order:1}]};
    const r = datiLavoroDaEmessa(f);
    expect(r.description).toBe("Acconto 10% impianto\nSeconda riga");
    expect(r.internal_notes).toContain("FPR 64/26"); expect(r.internal_notes).toContain("acconto");
    expect(Object.keys(r)).toEqual(["description","internal_notes"]);
  });
  it("RPC: permissioni, isolamento, ruoli customer, nessun contatto/commessa creati e niente sovrascrittura", () => {
    const sql = readFileSync("supabase/migrations/20281009192000_riconciliazione_emesse_importate.sql","utf8");
    expect(sql).toContain("PERFORM public.assert_company_access(p_company_id)");
    expect(sql).toContain("WHERE user_id = auth.uid() AND company_id = p_company_id");
    expect(sql).toContain("r.role = 'customer'"); expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("o.customer_id=cliente AND o.deleted_at IS NULL");
    expect(sql).toContain("FOR UPDATE"); expect(sql).toContain("FROM PUBLIC,anon");
    expect(sql).not.toMatch(/INSERT INTO public\.(orders|marketing_contacts|profiles)/);
    expect(sql).not.toMatch(/SET\s+(total|paid_amount|subtotal|tax_amount)\s*=/);
    expect(sql).toContain("cliente_id=coalesce(cliente_id,cliente)");
    expect(sql).toContain("sync_from_cliente=CASE WHEN cliente_id IS NULL");
  });
  it("descrizioni molto lunghe non bloccano il modulo commessa (limite 1000)",()=>{
    const r=datiLavoroDaEmessa({invoice_number:"1",issue_date:null,document_type:"invoice",invoice_lines:[{description:"a".repeat(2000)}]});
    expect(r.description).toHaveLength(1000);expect(r.internal_notes).toContain("Descrizione abbreviata");
  });
});
