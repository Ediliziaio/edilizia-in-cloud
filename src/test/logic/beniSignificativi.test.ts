// Beni significativi (art. 7 c. 1 lett. b L. 488/1999, DM 29/12/1999): IVA al
// 10% sui beni solo fino al valore del resto della prestazione, e la fattura
// che lo dice. Stesso conto dei preventivi serramenti (calcolaIvaMista).
import { describe, it, expect } from "vitest";
import { ripartoBeniSignificativi, righeBeniSignificativi } from "@/lib/fatturazione/beniSignificativi";

describe("beni significativi", () => {
  it("caldaia 2.000 € con 800 € di manodopera: 1.600 al 10%, 1.200 al 22%", () => {
    // Limite: i beni stanno al 10% fino a 800 (il resto della prestazione).
    expect(ripartoBeniSignificativi({ valoreBeni: 2000, valoreAltro: 800 })).toEqual({ imponibile10: 1600, imponibile22: 1200 });
  });

  it("beni che non superano il resto: tutto al 10%", () => {
    expect(ripartoBeniSignificativi({ valoreBeni: 1000, valoreAltro: 1500 })).toEqual({ imponibile10: 2500, imponibile22: 0 });
    expect(ripartoBeniSignificativi({ valoreBeni: 1000, valoreAltro: 1000 })).toEqual({ imponibile10: 2000, imponibile22: 0 });
  });

  it("solo beni senza posa: niente 10% sui beni", () => {
    expect(ripartoBeniSignificativi({ valoreBeni: 3000, valoreAltro: 0 })).toEqual({ imponibile10: 0, imponibile22: 3000 });
  });

  it("le righe dicono cosa è stato fornito e per quanto, e il totale torna", () => {
    const righe = righeBeniSignificativi(
      { intervento: "Sostituzione caldaia", beni: "Caldaia a condensazione 25 kW", valoreBeni: 2000, valoreAltro: 800 },
      3,
    );
    expect(righe).toHaveLength(2);
    expect(righe[0]).toMatchObject({ numero_linea: 3, aliquota_iva: "10", prezzo_unitario: 1600, quantita: 1 });
    expect(righe[0].descrizione).toMatch(/Sostituzione caldaia\. Beni significativi forniti: Caldaia a condensazione 25 kW, valore 2\.?000,00 €/);
    expect(righe[0].descrizione).toMatch(/DM 29\/12\/1999/);
    expect(righe[1]).toMatchObject({ numero_linea: 4, aliquota_iva: "22", prezzo_unitario: 1200 });
    expect(righe[0].prezzo_unitario + righe[1].prezzo_unitario).toBe(2800);
  });

  it("sotto il limite una riga sola", () => {
    expect(righeBeniSignificativi({ intervento: "Posa infissi", beni: "Infissi in PVC", valoreBeni: 900, valoreAltro: 1200 }, 1)).toHaveLength(1);
  });
});
