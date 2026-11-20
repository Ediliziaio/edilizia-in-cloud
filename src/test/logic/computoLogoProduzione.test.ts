import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preparaAssetModello } from "@/lib/computo/assetModello";
import { leggiLogoPerPdf, modelloComputoDiSerie, vesteDalModello } from "@/lib/computo/modelloComputo";

const storage = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => storage } } }));

const png = "data:image/png;base64,bG9nbw==";
let logo: Blob;
const bitmap = { width: 400, height: 200, close: vi.fn() };
const fetchLogo = vi.fn();
const decode = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  logo = new Blob(["logo"], { type: "image/png" });
  storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://files.example.test/logo.png" }, error: null });
  fetchLogo.mockImplementation(async (url: string) => {
    if (url.startsWith("blob:")) throw new TypeError("connect-src: blob URL non consentito");
    return { ok: true, blob: async () => logo };
  });
  decode.mockResolvedValue(bitmap);
  vi.stubGlobal("fetch", fetchLogo);
  vi.stubGlobal("createImageBitmap", decode);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(png);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("logo del computo con le restrizioni di produzione", () => {
  it("decodifica direttamente il file autenticato senza effettuare fetch su blob URL", async () => {
    const risultato = await preparaAssetModello({ titolo: "Computo", companyId: "azienda-demo", veste: { ...vesteDalModello(modelloComputoDiSerie()), logoPersonalizzato: "azienda-demo/logo-valido.png" } });
    expect(risultato.veste?.logo).toEqual({ dati: png, formato: "PNG", larghezza: 400, altezza: 200 });
    expect(fetchLogo.mock.calls.map(([url]) => url)).toEqual(["https://files.example.test/logo.png"]);
    expect(decode).toHaveBeenCalledWith(logo);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it("mantiene la lettura dei loghi aziendali da URL", async () => {
    expect(await leggiLogoPerPdf("https://files.example.test/azienda.png")).toMatchObject({ dati: png, larghezza: 400, altezza: 200 });
    expect(fetchLogo).toHaveBeenCalledWith("https://files.example.test/azienda.png");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it("continua a segnalare un logo personalizzato realmente illeggibile", async () => {
    decode.mockRejectedValueOnce(new Error("PNG non valido"));
    await expect(preparaAssetModello({ titolo: "Computo", companyId: "azienda-demo", veste: { ...vesteDalModello(modelloComputoDiSerie()), logoPersonalizzato: "azienda-demo/logo-invalido.png" } })).rejects.toThrow("Logo del modello illeggibile");
  });
  it("libera il bitmap anche quando la conversione del canvas fallisce", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockImplementationOnce(() => { throw new Error("Conversione fallita"); });
    expect(await leggiLogoPerPdf("https://files.example.test/canvas.png")).toBeNull();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
