import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { signVariation } from "../../../supabase/functions/firma-odv-webhook/sign";
import { missingCampoDocument } from "../../../supabase/functions/_shared/campoDocumentGuard";

const input = { token: "00000000-0000-4000-a000-000000000000", firmato_da: "TEST DEMO", firma_data_base64: "data:image/png;base64,iVBORw0KGgoAAA==" };
describe("Approva extra una sola volta", () => {
  it("usa solo la transizione RPC e richiede successo esplicito", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    expect(await signVariation(input, rpc)).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith({ p_token: input.token, p_firma_base64: input.firma_data_base64, p_firmato_da: input.firmato_da });
  });
  it.each([{ success: false }, null, {}])("non spaccia %j per successo", async data => {
    expect(await signVariation(input, vi.fn().mockResolvedValue({ data, error: null }))).toMatchObject({ success: false, status: 409 });
  });
  it("propaga errore DB senza fallback di scrittura", async () => {
    expect(await signVariation(input, vi.fn().mockResolvedValue({ data: null, error: "db" }))).toMatchObject({ success: false, status: 500 });
  });
  it.each([{ firmato_da: "" }, { firmato_da: "x".repeat(201) }, { token: "" }, { firma_data_base64: "ciao" }, { firma_data_base64: "x".repeat(1_000_001) }, { firma_data_base64: "data:image/svg+xml;base64,abc" }])("rifiuta dati malformati %j", async override => {
    const rpc = vi.fn();
    expect(await signVariation({ ...input, ...override }, rpc)).toMatchObject({ success: false, status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("il webhook non scrive un secondo aumento né uno stato incompatibile", () => {
    const source = readFileSync("supabase/functions/firma-odv-webhook/index.ts", "utf8");
    expect(source).not.toContain("increment_order_total");
    expect(source).not.toContain('"approvata"');
    expect(source).toContain('admin.rpc("odv_sign_with_token"');
  });
});
describe("Collaudo: nessuna firma su un titolo vuoto", () => {
  it.each(["collaudo_finale", "verbale_consegna", "accettazione_lavori"])("blocca %s collegato solo all'ordine", categoria => {
    expect(missingCampoDocument("order", categoria)).toBe(true);
    expect(missingCampoDocument("sessione", categoria)).toBe(false);
  });
  it("non cambia le firme dei preventivi né gli ordini generici", () => {
    expect(missingCampoDocument("quote", null)).toBe(false);
    expect(missingCampoDocument("order", null)).toBe(false);
  });
  it.each(["fea-richiedi-firma", "fea-documento-pubblico", "fea-completa-firma"])("protegge anche il server %s", fn => {
    expect(readFileSync(`supabase/functions/${fn}/index.ts`, "utf8")).toContain("missingCampoDocument(");
  });
});
