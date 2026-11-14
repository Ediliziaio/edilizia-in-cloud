import { describe, expect, it } from "vitest";
import { composizioneUnita, tipologiaDalNome, unitaDalPiano } from "@/lib/orders/generali/unitaDalPiano";
import { controllaSerie } from "@/lib/orders/generali/unitaSerie";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";

let ordine = 0;
const voce = (descrizione: string, importo: number, tipo: VocePiano["tipo"] = "ricavo", categoria = "vendite"): VocePiano => ({
  id: `v${++ordine}`, tipo, categoria: categoria as VocePiano["categoria"], descrizione, importo, mese: null, durataMesi: 1,
  figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: ordine * 10, origineId: null,
});

// Le vendite del business plan di Via Callimaco 28 (URBAN VISION), scenario realistico.
const callimaco = (): VocePiano[] => [
  voce("Prezzo acquisto del terreno", 655000, "costo", "terreno"),
  ...[365000, 365000, 365000, 300000, 300000, 300000, 300000].map((p, i) => voce(`Unità ${i + 1}`, p)),
  ...Array.from({ length: 16 }, (_, i) => voce(`Posto auto ${i + 1}`, 12000)),
  ...Array.from({ length: 3 }, (_, i) => voce(`Posto moto ${i + 1}`, 3000)),
];

describe("unità dalle vendite del piano", () => {
  it("prepara una riga per ogni vendita, con il nome del piano e il listino scritto all'italiana", () => {
    const d = unitaDalPiano(callimaco(), [])!;
    expect(d.righe).toHaveLength(26);
    expect(d.vendite).toBe(26);
    expect(d.valore).toBe(2_496_000);
    expect(d.righe[0]).toMatchObject({ sigla: "Unità 1", tipologia: "", listino: "365.000" });
    expect(d.righe[7]).toMatchObject({ sigla: "Posto auto 1", tipologia: "Posto auto", listino: "12.000" });
    expect(d.righe[25]).toMatchObject({ sigla: "Posto moto 3", tipologia: "Posto moto", listino: "3.000" });
    expect(d.composizione).toBe("7 unità, 16 posti auto, 3 posti moto");
  });

  it("le righe passano il controllo della serie così come sono", () => {
    const d = unitaDalPiano(callimaco(), [])!;
    const c = controllaSerie(d.righe, []);
    expect(c.errori).toBe(0);
    expect(c.unita[0]).toMatchObject({ sigla: "Unità 1", prezzo_listino: 365000 });
    expect(c.unita.reduce((t, u) => t + (u.prezzo_listino ?? 0), 0)).toBe(2_496_000);
  });

  it("non ripropone le unità già create, e si spegne quando ci sono tutte", () => {
    const voci = callimaco();
    const d = unitaDalPiano(voci, ["unità 1", "Unità 2", "Posto auto 16"])!;
    expect(d.righe).toHaveLength(23);
    expect(d.vendite).toBe(26);
    expect(d.righe.map((r) => r.sigla)).not.toContain("Unità 2");
    const tutte = voci.filter((v) => v.tipo === "ricavo").map((v) => v.descrizione);
    expect(unitaDalPiano(voci, tutte)).toBeNull();
  });

  it("una sola riga «Vendite» è un totale, non un'unità: niente proposta", () => {
    expect(unitaDalPiano([voce("Vendite appartamenti", 2_000_000)], [])).toBeNull();
    expect(unitaDalPiano([voce("Terreno", 400_000, "costo", "terreno")], [])).toBeNull();
  });

  it("ignora i ricavi che non sono vendite e le righe senza nome; tiene le vendite a prezzo da stimare", () => {
    const d = unitaDalPiano([
      voce("Contributo regionale", 50_000, "ricavo", "altri_ricavi"),
      voce("  ", 10_000),
      voce("A1", 0),
      voce("A2", 210_500.5),
    ], [])!;
    expect(d.righe.map((r) => [r.sigla, r.listino])).toEqual([["A1", ""], ["A2", "210.500,50"]]);
  });

  it("due righe del piano con lo stesso nome diventano una sola unità", () => {
    const d = unitaDalPiano([voce("Box 1", 20_000), voce("box 1", 20_000), voce("Box 2", 20_000)], [])!;
    expect(d.righe.map((r) => r.sigla)).toEqual(["Box 1", "Box 2"]);
  });
});

describe("tipologia dal nome", () => {
  it.each([
    ["Posto auto 4", "Posto auto"], ["Posto moto 1", "Posto moto"], ["Box doppio", "Box"], ["Autorimessa", "Box"],
    ["Trilocale piano 2", "Appartamento"], ["Attico con terrazzo", "Attico"], ["Cantina 3", "Cantina"],
    ["Locale commerciale", "Negozio"], ["Unità 5", ""], ["A7", ""],
  ])("«%s» → «%s»", (nome, attesa) => expect(tipologiaDalNome(nome)).toBe(attesa));

  it("composizione al singolare e al plurale", () => {
    expect(composizioneUnita(["Posto auto", "", ""])).toBe("1 posto auto, 2 unità");
    expect(composizioneUnita(["Villetta"])).toBe("1 villetta");
  });
});
