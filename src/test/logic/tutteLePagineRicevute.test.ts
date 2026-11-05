import { describe, expect, it } from "vitest";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";

describe("elenco delle fatture ricevute oltre le mille righe", () => {
  it("le legge tutte, una pagina dopo l'altra", async () => {
    const tutte = Array.from({ length: 1208 }, (_, i) => i);
    const chiamate: Array<[number, number]> = [];
    const lette = await tutteLePagine<number>(async (from, to) => {
      chiamate.push([from, to]);
      return { data: tutte.slice(from, to + 1), error: null };
    });
    expect(lette).toHaveLength(1208);
    expect(chiamate).toEqual([[0, 999], [1000, 1999]]);
  });

  it("un errore del database si vede, non diventa un elenco vuoto", async () => {
    await expect(tutteLePagine<number>(async () => ({ data: null, error: new Error("giù") }))).rejects.toThrow("giù");
  });
});
