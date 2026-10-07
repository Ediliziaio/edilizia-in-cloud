import { describe, expect, it } from "vitest";
import { vociSalDaFasi } from "@/lib/orders/salDaFasi";

describe("vociSalDaFasi — ponte avanzamento fasi → voci SAL", () => {
  it("una voce per fase: descrizione dal nome, % dall'avanzamento, importo dal venduto", () => {
    expect(vociSalDaFasi([
      { name: "Fondazioni", percentuale: 100, importo_venduto: 20000 },
      { name: "Muratura", percentuale: 40, importo_venduto: 35000 },
    ])).toEqual([
      { descrizione: "Fondazioni", importo_contrattuale: "20000", percentuale_avanzamento: "100", note: "" },
      { descrizione: "Muratura", importo_contrattuale: "35000", percentuale_avanzamento: "40", note: "" },
    ]);
  });

  it("senza venduto l'importo resta vuoto (lo scrive l'ufficio), la % arriva lo stesso", () => {
    expect(vociSalDaFasi([{ name: "Impianti", percentuale: 25, importo_venduto: null }])).toEqual([
      { descrizione: "Impianti", importo_contrattuale: "", percentuale_avanzamento: "25", note: "" },
    ]);
    expect(vociSalDaFasi([{ name: "Impianti", percentuale: 25, importo_venduto: 0 }])[0].importo_contrattuale).toBe("");
  });

  it("la % si normalizza tra 0 e 100 e si arrotonda; le fasi senza nome si saltano", () => {
    expect(vociSalDaFasi([
      { name: "  ", percentuale: 50, importo_venduto: 1000 },
      { name: "X", percentuale: 150, importo_venduto: null },
      { name: "Y", percentuale: -5, importo_venduto: null },
      { name: "Z", percentuale: 33.6, importo_venduto: null },
    ])).toEqual([
      { descrizione: "X", importo_contrattuale: "", percentuale_avanzamento: "100", note: "" },
      { descrizione: "Y", importo_contrattuale: "", percentuale_avanzamento: "0", note: "" },
      { descrizione: "Z", importo_contrattuale: "", percentuale_avanzamento: "34", note: "" },
    ]);
  });

  it("nessuna fase → nessuna voce", () => {
    expect(vociSalDaFasi([])).toEqual([]);
  });
});
