import { describe, expect, it } from "vitest";
import { scalaDalleSuperfici } from "@/lib/planimetrie/scalaDalleSuperfici";
import type { Planimetria } from "../../../shared/planimetrie/modello";

const stanza = (id: string, lato: number, dichiarataMq?: number) => ({
  id, nome: id, destinazione: "altro", altezza: 300, origine: "stimata",
  contorno: [{ x: 0, y: 0 }, { x: lato, y: 0 }, { x: lato, y: lato }, { x: 0, y: lato }],
  ...(dichiarataMq ? { superficieDichiarataMq: dichiarataMq } : {}),
});
const doc = (locali: unknown[]) => ({ schema: 1, unita: "cm", livelli: [
  { id: "pt", nome: "Piano terra", quota: 0, proposte: [], fatto: { muri: [], aperture: [], elementi: [], quote: [], testi: [], locali } },
] }) as unknown as Planimetria;

describe("scala del DWG provata dalle superfici scritte", () => {
  it("le stanze tornano: la scala è confermata", () => {
    // 300 × 300 = 9 m², 400 × 400 = 16 m²…: scritte con un po' di scarto, come sulle tavole
    const p = scalaDalleSuperfici(doc([stanza("a", 300, 9.1), stanza("b", 400, 15.8), stanza("c", 250, 6.3), stanza("d", 350, 12.0), stanza("e", 200, 5.5)]));
    expect(p).toMatchObject({ stanze: 5, tornano: 4, confermata: true });
  });
  it("con l'unità sbagliata non torna niente, e poche stanze non bastano", () => {
    expect(scalaDalleSuperfici(doc([stanza("a", 3, 9), stanza("b", 4, 16), stanza("c", 2.5, 6.25), stanza("d", 3.5, 12.25)])).confermata).toBe(false);
    expect(scalaDalleSuperfici(doc([stanza("a", 300, 9), stanza("b", 400, 16), stanza("c", 250, 6.25)])).confermata).toBe(false);
    expect(scalaDalleSuperfici(doc([stanza("a", 300), stanza("b", 400)])).stanze).toBe(0);
  });
});
