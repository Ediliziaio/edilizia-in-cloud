import { describe, it, expect } from "vitest";
import { calcRigaImporto, calcTotaliComputo, calcPrezzoVoce } from "@/lib/ristrutturazione/calcoli";

describe("calcoli ristrutturazione", () => {
  it("importo riga = qty*prezzo*(1-sconto), mai NaN", () => {
    expect(calcRigaImporto({ quantita: 10, prezzo_unitario: 25, sconto_pct: 10 })).toBe(225);
    expect(calcRigaImporto({ quantita: NaN, prezzo_unitario: 25, sconto_pct: 0 })).toBe(0);
  });
  it("prezzo voce = (mat+mano)*(1+ricarico)", () => {
    expect(calcPrezzoVoce({ costo_materiali: 40, costo_manodopera: 60, ricarico_pct: 20 })).toBe(120);
  });
  it("totali computo aggregano imponibile, iva, totale, margine per-capitolo", () => {
    const r = calcTotaliComputo(
      [
        { capitolo_nome: "Demolizioni", quantita: 10, prezzo_unitario: 25, sconto_pct: 0, costo_materiali: 5, costo_manodopera: 15 },
        { capitolo_nome: "Demolizioni", quantita: 2, prezzo_unitario: 100, sconto_pct: 0, costo_materiali: 0, costo_manodopera: 50 },
        { capitolo_nome: "Murature", quantita: 5, prezzo_unitario: 40, sconto_pct: 50, costo_materiali: 10, costo_manodopera: 10 },
      ],
      { sconto_pct: 0, iva_pct: 22 },
    );
    expect(r.imponibile).toBe(550); // 250 + 200 + 100
    expect(r.iva).toBe(121);
    expect(r.totale).toBe(671);
    expect(r.perCapitolo.find((c) => c.nome === "Demolizioni")!.imponibile).toBe(450);
    expect(r.margineEur).toBeGreaterThan(0);
  });
});
