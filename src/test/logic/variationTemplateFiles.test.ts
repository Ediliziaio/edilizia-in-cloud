import { beforeEach, describe, expect, it, vi } from "vitest";
import { archiveVariationFile, checkVariationFile, downloadVariationFile, listVariationFiles, uploadVariationFile, validateVariationPdf, variationFilePath, variationPackageName, type VariationTemplateFile } from "@/lib/orders/variationTemplateFiles";
const mock = vi.hoisted(() => ({ responses: [] as unknown[], from: vi.fn(), upload: vi.fn(), remove: vi.fn(), download: vi.fn(), calls: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => mock.from(...args), storage: { from: () => ({ upload: mock.upload, remove: mock.remove, download: mock.download }) } } }));
const company = "d2000000-0000-4000-a000-000000000002", template = "11111111-1111-4111-a111-111111111111", id = "22222222-2222-4222-a222-222222222222";
const row: VariationTemplateFile = { id, company_id: company, template_id: template, storage_path: `${company}/${template}/${id}.pdf`, file_name: "scheda.pdf", file_size: 8, is_active: true, created_at: "2026-10-14" };
const file = { name: "scheda.pdf", size: 8, slice: () => ({ text: async () => "%PDF-" }) } as unknown as File;
beforeEach(() => {
  vi.clearAllMocks(); mock.responses = []; mock.calls = [];
  vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
  mock.from.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order", "insert", "update"]) chain[name] = (...args: unknown[]) => { mock.calls.push([name, ...args]); return chain; };
    for (const name of ["limit", "single", "maybeSingle"]) chain[name] = () => Promise.resolve(mock.responses.shift());
    return chain;
  });
  mock.upload.mockResolvedValue({ data: { path: row.storage_path }, error: null }); mock.remove.mockResolvedValue({ error: null });
});
describe("Allegati privati del modello", () => {
  it("valida PDF, dimensioni e percorso azienda/modello", async () => {
    await expect(validateVariationPdf(file)).resolves.toBeUndefined();
    await expect(validateVariationPdf({ ...file, size: 11 * 1024 * 1024 } as File)).rejects.toThrow("10 MB");
    await expect(validateVariationPdf({ ...file, name: "a.html" } as File)).rejects.toThrow("PDF");
    await expect(validateVariationPdf({ ...file, slice: () => ({ text: async () => "wrong" }) } as unknown as File)).rejects.toThrow("valido");
    expect(() => variationFilePath("../altro", template, id)).toThrow();
    expect(() => checkVariationFile({ ...row, storage_path: "foreign/file.pdf" }, company, template)).toThrow();
    expect(() => checkVariationFile({ ...row, is_active: false }, company, template)).toThrow();
  });
  it("legge solo azienda, modello e attivi; non accetta righe estranee", async () => {
    mock.responses = [{ data: [row], error: null }]; expect(await listVariationFiles(company, template)).toEqual([row]);
    expect(mock.calls).toContainEqual(["eq", "company_id", company]); expect(mock.calls).toContainEqual(["eq", "template_id", template]);
    mock.responses = [{ data: [{ ...row, company_id: template }], error: null }]; await expect(listVariationFiles(company, template)).rejects.toThrow();
  });
  it("carica senza sovrascrivere e richiede ricevuta completa", async () => {
    mock.responses = [{ data: [], error: null }, { data: row, error: null }]; expect(await uploadVariationFile(company, template, file)).toEqual(row);
    expect(mock.upload).toHaveBeenCalledWith(row.storage_path, file, { contentType: "application/pdf", upsert: false }); expect(mock.remove).not.toHaveBeenCalled();
  });
  it("risposta persa ma commit verificato: non cancella e non duplica", async () => {
    mock.responses = [{ data: [], error: null }, { data: null, error: new Error("timeout") }, { data: row, error: null }];
    expect(await uploadVariationFile(company, template, file)).toEqual(row); expect(mock.upload).toHaveBeenCalledOnce(); expect(mock.remove).not.toHaveBeenCalled();
  });
  it("fallimento certo compensa solo il nuovo percorso; esito incerto non elimina", async () => {
    mock.responses = [{ data: [], error: null }, { data: null, error: {} }, { data: null, error: null }];
    await expect(uploadVariationFile(company, template, file)).rejects.toThrow("annullato"); expect(mock.remove).toHaveBeenCalledWith([row.storage_path]);
    mock.remove.mockClear(); mock.responses = [{ data: [], error: null }, { data: null, error: {} }, { data: null, error: {} }];
    await expect(uploadVariationFile(company, template, file)).rejects.toThrow("incerto"); expect(mock.remove).not.toHaveBeenCalled();
  });
  it("rimozione archivia senza cancellare Storage; download controlla integrità", async () => {
    mock.responses = [{ data: { id }, error: null }]; await archiveVariationFile(row, company, template);
    expect(mock.calls).toContainEqual(["update", { is_active: false }]); expect(mock.remove).not.toHaveBeenCalled();
    mock.download.mockResolvedValue({ data: new Blob(["%PDF-123"]), error: null }); expect((await downloadVariationFile(row, company, template)).size).toBe(8);
    mock.download.mockResolvedValue({ data: new Blob(["short"]), error: null }); await expect(downloadVariationFile(row, company, template)).rejects.toThrow("incompleto");
  });
  it("ZIP nomi sicuri e univoci anche per allegati omonimi", () => {
    expect(variationPackageName("../../evil.pdf", 1)).not.toContain("/");
    expect(variationPackageName("a.pdf", 1)).not.toBe(variationPackageName("a.pdf", 2));
  });
});
