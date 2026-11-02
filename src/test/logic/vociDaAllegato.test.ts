import { describe, expect, it } from "vitest";
import { vociDaAllegato } from "@/lib/subappaltatori/lavoriMisure";

let n = 0;
const id = () => `v${++n}`;

describe("quadro lavori dall'Allegato A", () => {
  it("riprende le righe: a corpo, a ore, a misura", () => {
    const voci = vociDaAllegato([
      { fase: "Gas", descrizione: "Linea gas", unita: "m", quantita: 12.5, prezzo: 40, importo: 500 },
      { fase: "Gas", descrizione: "Allaccio", unita: "a corpo", quantita: 1, prezzo: 300, importo: 300 },
      { fase: "Gas", descrizione: "Assistenza", unita: "h", quantita: 2, prezzo: 35, importo: 70 },
    ], 870, id)!;
    expect(voci.map((v) => [v.base, v.unita, v.quantita, v.prezzo])).toEqual([
      ["misura", "m", 12.5, 40], ["corpo", "quota", 1, 300], ["ore", "h", 2, 35],
    ]);
  });
  it("se l'elenco non torna all'importo del contratto non lo usa", () => {
    expect(vociDaAllegato([{ descrizione: "Linea gas", unita: "m", quantita: 1, prezzo: 10 }], 999, id)).toBeNull();
  });
  it("senza elenco o con righe vuote non lo usa", () => {
    expect(vociDaAllegato([], 0, id)).toBeNull();
    expect(vociDaAllegato(null, 0, id)).toBeNull();
    expect(vociDaAllegato([{ descrizione: "", unita: "m", quantita: 1, prezzo: 1 }], 1, id)).toBeNull();
  });
});
