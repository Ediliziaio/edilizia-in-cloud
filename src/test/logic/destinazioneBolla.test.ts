import { describe, expect, it } from "vitest";
import { commessaDallaDestinazione, partiIndirizzo } from "../../../shared/acquisti/destinazioneBolla.ts";

const commesse = [
  { id: "a", codice: "ROSSI-GARIBALDI", indirizzo: "Via Garibaldi 2, Montesilvano (PE)" },
  { id: "b", codice: "BIANCHI", indirizzo: "Via Roma 10, Pescara (PE)" },
  { id: "c", codice: "VERDI", indirizzo: "Viale Nettuno 20, Pescara (PE)" },
];

describe("commessa dalla destinazione della bolla", () => {
  it("via e comune scritti sulla bolla: proposta, anche senza civico", () => {
    expect(commessaDallaDestinazione("VIA GARIBALDI\nMONTESILVANO", commesse)).toEqual({ id: "a", codice: "ROSSI-GARIBALDI", motivo: "via garibaldi, montesilvano" });
  });
  it("abbreviazioni sciolte: «V.le Nettuno 20 Pescara»", () => {
    expect(commessaDallaDestinazione("V.le Nettuno 20 - 65100 Pescara", commesse)?.id).toBe("c");
  });
  it("civico diverso: non è quel cantiere", () => {
    expect(commessaDallaDestinazione("Via Roma 12, Pescara", commesse)).toBeNull();
  });
  it("due cantieri nella stessa via e stesso comune: nessuna proposta", () => {
    const due = [...commesse, { id: "d", codice: "ALTRO", indirizzo: "Via Garibaldi 8, Montesilvano" }];
    expect(commessaDallaDestinazione("Via Garibaldi, Montesilvano", due)).toBeNull();
    expect(commessaDallaDestinazione("Via Garibaldi 8, Montesilvano", due)?.id).toBe("d");
  });
  it("niente indirizzo o via generica: niente", () => {
    expect(commessaDallaDestinazione("", commesse)).toBeNull();
    expect(commessaDallaDestinazione("Cantiere", commesse)).toBeNull();
    expect(partiIndirizzo("Via 1, Pescara")).toBeNull();
  });
});
