import { describe, expect, it } from "vitest";
import { certificatoDelSal, certificatoPrecedente, certificatoProposto, leggiImportoItaliano, nettoCertificato, restanoCertificato } from "@/lib/orders/salCertificato";
import { fatturatoDaDocumenti, righeSal, salInFattura, type SalPerFattura } from "@/lib/orders/fatturaDaLavori";

// Numeri inventati: lordo 1.100, ritenuta 110, recupero 100, acconti 500, netto 390.
const certificato = {
  lavori_contrattuali: 1000,
  varianti: 100,
  ritenuta_pct: 10,
  ritenuta: 110,
  recupero_anticipazione: 100,
  altre_detrazioni: 0,
  acconti_precedenti: 500,
  netto: 390,
};

describe("Certificato di pagamento", () => {
  it("dal lordo al netto", () => {
    expect(restanoCertificato(certificato)).toBe(890);
    expect(nettoCertificato(certificato)).toBe(390);
  });

  it("il nuovo certificato parte dal precedente", () => {
    const nuovo = certificatoProposto(2000, certificato);
    expect(nuovo.acconti_precedenti).toBe(890);
    expect(nuovo.ritenuta).toBe(200);
    expect(nuovo.varianti).toBe(100);
    expect(nuovo.lavori_contrattuali).toBe(1900);
  });

  it("senza certificato prima, gli acconti sono il già maturato e non zero", () => {
    expect(certificatoProposto(2000, null, 1500).acconti_precedenti).toBe(1500);
    expect(certificatoProposto(2000, null).acconti_precedenti).toBe(0);
  });

  it("riparte dall'ultimo certificato emesso, non dalle bozze né dai SAL senza certificato", () => {
    const tutti = [
      { numero_sal: 1, stato: "approvato", sal_certificati: certificato },
      { numero_sal: 2, stato: "approvato", sal_certificati: null },
      { numero_sal: 3, stato: "bozza", sal_certificati: { ...certificato, netto: 1 } },
    ];
    expect(certificatoPrecedente({ numero_sal: 4 }, tutti)?.netto).toBe(390);
    expect(certificatoPrecedente({ numero_sal: 1 }, tutti)).toBeNull();
  });

  it("una riga vuota non è un certificato", () => {
    expect(certificatoDelSal(null)).toBeNull();
    expect(certificatoDelSal([])).toBeNull();
    expect(certificatoDelSal([certificato])?.netto).toBe(390);
  });

  it("legge gli importi come li scrive una persona", () => {
    expect(leggiImportoItaliano("1.234,56")).toBe(1234.56);
    expect(leggiImportoItaliano("1234,56")).toBe(1234.56);
    expect(leggiImportoItaliano("1.234")).toBe(1234);
    expect(leggiImportoItaliano("1234.56")).toBe(1234.56);
    expect(leggiImportoItaliano("abc")).toBeNaN();
    expect(leggiImportoItaliano("")).toBeNaN();
  });
});

describe("In fattura va il netto del certificato", () => {
  const prima: SalPerFattura = { id: "a", numero_sal: 1, stato: "approvato", importo_totale: 600 };
  const ultimo: SalPerFattura = { id: "b", numero_sal: 2, stato: "approvato", importo_totale: 1100, sal_certificati: certificato };

  it("non la differenza dei cumulativi", () => {
    expect(salInFattura(ultimo, [prima, ultimo], { salFatturati: new Set() }, []).quota).toBe(390);
    const righe = righeSal(ultimo, [prima, ultimo], 0);
    expect(righe).toHaveLength(1);
    expect(righe[0].descrizione).toContain("Certificato di pagamento n. 2");
  });

  it("la riga del certificato conta come già fatturata", () => {
    const righe = righeSal(ultimo, [prima, ultimo], 0);
    const fatturato = fatturatoDaDocumenti([{ tipo: "fattura", stato: "emessa", righe: righe.map((r) => ({ id: r.id, imponibile: 390 })) }] as never);
    expect(fatturato.salFatturati.has("b")).toBe(true);
  });

  it("senza certificato resta la differenza", () => {
    const senza: SalPerFattura = { ...ultimo, sal_certificati: null };
    expect(salInFattura(senza, [prima, senza], { salFatturati: new Set() }, []).quota).toBe(500);
  });
});
