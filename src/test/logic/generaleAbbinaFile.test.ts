import { describe, expect, it } from "vitest";
import { abbinaFile, unitaDelFile } from "@/lib/orders/generali/abbinaFile";

/** Chi ha tante unità carica tutte le piante insieme: ognuna va sull'unità giusta da sola. */
const unita = [
  { orderId: "a1", sigla: "A1" }, { orderId: "a2", sigla: "A2" }, { orderId: "a10", sigla: "A10" },
  { orderId: "c1", sigla: "C1" }, { orderId: "c1a", sigla: "C1a" },
];

describe("abbinare i file alle unità", () => {
  it("riconosce la sigla nel nome, comunque sia scritto", () => {
    for (const n of ["A1.pdf", "a1.PDF", "pianta_A1_v2.pdf", "Planimetria A1.jpg", "A-1.pdf", "A 1 catastale.pdf"]) {
      expect(unitaDelFile(n, unita)).toBe("a1");
    }
  });
  it("A1 non si confonde con A10, C1 non si confonde con C1a", () => {
    expect(unitaDelFile("A10.pdf", unita)).toBe("a10");
    expect(unitaDelFile("C1a.pdf", unita)).toBe("c1a");
    expect(unitaDelFile("C1.pdf", unita)).toBe("c1");
  });
  it("non indovina: né senza sigla, né con due sigle nel nome", () => {
    expect(unitaDelFile("capitolato.pdf", unita)).toBeNull();
    expect(unitaDelFile("A1 e A2.pdf", unita)).toBeNull();
    expect(unitaDelFile("PLA1NTA.pdf", unita)).toBeNull();
  });
  it("l'estensione non conta come sigla", () => {
    expect(unitaDelFile("foto.a1", unita)).toBeNull();
  });
  it("abbina un elenco e lascia da scegliere a mano quelli che non riconosce", () => {
    const r = abbinaFile([{ name: "A2.pdf" }, { name: "altro.pdf" }], unita);
    expect(r.map((x) => x.orderId)).toEqual(["a2", null]);
  });
});
