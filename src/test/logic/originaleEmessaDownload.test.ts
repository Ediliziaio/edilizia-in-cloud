import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leggiOriginaleEmessa, riferimentoOriginale } from "@/lib/fatturazione/originaleEmessaImportata";

const mock = vi.hoisted(() => ({ download: vi.fn(), bucket: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: (bucket: string) => {
  mock.bucket(bucket); return { download: mock.download };
} } } }));
beforeEach(() => { vi.stubGlobal("Blob", NodeBlob); mock.download.mockReset(); mock.bucket.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

function der(tag: number, ...figli: Uint8Array[]): Uint8Array {
  const c = new Uint8Array(figli.reduce((n, f) => n + f.length, 0));
  let pos = 0; for (const f of figli) { c.set(f, pos); pos += f.length; }
  const len = c.length < 128 ? [c.length] : c.length < 256 ? [0x81, c.length] : [0x82, c.length >> 8, c.length & 255];
  return new Uint8Array([tag, ...len, ...c]);
}

describe("Accesso agli originali XML delle emesse", () => {
  it("risolve il riferimento privato nell'azienda selezionata", () => {
    expect(riferimentoOriginale("fatture-xml/az-1/emesse-importate/f.xml", "az-1")).toEqual({ percorso: "az-1/emesse-importate/f.xml" });
  });
  it.each([
    "fatture-xml/az-2/f.xml", "fatture-xml/az-1/../az-2/f.xml", "fatture-xml/az-1//f.xml",
    "fatture-xml/az-1/%2e%2e/f.xml", "fatture-xml/az-1/f.xml?token=1", "fatture-xml/az-1/f\\.xml",
    "http://provider.example/f.xml", "javascript:alert(1)", "https://user:password@provider.example/f.xml",
  ])("blocca il riferimento non sicuro %s", ref => {
    expect(() => riferimentoOriginale(ref, "az-1")).toThrow();
    expect(mock.download).not.toHaveBeenCalled();
  });
  it("scarica il file privato con il client autenticato, senza URL pubblico", async () => {
    const xml = '<?xml version="1.0"?><FatturaElettronica><FatturaElettronicaHeader/><FatturaElettronicaBody/></FatturaElettronica>';
    const blob = new Blob([xml], { type: "application/xml" });
    mock.download.mockResolvedValue({ data: blob, error: null });
    const originale = await leggiOriginaleEmessa("fatture-xml/az-1/emesse-importate/f.xml", "az-1");
    expect(mock.bucket).toHaveBeenCalledWith("fatture-xml");
    expect(mock.download).toHaveBeenCalledExactlyOnceWith("az-1/emesse-importate/f.xml");
    expect(originale).toMatchObject({ file: blob, nome: "f.xml", xml, firmato: false });
  });
  it("non passa a un download pubblico quando storage nega l'accesso", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    mock.download.mockResolvedValue({ data: null, error: new Error("Non autorizzato") });
    await expect(leggiOriginaleEmessa("fatture-xml/az-1/f.xml", "az-1")).rejects.toThrow("Non autorizzato");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rifiuta un allegato HTML invece di mostrarlo come XML originale", async () => {
    mock.download.mockResolvedValue({ data: new Blob(["<html>Login</html>"]), error: null });
    await expect(leggiOriginaleEmessa("fatture-xml/az-1/f.xml", "az-1")).rejects.toThrow("non contiene");
  });
  it("un collegamento del provider HTTPS non riceve credenziali dell'utente", async () => {
    const xml = "<FatturaElettronica><FatturaElettronicaHeader/><FatturaElettronicaBody/></FatturaElettronica>";
    const fetch = vi.fn(async () => new Response(xml)); vi.stubGlobal("fetch", fetch);
    expect((await leggiOriginaleEmessa("https://provider.example/f.xml", "az-1")).xml).toBe(xml);
    expect(fetch).toHaveBeenCalledWith("https://provider.example/f.xml", expect.objectContaining({ credentials: "omit", signal: expect.any(AbortSignal) }));
  });
  it("un P7M mantiene il file firmato e i byte ISO-8859-1 dell'XML estratto", async () => {
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><FatturaElettronica><FatturaElettronicaHeader/><FatturaElettronicaBody><Descrizione>Più lavori</Descrizione></FatturaElettronicaBody></FatturaElettronica>';
    const payload = Uint8Array.from(xml, c => c.charCodeAt(0));
    const oid = (tipo: number) => new Uint8Array([6, 9, 42, 134, 72, 134, 247, 13, 1, 7, tipo]);
    const busta = der(0x30, oid(2), der(0xa0, der(0x30, der(2, new Uint8Array([1])), der(0x31), der(0x30, oid(1), der(0xa0, der(4, payload))), der(0x31))));
    const blob = new Blob([new Uint8Array(busta)]); mock.download.mockResolvedValue({ data: blob, error: null });
    const originale = await leggiOriginaleEmessa("fatture-xml/az-1/f.xml.p7m", "az-1");
    expect(originale.firmato).toBe(true); expect(originale.file).toBe(blob); expect(originale.xml).toBe(xml);
    expect(Array.from(new Uint8Array(await originale.xmlEstratto!.arrayBuffer()))).toEqual(Array.from(payload));
  });
});
