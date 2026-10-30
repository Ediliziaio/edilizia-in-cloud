import { describe, expect, it } from "vitest";
import { elencoPerPrompt, mappaRapportini } from "../../../supabase/functions/ai-rapportini-da-documento/mappa";
import { giornoDaLetto } from "@/lib/campo/rapportiniUfficio";

const cat = {
  fasi: [{ id: "f-dem", nome: "Demolizioni" }, { id: "f-imp", nome: "Impianto idraulico" }],
  persone: [{ id: "e-1", nome: "Mario Rossi" }, { id: "e-2", nome: "Luca Bianchi" }],
  mezzi: [{ id: "m-1", nome: "Betoniera" }],
  articoli: [{ id: "a-1", nome: "Cemento" }],
};

describe("rapportini letti dai documenti", () => {
  it("il modello vede codici corti, non id", () => {
    expect(elencoPerPrompt("F", cat.fasi)).toBe("F1 · Demolizioni\nF2 · Impianto idraulico");
    expect(elencoPerPrompt("M", [])).toBe("(nessuno)");
  });

  it("i codici tornano id; date future, ore assurde e codici inventati non passano", () => {
    const { rapportini, avvisi } = mappaRapportini({
      rapportini: [
        { data: "2026-10-27", descrizione: "Demolizione tramezzi", fasi: ["F1", "F9"], meteo: "Pioggia",
          persone: [{ persona: "P1", ore: "7,5" }, { persona: null, nome_letto: "Giorgio (esterno)", ore: 8 }, { persona: "P2", ore: 30 }, { persona: "P1", ore: 2 }],
          mezzi: [{ mezzo: "M1", ore: 3 }, { mezzo: "M7" }], materiali: [{ articolo: "A1", quantita: 4 }, { articolo: null, nome_letto: "Sacchi macerie", quantita: 10 }, { articolo: "A1", quantita: 0 }] },
        { data: "2026-11-05", descrizione: "futuro" },
        { data: "27/10", descrizione: "senza data" },
      ],
      avvisi: ["Ore del 27 poco leggibili"],
    }, cat, "2026-10-31");
    expect(rapportini).toEqual([{
      data: "2026-10-27", descrizione: "Demolizione tramezzi", fasi: ["f-dem"], meteo: "pioggia", note: null,
      persone: [{ employee_id: "e-1", nome: "Mario Rossi", ore: 7.5 }, { employee_id: null, nome: "Giorgio (esterno)", ore: 8 }],
      mezzi: [{ mezzo_id: "m-1", ore: 3 }],
      materiali: [{ order_item_id: "a-1", nome: "Cemento", quantita: 4 }, { order_item_id: null, nome: "Sacchi macerie", quantita: 10 }],
    }]);
    expect(avvisi).toEqual(["Ore del 27 poco leggibili", "Il rapportino del 2026-11-05 è nel futuro: saltato.", "Un rapportino senza data leggibile è stato saltato."]);
  });

  it("nel popup: i riconosciuti nei loro campi, gli altri nelle note da verificare", () => {
    const { rapportini } = mappaRapportini({ rapportini: [{ data: "2026-10-27", descrizione: "x", persone: [{ persona: "P1", ore: 7.5 }, { persona: null, nome_letto: "Giorgio", ore: 8 }], mezzi: [{ mezzo: "M1" }], materiali: [{ articolo: null, nome_letto: "Sacchi", quantita: 10 }] }] }, cat, "2026-10-31");
    expect(giornoDaLetto(rapportini[0], "k")).toMatchObject({
      data: "2026-10-27", presenze: { "e:e-1": "7,5" }, mezzi: { "m-1": "" }, materiali: {},
      note: "Persone da verificare: Giorgio 8 h · Materiali non in commessa: Sacchi 10",
    });
  });
});
