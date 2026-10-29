import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn(), download: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: api.from, storage: { from: () => ({ upload: api.upload, download: api.download }) } } }));
import { computoCloudAttivo, ConflittoComputoCloud, improntaComputo, leggiComputoCloud, percorsoAllegatoComputo, preparaAllegatiCloud, salvaComputoCloud } from "@/lib/computo/cloudComputo";
import { bozzaVuota } from "@/lib/computo/editorNativo";
import { caricaAllegatoLocale, leggiAllegatoLocale } from "@/lib/computo/allegatiLocali";
import { DEMO_COMPANY_2_ID as company } from "@/lib/constants/demoCompany";
const id = "e2f3c53c-14b2-4e29-b68f-5dafcbb4acbd";
beforeAll(() => { vi.stubGlobal("Blob", NodeBlob); vi.stubGlobal("crypto", webcrypto); });
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { vi.clearAllMocks(); api.upload.mockResolvedValue({ error: null }); });
function table(result: unknown) {
  const chain = { insert: vi.fn(), update: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() };
  for (const key of ["insert", "update", "select", "eq"] as const) chain[key].mockReturnValue(chain);
  chain.single.mockResolvedValue(result); chain.maybeSingle.mockResolvedValue(result); api.from.mockReturnValue(chain); return chain;
}
describe("computo nel gestionale per ogni azienda", () => {
  it("si attiva per ogni azienda con un identificativo valido", () => {
    expect(computoCloudAttivo(company)).toBe(true);
    expect(computoCloudAttivo(undefined)).toBe(false);
    expect(computoCloudAttivo("altra-azienda")).toBe(false); // non è un identificativo
    expect(computoCloudAttivo("2bcf5b54-858b-42f4-8aab-6a13b8d6587f")).toBe(true); // ogni azienda, non solo Demo 2
  });
  it("rifiuta altri tenant e percorsi non UUID prima di contattare Supabase", async () => {
    await expect(leggiComputoCloud("altra-azienda", id)).rejects.toThrow(/non riconosciuti/);
    expect(() => percorsoAllegatoComputo(company, "../altro", id)).toThrow();
    expect(() => percorsoAllegatoComputo(company, id, "../altro")).toThrow();
    expect(api.from).not.toHaveBeenCalled();
  });
  it("conserva dati e IVA con revisione iniziale", async () => {
    const t = table({ data: { id, revision: 1, updated_at: "2026-10-28" }, error: null });
    const bozza = { ...bozzaVuota(), ivaModalita: "applicata" as const, ivaAliquota: "10" };
    const result = await salvaComputoCloud(company, id, "scope", bozza, 0);
    expect(result.bozza.ivaAliquota).toBe("10"); expect(t.insert).toHaveBeenCalledWith(expect.objectContaining({ company_id: company, revision: 1, payload: expect.objectContaining({ ivaAliquota: "10" }) }));
  });
  it("aggiorna solo la revisione letta, mai con upsert", async () => {
    const t = table({ data: { id, revision: 3 }, error: null });
    await salvaComputoCloud(company, id, "scope", bozzaVuota(), 2);
    expect(t.eq).toHaveBeenCalledWith("revision", 2); expect(t.update).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }));
  });
  it.each([{ data: null, error: null }, { data: null, error: { code: "23505" } }])("segnala un conflitto senza sovrascrivere", async result => {
    table(result); await expect(salvaComputoCloud(company, id, "scope", bozzaVuota(), 1)).rejects.toBeInstanceOf(ConflittoComputoCloud);
  });
  it("carica anche gli allegati esclusi dal PDF e tollera solo duplicati immutabili", async () => {
    const scope = crypto.randomUUID(); const meta = await caricaAllegatoLocale(scope, new NodeFile(["test"], "tavola.pdf", { type: "application/pdf" }) as unknown as File, "planimetria");
    table({ data: { id, revision: 1 }, error: null }); api.upload.mockResolvedValue({ error: { statusCode: "409" } });
    await salvaComputoCloud(company, id, scope, { ...bozzaVuota(), allegati: [{ ...meta, includi: false }] }, 0);
    expect(api.upload).toHaveBeenCalledWith(percorsoAllegatoComputo(company, id, meta.id), expect.anything(), { contentType: "application/pdf", upsert: false });
  });
  it("non conferma i dati se un file manca", async () => {
    const scope = crypto.randomUUID(); const meta = await caricaAllegatoLocale(scope, new NodeFile(["test"], "foto.jpg", { type: "image/jpeg" }) as unknown as File, "foto");
    await expect(salvaComputoCloud(company, id, "altro-scope", { ...bozzaVuota(), allegati: [meta] }, 0)).rejects.toThrow(/mancante/);
    expect(api.from).not.toHaveBeenCalled();
  });
  it("recupera file e metadati in una cache completamente vuota", async () => {
    const scope = crypto.randomUUID(); const meta = await caricaAllegatoLocale(scope, new NodeFile(["test"], "tavola.pdf", { type: "application/pdf" }) as unknown as File, "planimetria");
    api.download.mockResolvedValue({ data: new NodeBlob(["test"], { type: "application/pdf" }), error: null });
    const fresh = crypto.randomUUID(); await preparaAllegatiCloud(company, id, fresh, { ...bozzaVuota(), allegati: [meta] });
    expect((await leggiAllegatoLocale(fresh, meta.id))?.size).toBe(4); expect(api.download).toHaveBeenCalledOnce();
  });
  it("non ripristina file parziali se il download fallisce", async () => {
    const scope = crypto.randomUUID(); const meta = await caricaAllegatoLocale(scope, new NodeFile(["test"], "tavola.pdf", { type: "application/pdf" }) as unknown as File, "planimetria");
    api.download.mockResolvedValue({ data: null, error: { message: "offline" } });
    const fresh = crypto.randomUUID(); await expect(preparaAllegatiCloud(company, id, fresh, { ...bozzaVuota(), allegati: [meta] })).rejects.toThrow(/Recupero/);
    expect(await leggiAllegatoLocale(fresh, meta.id)).toBeNull();
  });
  it("l'impronta rileva una modifica IVA", async () => {
    expect(await improntaComputo(bozzaVuota())).not.toBe(await improntaComputo({ ...bozzaVuota(), ivaAliquota: "10" }));
  });
});
