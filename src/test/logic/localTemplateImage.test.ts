import { afterEach, describe, expect, it, vi } from "vitest";

const riduzione = vi.hoisted(() => ({ esito: null as Blob | Error | null, chiamate: [] as unknown[][] }));
vi.mock("@/lib/campo/compressImage", () => ({
  compressImage: async (...args: unknown[]) => {
    riduzione.chiamate.push(args);
    if (riduzione.esito instanceof Error) throw riduzione.esito;
    return riduzione.esito;
  },
}));
import { readLocalTemplateImage } from "@/lib/moduli-vendita/localTemplateImage";

const foto = (byte: number, type = "image/jpeg") => new File([new Uint8Array(byte)], "foto", { type });
afterEach(() => { riduzione.esito = null; riduzione.chiamate = []; });

describe("immagini dei modelli", () => {
  it("riduce una foto pesante del telefono invece di rifiutarla", async () => {
    riduzione.esito = new Blob([new Uint8Array(300_000)], { type: "image/jpeg" });
    const url = await readLocalTemplateImage(foto(4_000_000));
    expect(url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(url.length).toBeLessThan(500_000);
    expect(riduzione.chiamate[0].slice(1)).toEqual([1600, 0.8]);
  });
  it("lascia intatto un logo PNG piccolo, con la sua trasparenza", async () => {
    const url = await readLocalTemplateImage(foto(50_000, "image/png"));
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(riduzione.chiamate).toHaveLength(0);
  });
  it("se la riduzione non riesce accetta solo un'immagine già leggera", async () => {
    riduzione.esito = new Error("canvas");
    await expect(readLocalTemplateImage(foto(800_000))).resolves.toMatch(/^data:image\/jpeg/);
    await expect(readLocalTemplateImage(foto(3_000_000))).rejects.toThrow("sotto 1 MB");
  });
  it("rifiuta formati diversi e file enormi", async () => {
    await expect(readLocalTemplateImage(foto(1000, "image/gif"))).rejects.toThrow("PNG, JPG o WEBP");
    await expect(readLocalTemplateImage(foto(16 * 1024 * 1024))).rejects.toThrow("15 MB");
  });
});
