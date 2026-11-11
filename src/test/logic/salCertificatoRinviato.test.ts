// Il rinviato al prossimo certificato (10/11/2026): l'arrotondamento del netto torna nel certificato dopo.
import { describe, expect, it } from "vitest";
import { certificatoProposto, nettoCertificato } from "@/lib/orders/salCertificato";
import { arrotondamentoAbituale, certificatoNelModulo } from "@/lib/orders/salNuovoVerbale";
import { righeSal } from "@/lib/orders/fatturaDaLavori";

// Il certificato n. 2 di una commessa vera: 107.427,62 arrotondato a 107.400.
const c2 = { lavori_contrattuali: 383162.5, varianti: 0, ritenuta_pct: 3, ritenuta: 11494.88, recupero_anticipazione: 0, altre_detrazioni: 0, altre_detrazioni_nota: null as string | null, acconti_precedenti: 264240, rinviato: 27.62, netto: 107400 };

describe("Rinviato al prossimo certificato", () => {
  it("il netto lo toglie, come una detrazione", () => {
    expect(nettoCertificato(c2)).toBe(107400);
  });

  it("il certificato dopo lo restituisce: acconti = quanto certificato davvero", () => {
    const c3 = certificatoProposto(434321.59, c2, 383162.5);
    expect(c3.acconti_precedenti).toBe(264240 + 107400);
    expect(c3.altre_detrazioni).toBe(0);
    // 434.321,59 − 3% (13.029,65) − 371.640 = 49.651,94: i 27,62 tornano al cliente
    expect(c3.netto).toBe(49651.94);
  });

  it("nel modulo nuovo si arrotonda a 10 o 100 €, e il resto va nel rinviato", () => {
    const c3 = certificatoNelModulo({ cumulativo: 434321.59, precedente: c2, giaMaturato: 383162.5, arrotonda: 100 });
    expect([c3.netto, c3.rinviato]).toEqual([49600, 51.94]);
    const a10 = certificatoNelModulo({ cumulativo: 434321.59, precedente: c2, giaMaturato: 383162.5, arrotonda: 10 });
    expect([a10.netto, a10.rinviato]).toEqual([49650, 1.94]);
    // e il SAL n. 4 restituisce i 51,94
    const c4 = certificatoProposto(500000, c3, 434321.59);
    expect(c4.acconti_precedenti).toBe(371640 + 49600);
  });

  it("propone lo stesso arrotondamento del certificato prima", () => {
    expect(arrotondamentoAbituale(c2)).toBe(100);
    expect(arrotondamentoAbituale({ ...c2, rinviato: 0 })).toBe(0);
    expect(arrotondamentoAbituale(null)).toBe(0);
  });

  it("la fattura del SAL prende il netto del certificato, arrotondato", () => {
    const c3 = certificatoNelModulo({ cumulativo: 434321.59, precedente: c2, giaMaturato: 383162.5, arrotonda: 100 });
    const sal2 = { id: "s2", numero_sal: 2, stato: "approvato", importo_totale: 383162.5, sal_certificati: c2 };
    const sal3 = { id: "s3", numero_sal: 3, stato: "emesso", importo_totale: 434321.59, sal_certificati: c3 };
    const righe = righeSal(sal3, [sal2, sal3], 10);
    expect(righe).toHaveLength(1);
    expect(righe[0].prezzo_unitario).toBe(49600);
    expect(righe[0].descrizione).toContain("Certificato di pagamento n. 3");
  });
});
