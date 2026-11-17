import { describe, expect, it } from "vitest";
import { raggruppaPerFase, selezionabile, type RigaFabbisogno } from "@/lib/acquisti/fabbisogno";

const riga = (p: Partial<RigaFabbisogno>): RigaFabbisogno => ({
  order_item_id: Math.random().toString(36), order_id: "o", commessa: "C-1", phase_id: null, fase: null, name: "X", unita_misura: "pz",
  supplier_id: null, fornitore: null, previsto: 1, ordinato: 0, in_bozza: 0, ricevuto: 0, residuo: 1, eccedenza: 0, unita_diversa: false,
  stato: "da_ordinare", data_serve: null, giorni_consegna: 7, ordina_entro: null, ...p,
});

describe("fabbisogno di una commessa, per fase", () => {
  it("fasi nell'ordine della prima scadenza, con ritardi e urgenze contati", () => {
    const g = raggruppaPerFase([
      riga({ fase: "Cappotto", ordina_entro: "2026-12-20", name: "Pannelli" }),
      riga({ fase: "Impianto termico", ordina_entro: "2026-10-26", name: "Pompa di calore" }),
      riga({ fase: "Impianto termico", ordina_entro: "2026-11-20", name: "Tubo" }),
      riga({ fase: null, ordina_entro: null, name: "Varie" }),
    ], "2026-11-17");
    expect(g.map((x) => x.fase)).toEqual(["Impianto termico", "Cappotto", "Senza fase"]);
    expect(g[0]).toMatchObject({ ritardo: 1, settimana: 1 });
    expect(g[0].righe.map((r) => r.name)).toEqual(["Pompa di calore", "Tubo"]);
  });

  it("si seleziona anche senza fornitore, non quello già ordinato", () => {
    expect(selezionabile(riga({ supplier_id: null }))).toBe(true);
    expect(selezionabile(riga({ stato: "ordinato" }))).toBe(false);
    expect(selezionabile(riga({ residuo: 0 }))).toBe(false);
  });
});
