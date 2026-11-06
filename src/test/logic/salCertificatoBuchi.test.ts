import { describe, expect, it } from "vitest";
import { certificatoBloccato, certificatoProposto, restanoCertificato } from "@/lib/orders/salCertificato";
import { clausoleApplicabili, componiFattura } from "@/lib/fatturazione/clausoleFattura";

// Numeri inventati. Certificato del SAL 10: lordo 100.000, ritenuta 5%, restano 95.000.
const cert10 = { lavori_contrattuali: 100_000, varianti: 0, ritenuta_pct: 5, ritenuta: 5_000, recupero_anticipazione: 0, altre_detrazioni: 0, acconti_precedenti: 60_000, netto: 35_000 };

describe("Certificato nuovo dopo SAL senza certificato (06/11/2026)", () => {
  it("gli acconti contano anche quanto è maturato dopo l'ultimo certificato", () => {
    // SAL 11 senza certificato ha portato il cumulativo a 130.000 (fatturati 30.000 di differenza); SAL 12 a 150.000.
    const p = certificatoProposto(150_000, cert10, 130_000);
    expect(restanoCertificato(cert10)).toBe(95_000);
    expect(p.acconti_precedenti).toBe(125_000);
    // Netto: 150.000 − 7.500 di ritenuta − 125.000 = 17.500, non i 47.500 di prima (30.000 rifatturati).
    expect(p.netto).toBe(17_500);
  });

  it("col certificato subito prima non cambia niente", () => {
    expect(certificatoProposto(150_000, cert10, 100_000).acconti_precedenti).toBe(95_000);
  });

  it("senza certificati prima, gli acconti sono il maturato", () => {
    expect(certificatoProposto(150_000, null, 130_000).acconti_precedenti).toBe(130_000);
  });
});

describe("Certificato che non si cambia più", () => {
  const conCert = { sal_certificati: [cert10] };
  const tutti = [
    { numero_sal: 10, stato: "approvato", ...conCert },
    { numero_sal: 11, stato: "approvato" },
    { numero_sal: 12, stato: "approvato", ...conCert },
    { numero_sal: 13, stato: "bozza", ...conCert },
  ];
  it("se la sua rata è fatturata o incassata", () => {
    expect(certificatoBloccato({ numero_sal: 12, installment_id: "r1" }, tutti, [{ id: "r1", documento_fiscale_id: "f1" }])).toMatch(/già fatturata/);
    expect(certificatoBloccato({ numero_sal: 12, installment_id: "r1" }, tutti, [{ id: "r1", is_paid: true }])).toMatch(/già incassata/);
  });
  it("se un certificato dopo parte da questo; una bozza dopo non conta", () => {
    expect(certificatoBloccato({ numero_sal: 10 }, tutti)).toMatch(/SAL n\. 12/);
    expect(certificatoBloccato({ numero_sal: 12 }, tutti)).toBeNull();
  });
});

describe("Trattenuta a garanzia con il certificato", () => {
  const righe = [{ id: "sal:x:0", numero_linea: 1, descrizione: "Certificato n. 12", quantita: 1, unita_misura: "a corpo", prezzo_unitario: 17_500, aliquota_iva: "10", imponibile: 17_500, imposta: 1_750, totale_riga: 19_250 }];
  it("non si toglie una seconda volta: la fattura resta il netto del certificato", () => {
    const attive = clausoleApplicabili(["trattenuta_garanzia", "ritenuta_garanzia_pa", "rif_sal_certificato"], { ritenutaGiaTolta: true });
    expect(attive).toEqual(["rif_sal_certificato"]);
    const f = componiFattura(righe as never, attive);
    expect(f.trattenute).toEqual([]);
    expect(f.righe.reduce((t, r) => t + r.imponibile, 0)).toBe(17_500);
  });
  it("senza certificato la trattenuta resta scelta dall'utente", () => {
    expect(clausoleApplicabili(["trattenuta_garanzia"], { ritenutaGiaTolta: false })).toEqual(["trattenuta_garanzia"]);
  });
});
