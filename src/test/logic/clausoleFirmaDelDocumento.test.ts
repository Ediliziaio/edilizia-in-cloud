import { describe, expect, it } from "vitest";
import { clausoleFissate } from "../../../supabase/functions/_shared/clausoleFirma";
import { ARTICOLI_APPROVAZIONE_SPECIFICA, clausoleFirmaSubappalto } from "@/lib/subappaltatori/contrattoSubappaltoHtml";

describe("clausole fissate dal documento (31/10/2026)", () => {
  it("accetta l'elenco del documento, anche vuoto", () => {
    expect(clausoleFissate([{ id: "doc-1", testo: " Penali " }])).toEqual([{ id: "doc-1", testo: "Penali" }]);
    expect(clausoleFissate([])).toEqual([]);
  });
  it("rifiuta ciò che non è un elenco pulito: vale la regola di prima", () => {
    expect(clausoleFissate(undefined)).toBeNull();
    expect(clausoleFissate("x")).toBeNull();
    expect(clausoleFissate([{ id: "a", testo: "" }])).toBeNull();
    expect(clausoleFissate([{ id: "a", testo: "x" }, { id: "a", testo: "y" }])).toBeNull();
    expect(clausoleFissate(Array.from({ length: 61 }, (_, i) => ({ id: `c${i}`, testo: "x" })))).toBeNull();
  });
});

describe("subappalto: si approvano gli articoli di QUESTO contratto", () => {
  it("numero e testo dell'articolo come scritti nel contratto, anche riscritti dall'azienda", () => {
    const articoli = [
      { titolo: "Premesse e oggetto", paragrafi: ["…"] },
      { titolo: "Penali per ritardi e comportamenti scorretti", paragrafi: ["Penale di 50 € al giorno.", "Massimo il 10%."] },
    ];
    const c = clausoleFirmaSubappalto(articoli);
    expect(c).toHaveLength(ARTICOLI_APPROVAZIONE_SPECIFICA.length);
    expect(c[1]).toEqual({ id: "sub-art-2", testo: "Art. 2 – Penali per ritardi e comportamenti scorretti: Penale di 50 € al giorno. Massimo il 10%." });
    // Un articolo che il contratto non ha resta col solo titolo, come nel PDF.
    expect(c[0].testo).toBe("Pagamenti");
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
  });
});
