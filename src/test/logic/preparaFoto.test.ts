import { describe, expect, it, vi } from "vitest";
import {
  MAX_COMPRESSA_BYTES, MAX_FOTO_PER_RAPPORTINO, MAX_ORIGINALE_BYTES,
  avvisiPreparazione, avvisoCaricamento, nomeFileFoto, postiLiberi, preparaFoto,
} from "@/lib/campo/preparaFoto";

const MB = 1024 * 1024;
// File finto con dimensione dichiarata senza allocare davvero i byte.
function foto(nome: string, byte: number, type = "image/jpeg"): File {
  const f = new File(["x"], nome, { type });
  Object.defineProperty(f, "size", { value: byte });
  return f;
}
const jpeg = (byte: number) => { const b = new Blob(["j"], { type: "image/jpeg" }); Object.defineProperty(b, "size", { value: byte }); return b; };

describe("preparazione delle foto di cantiere", () => {
  it("una foto da 12 MB del telefono passa: si comprime prima di guardare il peso", async () => {
    const esito = await preparaFoto([foto("IMG 0001.HEIC", 12 * MB)], { comprimi: async () => jpeg(400_000) });
    expect(esito.pronte).toHaveLength(1);
    expect(esito.troppoPesanti).toBe(0);
    expect(esito.pronte[0].contentType).toBe("image/jpeg");
  });

  it("comprime in sequenza, una alla volta, nell'ordine scelto, e dice a che punto è", async () => {
    let inCorso = 0; let massimo = 0; const ordine: string[] = [];
    const progresso: string[] = [];
    const comprimi = async (f: File) => {
      inCorso++; massimo = Math.max(massimo, inCorso); ordine.push(f.name);
      await new Promise((r) => setTimeout(r, 1));
      inCorso--; return jpeg(100);
    };
    const files = ["a", "b", "c"].map((n) => foto(n, MB));
    await preparaFoto(files, { comprimi, onProgresso: (i, n) => progresso.push(`${i}/${n}`) });
    expect(massimo).toBe(1);
    expect(ordine).toEqual(["a", "b", "c"]);
    expect(progresso).toEqual(["1/3", "2/3", "3/3"]);
  });

  it(`al massimo ${MAX_FOTO_PER_RAPPORTINO} foto in tutto, contando quelle già presenti; le altre si contano, non spariscono`, async () => {
    const comprimi = vi.fn(async () => jpeg(100));
    const esito = await preparaFoto(Array.from({ length: 8 }, (_, i) => foto(`f${i}`, MB)), { giaPresenti: 10, comprimi });
    expect(esito.pronte).toHaveLength(5);
    expect(esito.oltreLimite).toBe(3);
    expect(comprimi).toHaveBeenCalledTimes(5);
    expect(postiLiberi(15)).toBe(0);
    expect(postiLiberi(20)).toBe(0);
    expect(postiLiberi(0)).toBe(15);
  });

  it("scarta l'originale enorme senza nemmeno aprirlo e il risultato compresso oltre 3 MB", async () => {
    const comprimi = vi.fn(async (f: File) => jpeg(f.name === "pesante" ? MAX_COMPRESSA_BYTES + 1 : 100));
    const esito = await preparaFoto([foto("enorme", MAX_ORIGINALE_BYTES + 1), foto("pesante", 20 * MB), foto("ok", 5 * MB)], { comprimi });
    expect(esito.pronte).toHaveLength(1);
    expect(esito.troppoPesanti).toBe(2);
    expect(comprimi).toHaveBeenCalledTimes(2);
  });

  it("se la compressione fallisce tiene l'originale solo se è già leggero, col suo formato", async () => {
    const comprimi = async () => { throw new Error("canvas"); };
    const esito = await preparaFoto([foto("piccola.png", MB, "image/png"), foto("grande.jpg", 8 * MB)], { comprimi });
    expect(esito.pronte).toHaveLength(1);
    expect(esito.pronte[0].contentType).toBe("image/png");
    expect(esito.pronte[0].nomeFile).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(esito.troppoPesanti).toBe(1);
  });

  it("un compressore che risponde null vale come un fallimento: si tiene l'originale leggero", async () => {
    const esito = await preparaFoto([foto("a.jpg", MB)], { comprimi: async () => null });
    expect(esito.pronte).toHaveLength(1);
    expect(esito.pronte[0].blob.size).toBe(MB);
  });

  it("i file che non sono immagini si contano a parte", async () => {
    const esito = await preparaFoto([foto("doc.pdf", MB, "application/pdf"), foto("a.jpg", MB)], { comprimi: async () => jpeg(10) });
    expect(esito.nonImmagini).toBe(1);
    expect(esito.pronte).toHaveLength(1);
  });

  it("il nome del file è sicuro: uuid + estensione, mai il nome del telefono", async () => {
    expect(nomeFileFoto("image/jpeg", "abc")).toBe("abc.jpg");
    expect(nomeFileFoto("image/webp", "abc")).toBe("abc.webp");
    expect(nomeFileFoto("", "abc")).toBe("abc.jpg");
    const esito = await preparaFoto([foto("Foto cantiere è (1).jpg", MB), foto("Foto cantiere è (1).jpg", MB)], { comprimi: async () => jpeg(10) });
    const [a, b] = esito.pronte.map((p) => p.nomeFile);
    expect(a).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(a).not.toBe(b);
  });

  it("gli avvisi dicono quante e perché; nessun avviso se è andato tutto bene", () => {
    expect(avvisiPreparazione({ oltreLimite: 0, troppoPesanti: 0, nonImmagini: 0 })).toEqual([]);
    expect(avvisiPreparazione({ oltreLimite: 3, troppoPesanti: 1, nonImmagini: 2 })).toEqual([
      "Massimo 15 foto: 3 foto non sono state aggiunte.",
      "1 foto è troppo pesante anche dopo la compressione: scattala di nuovo dall'app.",
      "2 file non sono foto.",
    ]);
    expect(avvisoCaricamento(5, 5)).toBeNull();
    expect(avvisoCaricamento(0, 0)).toBeNull();
    expect(avvisoCaricamento(3, 5)).toBe("Caricate 3 foto su 5: le altre non sono arrivate, riprova.");
    expect(avvisoCaricamento(0, 4)).toBe("Nessuna delle 4 foto è stata caricata: riprova.");
  });
});
