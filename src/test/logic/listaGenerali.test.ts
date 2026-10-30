import { describe, expect, it } from "vitest";
import { raggruppaGenerali, sommaFiglie } from "@/lib/orders/listaGenerali";

/** Lista commesse ad albero (31/10/2026): la generale si apre e mostra le sue commesse sotto. */
const o = (id: string, importo = 0) => ({ id, importo });
const generaleDi = (id: string) => ({ a1: "g", a2: "g", x1: "assente" } as Record<string, string>)[id];
const isGenerale = (id: string) => id === "g" || id === "assente";

describe("lista commesse ad albero", () => {
  const items = [o("a2", 200), o("n1"), o("g"), o("a1", 100), o("x1"), o("n2")];

  it("chiusa: le commesse dentro spariscono dalla lista e stanno nella riga della generale", () => {
    const righe = raggruppaGenerali(items, generaleDi, isGenerale, new Set());
    expect(righe.map((r) => r.order.id)).toEqual(["n1", "g", "x1", "n2"]);
    expect(righe.find((r) => r.order.id === "g")!.figlie.map((f) => f.id)).toEqual(["a2", "a1"]);
  });

  it("aperta: le commesse dentro vengono subito sotto, nell'ordine della lista", () => {
    const righe = raggruppaGenerali(items, generaleDi, isGenerale, new Set(["g"]));
    expect(righe.map((r) => `${r.livello}:${r.order.id}`)).toEqual(["0:n1", "0:g", "1:a2", "1:a1", "0:x1", "0:n2"]);
  });

  it("se la generale non è nella pagina, la commessa resta al suo posto", () => {
    const righe = raggruppaGenerali(items, generaleDi, isGenerale, new Set());
    expect(righe.find((r) => r.order.id === "x1")).toMatchObject({ livello: 0, figlie: [] });
  });

  it("i totali della generale sono la somma delle commesse dentro", () => {
    expect(sommaFiglie([o("a", 100.1), o("b", 200.2), o("c", Number.NaN)], (x) => x.importo)).toBe(300.3);
  });
});
