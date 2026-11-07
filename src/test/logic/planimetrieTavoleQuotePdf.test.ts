import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { accodaTavole } from "@/lib/planimetrie/tavole";
import type { Disegno2D } from "@/lib/planimetrie/prospetti";

beforeAll(() => vi.stubGlobal("Uint8Array", Object.getPrototypeOf(Buffer.prototype).constructor));
afterAll(() => vi.unstubAllGlobals());

describe("quote delle tavole nel PDF effettivo", () => {
  it("mantiene orientamento verticale, segno dei livelli interrati e unità corrette", async () => {
    const disegno: Disegno2D = {
      titolo: "Prospetto", minU: -180, maxU: 400, minZ: -300, maxZ: 300,
      primitive: [
        { tipo: "rett", u1: 0, u2: 400, z1: -300, z2: 270, stile: "muro" },
        { tipo: "testo", u: -66, z: 135, testo: "270", stile: "quota", ruota: true },
        { tipo: "testo", u: -115, z: -294, testo: "−3,00 Interrato", stile: "etichetta", ancora: "fine" },
      ],
    };
    const { dati } = await accodaTavole(null, [disegno], { formato: "A4", scala: 100, intestazione: "Casa" });
    const task = getDocument({ data: dati, useSystemFonts: true });
    try {
      const pdf = await task.promise;
      const content = await (await pdf.getPage(1)).getTextContent();
      const items = content.items.filter((item) => "str" in item);
      const verticale = items.find((item) => item.str === "270");
      expect(verticale).toBeDefined();
      expect(Math.abs(verticale!.transform[0])).toBeLessThan(0.001);
      expect(verticale!.transform[1]).toBeGreaterThan(0);
      expect(items.map((item) => item.str).join(" ")).toContain("-3,00 Interrato");
      expect(items.map((item) => item.str).join(" ")).toContain("Quote senza unità in cm");
      // La quota di livello è allineata a destra: finisce prima della catena verticale.
      const livello = items.find((item) => item.str === "-3,00 Interrato")!;
      expect(livello.transform[4] + livello.width).toBeLessThan(verticale!.transform[4]);
    } finally {
      await task.destroy();
    }
  });
});
