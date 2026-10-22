import { describe, expect, it } from "vitest";
import { bozzaFatturaCertificato } from "@/lib/computo/fatturaCertificato";

/** Dati inventati (repo pubblico). */
const certificato = { numero: 2, data: "2026-03-05", imponibile: 19104, aliquota_iva: 10, split_payment: true };
const sal = { numero: 3, lavori_a_tutto: "2026-02-28" };
const computo = { oggetto_lavori: "Rifacimento della copertura della scuola", stazione_appaltante: "Comune di Esempio", cig: "1234567ABC", cup: "J11B22000000001" };

describe("fattura dal certificato di pagamento", () => {
  it("una riga per l'imponibile del certificato, split payment, CIG e CUP, commessa", () => {
    const b = bozzaFatturaCertificato({ certificato, sal, computo, orderId: "ordine-1", orderCode: "C-12" });
    expect(b.tipo).toBe("fattura_pa");
    expect(b.esigibilita_iva).toBe("S");
    expect([b.cig, b.cup, b.ordine_id]).toEqual(["1234567ABC", "J11B22000000001", "ordine-1"]);
    expect(b.righe).toHaveLength(1);
    expect(b.righe[0]).toMatchObject({ quantita: 1, prezzo_unitario: 19104, aliquota_iva: "10", imponibile: 19104, imposta: 1910.4, totale_riga: 21014.4 });
    expect(b.righe[0].descrizione).toContain("SAL n. 3 a tutto il 28/02/2026");
    expect(b.righe[0].descrizione).toContain("certificato di pagamento n. 2 del 05/03/2026");
    expect(b.note_documento).toContain("Rif. commessa C-12");
    expect(b.note_documento).toContain("17-ter");
    // Senza anagrafica: il nome della stazione appaltante, cliente PA, da completare.
    expect(b.cliente_snapshot).toMatchObject({ ragione_sociale: "Comune di Esempio", tipo_cliente: "PA" });
    expect(b.anagrafica_id).toBeUndefined();
  });

  it("con l'anagrafica del cliente ne prende i dati; CIG e CUP del computo hanno la precedenza", () => {
    const b = bozzaFatturaCertificato({
      certificato: { ...certificato, split_payment: false }, sal, computo: { ...computo, cup: null }, orderId: "ordine-1",
      anagrafica: { id: "ana-1", ragione_sociale: "Comune di Esempio", codice_fiscale: "00000000000", codice_sdi: "UFABCD", tipo_cliente: "PA", cig: "ALTRO", cup: "CUP-ANAGRAFICA", metodo_pagamento_default: "MP05" },
    });
    expect(b.tipo).toBe("fattura_pa");
    expect(b.esigibilita_iva).toBe("I");
    expect([b.cig, b.cup, b.anagrafica_id, b.metodo_pagamento_codice]).toEqual(["1234567ABC", "CUP-ANAGRAFICA", "ana-1", "MP05"]);
    expect(b.cliente_snapshot).toMatchObject({ codice_sdi: "UFABCD", tipo_cliente: "PA", indirizzo_nazione: "IT" });
    expect(b.note_documento).not.toContain("17-ter");
  });

  it("committente privato senza split payment: fattura normale", () => {
    const b = bozzaFatturaCertificato({
      certificato: { ...certificato, split_payment: false }, sal, computo: { oggetto_lavori: null, stazione_appaltante: null }, orderId: "o",
      anagrafica: { id: "a", ragione_sociale: "Esempio Srl", tipo_cliente: "B2B" },
    });
    expect(b.tipo).toBe("fattura");
    expect(b.cig).toBeUndefined();
  });
});
