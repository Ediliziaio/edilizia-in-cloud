import { describe, expect, it } from "vitest";
import { passoRiga, righePerPasso, type RigaDelRilievo } from "@/lib/sopralluoghi/statoRighe";

const riga = (patch: Partial<RigaDelRilievo>): RigaDelRilievo => ({
  order_item_id: "r1", riferimento: "F01", nome: "Finestra", stato_misure: "confermato", quantita: 1, unita: "pz",
  oda_id: null, oda_numero: null, oda_stato: null, quantita_ordinata: null, quantita_arrivata: null, ...patch,
});

describe("dalla misura all'ordine", () => {
  it("misure aperte prima di tutto, anche se un ordine c'è già", () => {
    expect(passoRiga([riga({ stato_misure: "rilevato", oda_id: "o", oda_stato: "bozza" })])).toBe("da_confermare");
  });
  it("confermata senza ordine, in bozza, partita, arrivata", () => {
    expect(passoRiga([riga({})])).toBe("da_ordinare");
    expect(passoRiga([riga({ oda_id: "o", oda_stato: "bozza", quantita_ordinata: 1 })])).toBe("ordinata");
    expect(passoRiga([riga({ oda_id: "o", oda_stato: "inviato", quantita_ordinata: 2, quantita_arrivata: 1 })])).toBe("in_arrivo");
    expect(passoRiga([riga({ oda_id: "o", oda_stato: "ricevuto", quantita_ordinata: 2, quantita_arrivata: 2 })])).toBe("arrivata");
  });
  it("una riga su due ordini conta l'arrivato di entrambi", () => {
    const g = righePerPasso([
      riga({ oda_id: "a", oda_numero: "1", oda_stato: "inviato", quantita_ordinata: 1, quantita_arrivata: 1 }),
      riga({ oda_id: "b", oda_numero: "2", oda_stato: "inviato", quantita_ordinata: 1, quantita_arrivata: 1 }),
      riga({ order_item_id: "r2", riferimento: "F02" }),
    ]);
    expect(g.map((x) => [x.riga.riferimento, x.passo, x.ordini.length])).toEqual([["F01", "arrivata", 2], ["F02", "da_ordinare", 0]]);
  });
});
