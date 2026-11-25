import { describe, expect, it } from "vitest";
import { FILTRI_VUOTI, filtraRapportini, filtriAttivi, rapportinoDiTrasporto } from "@/lib/orders/filtriRapportini";

type R = { id: string; stato: "inviato" | "approvato" | "rifiutato"; data_lavoro: string; descrizione_lavori: string; note?: string | null; autore?: { first_name: string; last_name: string } };
const righe: R[] = [
  { id: "a", stato: "approvato", data_lavoro: "2026-11-23", descrizione_lavori: "CARICO A MARANELLO E SCARICO A MORENGO", autore: { first_name: "Salvatore", last_name: "V" } },
  { id: "b", stato: "inviato", data_lavoro: "2026-11-18", descrizione_lavori: "TRASPORTO PIASTRELLE E SCARICO" },
  { id: "c", stato: "inviato", data_lavoro: "2026-11-12", descrizione_lavori: "TAVOLATI INTERNI" },
  { id: "d", stato: "rifiutato", data_lavoro: "2026-10-30", descrizione_lavori: "Posa tegole", note: "manca la firma" },
  { id: "e", stato: "approvato", data_lavoro: "2026-10-02", descrizione_lavori: "Giornata in cantiere" },
];
const stato = (r: R) => r.stato;
const ids = (xs: R[]) => xs.map((r) => r.id);
const viaggi = new Set(["e"]);

describe("filtri dei rapportini della commessa", () => {
  it("trasporto: voce di viaggio, oppure la descrizione parla di trasporto, carico o scarico", () => {
    expect(rapportinoDiTrasporto(righe[0], new Set())).toBe(true);
    expect(rapportinoDiTrasporto(righe[2], new Set())).toBe(false);
    expect(rapportinoDiTrasporto(righe[4], viaggi)).toBe(true);
    expect(rapportinoDiTrasporto({ id: "x", descrizione_lavori: "Scaricato il bancale" }, new Set())).toBe(false);
  });
  it("stato, tipo, mese e testo si combinano", () => {
    expect(ids(filtraRapportini(righe, FILTRI_VUOTI, stato, viaggi))).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids(filtraRapportini(righe, { ...FILTRI_VUOTI, tipo: "trasporti" }, stato, viaggi))).toEqual(["a", "b", "e"]);
    expect(ids(filtraRapportini(righe, { ...FILTRI_VUOTI, tipo: "lavori" }, stato, viaggi))).toEqual(["c", "d"]);
    expect(ids(filtraRapportini(righe, { ...FILTRI_VUOTI, tipo: "trasporti", stato: "inviato" }, stato, viaggi))).toEqual(["b"]);
    expect(ids(filtraRapportini(righe, { ...FILTRI_VUOTI, mese: "2026-10" }, stato, viaggi))).toEqual(["d", "e"]);
    expect(ids(filtraRapportini(righe, { ...FILTRI_VUOTI, cerca: "  salvatore  maranello " }, stato, viaggi))).toEqual(["a"]);
    expect(ids(filtraRapportini(righe, { ...FILTRI_VUOTI, cerca: "firma" }, stato, viaggi))).toEqual(["d"]);
  });
  it("filtri attivi solo quando qualcosa è scelto", () => {
    expect(filtriAttivi(FILTRI_VUOTI)).toBe(false);
    expect(filtriAttivi({ ...FILTRI_VUOTI, cerca: "   " })).toBe(false);
    expect(filtriAttivi({ ...FILTRI_VUOTI, tipo: "lavori" })).toBe(true);
  });
});
