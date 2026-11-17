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

import { differenze, nomeBreve, parolaChiave, suggerisciFornitori, avanzamentoFasi } from "@/lib/acquisti/fabbisogno";

describe("nomi brevi e fornitori suggeriti", () => {
  const deu = (n: number) => `N.1 Deumidificatore con integrato un sistema di rinnovo dell'aria e recupero del calore ad alta efficienza. Modello isotermico taglia 50, N. ${n} Tubi di distribuzione da plenum.`;

  it("toglie N.1 e «Fornitura e posa», tiene la prima frase", () => {
    expect(nomeBreve(deu(4)).titolo).toBe("Deumidificatore con integrato un sistema di…");
    expect(nomeBreve("Fornitura e posa in opera di ventilconvettore a parete, potenza 2 kW").titolo).toBe("Ventilconvettore a parete");
    expect(nomeBreve("Cavo di collegamento comando-fancoil")).toEqual({ titolo: "Cavo di collegamento comando-fancoil", accorciato: false });
  });

  it("dice da dove righe simili cominciano a differire", () => {
    const d = differenze([{ order_item_id: "a", name: deu(4) }, { order_item_id: "b", name: deu(9) }, { order_item_id: "c", name: "Cavo" }]);
    expect(d.get("a")).toMatch(/^N\. 4 Tubi/);
    expect(d.get("b")).toMatch(/^N\. 9 Tubi/);
    expect(d.has("c")).toBe(false);
  });

  it("propone il fornitore più usato per la stessa parola chiave", () => {
    expect(parolaChiave("N.2 Deumidificatori canalizzati")).toBe(parolaChiave("Deumidificatore"));
    const s = suggerisciFornitori(
      [{ order_item_id: "x", name: deu(4), supplier_id: null }, { order_item_id: "y", name: "Cavo", supplier_id: "f1" }, { order_item_id: "z", name: "Mattoni pieni", supplier_id: null }],
      [{ nome: "Deumidificatore Daikin", supplier_id: "f1", fornitore: "Termo" }, { nome: "deumidificatori", supplier_id: "f2", fornitore: "Clima", peso: 3 }],
    );
    expect(s.get("x")).toEqual({ supplier_id: "f2", fornitore: "Clima" });
    expect(s.has("y")).toBe(false);
    expect(s.has("z")).toBe(false);
  });

  it("conta i materiali coperti per fase", () => {
    const a = avanzamentoFasi([
      riga({ fase: "Tetto", previsto: 1, residuo: 0, stato: "ordinato" }),
      riga({ fase: "Tetto", previsto: 1, residuo: 1, stato: "da_ordinare" }),
    ]);
    expect(a.get("Tetto")).toEqual({ coperti: 1, totale: 2 });
  });
});
